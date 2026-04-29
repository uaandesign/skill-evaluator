/**
 * 评估器：执行 Python 评估脚本对用户上传的 skill 打分
 * ----------------------------------------------------------------------
 * 流程：
 *   1. 接收用户上传 skill（zip Buffer 或 解压好的目录路径）
 *   2. 解压到 /tmp/eval-{uuid}/skill/
 *   3. 从数据库读取启用的 evaluation_standards 列表
 *   4. 对每个 standard：
 *      a. 把 standard.script_content 写到 /tmp/eval-{uuid}/standards/{key}/scripts/{filename}
 *      b. 把 standard.skill_md_content 写到 /tmp/eval-{uuid}/standards/{key}/SKILL.md
 *         (Python 脚本可能会读 SKILL.md 获取自身 metadata)
 *      c. spawn python3 path/to/script.py path/to/target-skill --format json
 *      d. 解析 stdout 的 JSON 报告
 *   5. 清理临时目录，返回 [{ standard, report }, ...]
 *
 * 可靠性要点：
 *   - 子进程超时（30s）防止脚本挂死
 *   - 自动检测 python3 / python 命令位置
 *   - 子进程 stderr 单独捕获，方便排错
 *   - 失败时返回 error 但不抛出，让其他 standard 继续评估
 */

import { spawn } from 'child_process';
import { promises as fsp, mkdtempSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { EvaluationStandards } from './db.js';

const PYTHON_CMD = process.env.PYTHON_CMD || 'python3';
const SCRIPT_TIMEOUT_MS = 30_000;

/**
 * 把上传的 skill zip 解压到临时目录，返回 skill 根路径
 */
export function extractSkillZip(zipBuffer, baseDir) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip
    .getEntries()
    .filter((e) => !e.entryName.includes('__MACOSX') && !e.entryName.includes('.DS_Store'));

  if (entries.length === 0) {
    throw new Error('zip 包为空');
  }

  // 找到 SKILL.md 所在目录作为 skill 根
  const skillEntry = entries.find(
    (e) => !e.isDirectory && (e.entryName === 'SKILL.md' || e.entryName.endsWith('/SKILL.md'))
  );
  if (!skillEntry) {
    throw new Error('zip 包中找不到 SKILL.md');
  }

  // 解压到 baseDir
  zip.extractAllTo(baseDir, /* overwrite */ true);

  // 计算 skill 根目录
  const skillRoot = skillEntry.entryName.replace(/SKILL\.md$/, '').replace(/\/$/, '');
  return skillRoot ? path.join(baseDir, skillRoot) : baseDir;
}

/**
 * 把一个评估标准写入临时目录，返回脚本绝对路径
 */
function writeStandardToFs(standard, baseDir) {
  const standardDir = path.join(baseDir, 'standards', standard.standard_key);
  mkdirSync(path.join(standardDir, 'scripts'), { recursive: true });
  mkdirSync(path.join(standardDir, 'references'), { recursive: true });

  writeFileSync(path.join(standardDir, 'SKILL.md'), standard.skill_md_content, 'utf-8');
  const scriptPath = path.join(standardDir, 'scripts', standard.script_filename);
  writeFileSync(scriptPath, standard.script_content, 'utf-8');
  if (standard.references_md) {
    writeFileSync(
      path.join(standardDir, 'references', 'evaluation-standard.md'),
      standard.references_md,
      'utf-8'
    );
  }
  return scriptPath;
}

/**
 * 执行一次 python 子进程，返回 stdout（应为合法 JSON 字符串）
 */
function runPython(scriptPath, targetSkillPath, timeoutMs = SCRIPT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const args = [scriptPath, targetSkillPath, '--format', 'json'];
    const child = spawn(PYTHON_CMD, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));

    child.on('error', (err) => reject(new Error(`子进程启动失败: ${err.message}`)));
    child.on('close', (code, signal) => {
      if (signal === 'SIGTERM') {
        return reject(new Error(`脚本超时（>${timeoutMs}ms）已被强制终止`));
      }
      if (code !== 0) {
        return reject(new Error(`脚本退出码 ${code}: ${stderr.slice(0, 800) || '(no stderr)'}`));
      }
      resolve(stdout);
    });
  });
}

/**
 * 主入口：对一个上传的 skill 跑全部启用的评估标准
 *
 * @param {Buffer|string} skillInput  zip Buffer 或 已解压目录路径
 * @returns {Array<{standard, report, error?}>}
 */
export async function evaluateSkillAgainstAllStandards(skillInput, options = {}) {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'skill-eval-'));
  const skillSource = path.join(tmpRoot, 'target-skill');
  mkdirSync(skillSource, { recursive: true });

  let targetSkillPath;
  try {
    if (Buffer.isBuffer(skillInput)) {
      targetSkillPath = extractSkillZip(skillInput, skillSource);
    } else if (typeof skillInput === 'string' && existsSync(skillInput)) {
      targetSkillPath = skillInput;
    } else {
      throw new Error('skillInput 必须是 zip Buffer 或已存在的目录路径');
    }
  } catch (err) {
    safeRm(tmpRoot);
    throw err;
  }

  // 计算 skill 内容指纹（SHA-256 of all file contents combined）
  const fingerprint = await fingerprintDir(targetSkillPath);

  // 选取要执行的标准
  const standardKeys = options.standardKeys; // 可选过滤
  const allStandards = await EvaluationStandards.getAll({ activeOnly: true });
  const standards = standardKeys
    ? allStandards.filter((s) => standardKeys.includes(s.standard_key))
    : allStandards;

  if (standards.length === 0) {
    safeRm(tmpRoot);
    throw new Error('未找到启用的评估标准。请先在配置中心启用至少一个标准。');
  }

  // 加载每个 standard 的完整内容（getAll 默认不返回 script/skill_md，需要逐个 getById）
  const fullStandards = [];
  for (const s of standards) {
    const full = await EvaluationStandards.getById(s.id);
    if (full) fullStandards.push(full);
  }

  // 串行执行（避免并发起 N 个 python 子进程吃光内存）
  const results = [];
  for (const std of fullStandards) {
    const startTs = Date.now();
    try {
      const scriptPath = writeStandardToFs(std, tmpRoot);
      const stdout = await runPython(scriptPath, targetSkillPath);
      let report;
      try {
        report = JSON.parse(stdout);
      } catch (e) {
        throw new Error(`脚本输出不是合法 JSON：${stdout.slice(0, 200)}`);
      }
      results.push({
        standard: pickStandardMeta(std),
        fingerprint,
        report,
        duration_ms: Date.now() - startTs,
      });
    } catch (err) {
      results.push({
        standard: pickStandardMeta(std),
        fingerprint,
        error: err.message,
        duration_ms: Date.now() - startTs,
      });
    }
  }

  // 清理临时目录
  safeRm(tmpRoot);
  return results;
}

function pickStandardMeta(std) {
  return {
    id: std.id,
    standard_key: std.standard_key,
    display_name: std.display_name,
    rubric_version: std.rubric_version,
    total_score: std.total_score,
    is_builtin: std.is_builtin,
  };
}

async function fingerprintDir(dir) {
  const hash = crypto.createHash('sha256');
  async function visit(p) {
    const stat = await fsp.stat(p);
    if (stat.isDirectory()) {
      const items = (await fsp.readdir(p)).sort();
      for (const item of items) {
        if (item === '.DS_Store' || item.startsWith('__MACOSX')) continue;
        await visit(path.join(p, item));
      }
    } else {
      const rel = path.relative(dir, p);
      const data = await fsp.readFile(p);
      hash.update(rel);
      hash.update('\0');
      hash.update(data);
      hash.update('\0');
    }
  }
  await visit(dir);
  return hash.digest('hex');
}

function safeRm(p) {
  try {
    rmSync(p, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
