/**
 * POST /api/evaluate
 * ----------------------------------------------------------------------
 * 对用户上传的 skill 执行全部启用的评估标准（不依赖 LLM）。
 *
 * 入参（两种方式）：
 *   A. 二进制 zip：Content-Type: application/zip，body 为 zip 文件
 *   B. JSON：{ skill_zip_base64: "..."  | skill_id: "uuid" }
 *      - skill_zip_base64：直接传 base64 编码的 zip
 *      - skill_id：从 skills 表读已入库的 skill（仅评估 SKILL.md 内容）
 *
 * 可选 query：
 *   ?standards=skill-evaluator,ved-evaluate-skill-rules  仅跑指定 key
 *   ?save=true                                            存评估结果到数据库
 *
 * 返回：
 *   {
 *     fingerprint: "<sha256>",
 *     duration_ms: 1234,
 *     results: [
 *       {
 *         standard: { id, standard_key, display_name, rubric_version, total_score },
 *         report: { score, grade, generic_assessment, category_scores, checks, ... },
 *         saved_id: "<eval_result_uuid>" | null,
 *         error: null
 *       }
 *     ]
 *   }
 */

import AdmZip from 'adm-zip';
import { initializePool, query, AuditLogs, Skills } from '../lib/db.js';
import { evaluateSkillAgainstAllStandards } from '../lib/evaluator.js';

export default async function handler(req, res) {
  try {
    initializePool(process.env.DATABASE_URL);
  } catch (e) {
    console.error('[evaluate] DB init failed:', e.message);
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTs = Date.now();

  try {
    // ─── 解析输入 → 拿到 zipBuffer ─────────────────────────────────
    let zipBuffer = null;
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('application/zip') || contentType.includes('application/octet-stream')) {
      if (!Buffer.isBuffer(req.body)) {
        return res.status(400).json({ error: 'zip body 解析失败' });
      }
      zipBuffer = req.body;
    } else if (contentType.includes('application/json')) {
      const { skill_zip_base64, skill_id, skill_content, skill_name } = req.body || {};

      if (skill_zip_base64) {
        try {
          zipBuffer = Buffer.from(skill_zip_base64, 'base64');
        } catch {
          return res.status(400).json({ error: 'skill_zip_base64 解码失败' });
        }
      } else if (skill_content) {
        // 直接传入 skill 文本（前端最常用方式）
        zipBuffer = wrapSkillContentAsZip({
          name: skill_name || 'skill',
          skill_content,
        });
      } else if (skill_id && isValidUUID(skill_id)) {
        // skill_id 必须是合法 UUID 才查 DB；非 UUID 走 skill_content 路径
        const skill = await Skills.getById(skill_id);
        if (!skill) return res.status(404).json({ error: 'skill 不存在' });
        zipBuffer = wrapSkillContentAsZip(skill);
      } else {
        return res.status(400).json({
          error: '需要 skill_content / skill_zip_base64 / skill_id (UUID)',
        });
      }
    } else {
      return res.status(400).json({
        error: '不支持的 Content-Type',
        supported: ['application/zip', 'application/octet-stream', 'application/json'],
      });
    }

    if (!zipBuffer || zipBuffer.length === 0) {
      return res.status(400).json({ error: 'skill 数据为空' });
    }

    // ─── 解析 query options ────────────────────────────────────────
    const standardsFilter = req.query.standards
      ? String(req.query.standards).split(',').map((s) => s.trim()).filter(Boolean)
      : null;
    const saveResults = req.query.save === 'true';
    // 仅当 skill_id 是合法 UUID 时才作为 FK 入库；否则置 null（前端临时 skill 无 DB 记录）
    const skillIdForSave = isValidUUID(req.body?.skill_id) ? req.body.skill_id : null;
    const skillNameForSave = req.body?.skill_name || null;
    const userId = req.headers['x-user-id'] || 'anonymous';

    // ─── 评估 ──────────────────────────────────────────────────────
    let results;
    try {
      results = await evaluateSkillAgainstAllStandards(zipBuffer, {
        standardKeys: standardsFilter,
      });
    } catch (err) {
      return res.status(500).json({ error: '评估失败', details: err.message });
    }

    // ─── 可选：把每个 result 存入 evaluation_results ─────────────
    if (saveResults) {
      for (const r of results) {
        try {
          const saved = await saveEvaluationResult({
            skillId: skillIdForSave,
            standardId: r.standard.id,
            fingerprint: r.fingerprint,
            report: r.report,
            error: r.error,
            duration: r.duration_ms,
          });
          r.saved_id = saved?.id || null;
        } catch (err) {
          console.error('[evaluate] save failed:', err.message);
          r.saved_id = null;
        }
      }
      await AuditLogs.create({
        userId,
        action: 'EVALUATE_SKILL',
        entityType: 'skill',
        entityId: skillIdForSave,
        changes: {
          standards: results.map((r) => r.standard.standard_key),
          fingerprint: results[0]?.fingerprint,
        },
      });
    }

    return res.status(200).json({
      fingerprint: results[0]?.fingerprint || null,
      duration_ms: Date.now() - startTs,
      results,
    });
  } catch (err) {
    console.error('[evaluate] error:', err);
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
}

/**
 * 把已入库 skill（仅 skill_content 文本）包装成最小 zip
 * 这样 Python 脚本仍能按文件夹结构解析
 */
function wrapSkillContentAsZip(skill) {
  const zip = new AdmZip();
  const safeName = (skill.name || 'skill').replace(/[^\w-]/g, '-');
  zip.addFile(
    `${safeName}/SKILL.md`,
    Buffer.from(skill.skill_content || '', 'utf-8')
  );
  return zip.toBuffer();
}

// 简单 UUID v1-v5 校验：标准 8-4-4-4-12 hex 格式
function isValidUUID(s) {
  if (!s || typeof s !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

async function saveEvaluationResult({ skillId, standardId, fingerprint, report, error, duration }) {
  if (error) {
    const r = await query(
      `INSERT INTO evaluation_results (skill_id, standard_id, fingerprint,
                                       status, error_message, evaluation_duration_ms)
       VALUES ($1, $2, $3, 'error', $4, $5)
       RETURNING id, created_at`,
      [skillId, standardId, fingerprint, error, duration]
    );
    return r.rows[0];
  }

  const score = report.score ?? null;
  const grade = report.grade ?? null;
  const tag = report.generic_assessment?.tag || report.volcano_assessment?.tag || null;
  const rubricVersion = report.rubric_version || report.standard_version || null;

  const r = await query(
    `INSERT INTO evaluation_results (
       skill_id, standard_id, fingerprint, rubric_version,
       grade, assessment_tag, final_score,
       category_scores, checks, report,
       status, evaluation_duration_ms
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'success', $11)
     RETURNING id, created_at, final_score, grade, assessment_tag`,
    [
      skillId,
      standardId,
      fingerprint,
      rubricVersion,
      grade,
      tag,
      score,
      JSON.stringify(report.category_scores || {}),
      JSON.stringify(report.checks || []),
      JSON.stringify(report),
      duration,
    ]
  );
  return r.rows[0];
}
