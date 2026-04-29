/**
 * /api/standards - 评估标准（参考 skill）管理
 * ----------------------------------------------------------------------
 * 路由：
 *   GET    /api/standards              列出所有标准（含启用/内置状态）
 *   GET    /api/standards/:id          单个标准的详情（含 SKILL.md + 脚本内容）
 *   POST   /api/standards              上传新标准（zip body 或 JSON {standard_key, ...}）
 *   PATCH  /api/standards/:id/active   启用/停用 ({is_active: bool})
 *   DELETE /api/standards/:id          删除（仅非内置可删）
 *   GET    /api/standards/:id/versions 版本历史
 *
 * 设计原则：
 *   - 内置标准（is_builtin=true）不允许删除，可以"覆盖式上传新版本"
 *   - 上传时存一份到 evaluation_standards（当前版本）+ evaluation_standard_versions（历史）
 *   - 没有 LLM 调用，纯文件解析 + DB 操作
 */

import AdmZip from 'adm-zip';
import yaml from 'js-yaml';
import {
  initializePool,
  EvaluationStandards,
  EvaluationStandardVersions,
  AuditLogs,
} from '../lib/db.js';

// ─── 工具：解压 zip + 提取标准件三件套 ─────────────────────────────────
/**
 * 从 zip buffer 中提取 SKILL.md + scripts/*.py + references/evaluation-standard.md
 * 容错：自动忽略 __MACOSX 之类的 wrapper 目录、定位真正的 skill 根
 */
function extractStandardFromZip(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip
    .getEntries()
    .filter((e) => !e.entryName.includes('__MACOSX') && !e.entryName.includes('.DS_Store'));

  if (entries.length === 0) {
    throw new Error('zip 包为空或全部是 macOS 隐藏文件');
  }

  // 找到 SKILL.md 所在路径，把它的目录视为 skill 根
  const skillEntry = entries.find(
    (e) => !e.isDirectory && e.entryName.endsWith('/SKILL.md') || e.entryName === 'SKILL.md'
  );
  if (!skillEntry) {
    throw new Error('zip 包中找不到 SKILL.md');
  }

  // skill 根目录 = SKILL.md 的父目录
  const skillRoot = skillEntry.entryName.replace(/SKILL\.md$/, '');
  const skillMdContent = skillEntry.getData().toString('utf-8');

  // 找 scripts/*.py（取第一个 .py 文件）
  const scriptEntry = entries.find(
    (e) => !e.isDirectory && e.entryName.startsWith(skillRoot + 'scripts/') && e.entryName.endsWith('.py')
  );
  if (!scriptEntry) {
    throw new Error('zip 包中找不到 scripts/*.py 评估脚本');
  }
  const scriptFilename = scriptEntry.entryName.replace(/^.*\//, '');
  const scriptContent = scriptEntry.getData().toString('utf-8');

  // 找 references/evaluation-standard.md（可选）
  const refsEntry = entries.find(
    (e) =>
      !e.isDirectory &&
      e.entryName.startsWith(skillRoot + 'references/') &&
      e.entryName.endsWith('evaluation-standard.md')
  );
  const referencesMd = refsEntry ? refsEntry.getData().toString('utf-8') : null;

  // 从 SKILL.md frontmatter 解析 name/description
  const fm = parseFrontmatter(skillMdContent);
  if (!fm.name) {
    throw new Error('SKILL.md frontmatter 中缺少 name 字段');
  }

  // 从 SKILL.md 正文里提取 rubric_version & total_score（已有约定格式）
  const rubricVersion = extractField(skillMdContent, /标准版本[:：]\s*`?([^`\n]+?)`?\s*$/m);
  const totalScoreText = extractField(skillMdContent, /总分[:：]\s*(\d+)/m);
  const totalScore = totalScoreText ? parseInt(totalScoreText, 10) : 100;

  return {
    standardKey: fm.name,
    displayName: fm.name,
    description: fm.description || '',
    rubricVersion: rubricVersion || null,
    totalScore,
    skillMdContent,
    scriptFilename,
    scriptContent,
    referencesMd,
  };
}

/**
 * 从 markdown 顶部解析 YAML frontmatter
 * 容错：没有 frontmatter 返回空对象
 */
function parseFrontmatter(md) {
  const match = md.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    return yaml.load(match[1]) || {};
  } catch {
    return {};
  }
}

function extractField(text, regex) {
  const m = text.match(regex);
  return m ? m[1].trim() : null;
}

// ─── 路由 handler ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  try {
    initializePool(process.env.DATABASE_URL);
  } catch (e) {
    console.error('[standards] DB init failed:', e.message);
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { id, action } = req.query;

    // GET /api/standards
    if (req.method === 'GET' && !id) {
      const activeOnly = req.query.active_only === 'true';
      const list = await EvaluationStandards.getAll({ activeOnly });
      return res.status(200).json({ standards: list });
    }

    // GET /api/standards/:id  和 GET /api/standards/:id/versions
    if (req.method === 'GET' && id) {
      if (action === 'versions') {
        const versions = await EvaluationStandardVersions.listByStandard(id);
        return res.status(200).json({ versions });
      }
      const std = await EvaluationStandards.getById(id);
      if (!std) return res.status(404).json({ error: '标准不存在' });
      // 默认不返回长内容，省带宽
      const includeContent = req.query.include_content === 'true';
      if (!includeContent) {
        delete std.skill_md_content;
        delete std.script_content;
        delete std.references_md;
      }
      return res.status(200).json(std);
    }

    // POST /api/standards - 上传新标准
    if (req.method === 'POST') {
      const contentType = req.headers['content-type'] || '';
      let extracted;

      if (contentType.includes('application/json')) {
        // JSON 上传：直接给原文（用于 API 测试 / 程序化调用）
        const {
          standard_key, display_name, description, rubric_version, total_score,
          skill_md_content, script_filename, script_content, references_md,
        } = req.body || {};

        if (!standard_key || !skill_md_content || !script_content) {
          return res.status(400).json({
            error: '缺少必填字段：standard_key, skill_md_content, script_content',
          });
        }

        extracted = {
          standardKey: standard_key,
          displayName: display_name || standard_key,
          description: description || '',
          rubricVersion: rubric_version || null,
          totalScore: total_score || 100,
          skillMdContent: skill_md_content,
          scriptFilename: script_filename || 'evaluate.py',
          scriptContent: script_content,
          referencesMd: references_md || null,
        };
      } else {
        // zip 上传：从 raw body 读取 zip buffer
        // 前端用 fetch 时设 Content-Type: application/zip + body: blob
        if (!Buffer.isBuffer(req.body)) {
          return res.status(400).json({
            error: '需要 zip body（Content-Type: application/zip）或 JSON body',
          });
        }
        try {
          extracted = extractStandardFromZip(req.body);
        } catch (err) {
          return res.status(400).json({ error: 'zip 解析失败', details: err.message });
        }
      }

      const createdBy = req.headers['x-user-id'] || 'anonymous';

      // 1. upsert 到当前版本
      const std = await EvaluationStandards.upsertByKey({
        ...extracted,
        isBuiltin: false,
        displayOrder: 100,
        createdBy,
      });

      // 2. 写一条版本历史
      const versionLabel = generateVersionLabel(extracted.rubricVersion);
      await EvaluationStandardVersions.create({
        standardId: std.id,
        versionLabel,
        rubricVersion: extracted.rubricVersion,
        skillMdContent: extracted.skillMdContent,
        scriptFilename: extracted.scriptFilename,
        scriptContent: extracted.scriptContent,
        referencesMd: extracted.referencesMd,
        notes: req.headers['x-version-notes'] || null,
        uploadedBy: createdBy,
      });

      // 3. 审计日志
      await AuditLogs.create({
        userId: createdBy,
        action: 'UPLOAD_STANDARD',
        entityType: 'evaluation_standard',
        entityId: std.id,
        changes: { standard_key: extracted.standardKey, version: versionLabel },
      });

      return res.status(201).json({ ...std, version_label: versionLabel });
    }

    // PATCH /api/standards/:id/active
    if (req.method === 'PATCH' && id && action === 'active') {
      const { is_active } = req.body || {};
      if (typeof is_active !== 'boolean') {
        return res.status(400).json({ error: 'is_active 必须是 boolean' });
      }
      const updated = await EvaluationStandards.setActive(id, is_active);
      if (!updated) return res.status(404).json({ error: '标准不存在' });

      await AuditLogs.create({
        userId: req.headers['x-user-id'] || 'anonymous',
        action: is_active ? 'ENABLE_STANDARD' : 'DISABLE_STANDARD',
        entityType: 'evaluation_standard',
        entityId: id,
        changes: { is_active },
      });
      return res.status(200).json(updated);
    }

    // DELETE /api/standards/:id
    if (req.method === 'DELETE' && id) {
      const deleted = await EvaluationStandards.delete(id);
      if (!deleted) {
        return res.status(403).json({ error: '标准不存在或为内置不可删除' });
      }
      await AuditLogs.create({
        userId: req.headers['x-user-id'] || 'anonymous',
        action: 'DELETE_STANDARD',
        entityType: 'evaluation_standard',
        entityId: id,
        changes: { standard_key: deleted.standard_key },
      });
      return res.status(200).json({ success: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[standards] error:', err);
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
}

function generateVersionLabel(rubricVersion) {
  const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
  return rubricVersion ? `${rubricVersion}-${ts}` : `v-${ts}`;
}
