/**
 * Bootstrap：服务器启动期自动准备工作
 * ----------------------------------------------------------------------
 * 1. 跑 db/migrations/*.sql 把 schema 升级到最新
 * 2. 把 references/builtin/ 下的内置参考 skill 灌入 evaluation_standards 表
 *    - 用 upsert：本地文件版本始终覆盖数据库版本（可通过 PR 升级）
 *    - is_builtin = TRUE，不允许从 UI 删除
 *
 * 失败处理：
 *   - migration 失败 → 抛错让进程退出（避免运行在残缺 schema 上）
 *   - seed 失败 → 警告但继续启动（用户可后台手动 seed）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializePool, query, EvaluationStandards } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ─── 跑 migrations ──────────────────────────────────────────────────────
async function runMigrations() {
  const migrationsDir = path.join(PROJECT_ROOT, 'db', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.warn('[bootstrap] db/migrations 目录不存在，跳过 migration');
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    try {
      // Neon serverless driver 一次只能执行一条语句
      // 把 sql 文件按"行末分号 + 空行"拆分，过滤注释行
      const statements = splitSqlStatements(sql);
      for (const stmt of statements) {
        if (!stmt.trim()) continue;
        await query(stmt);
      }
      console.log(`[bootstrap] ✓ migration ${file}`);
    } catch (err) {
      console.error(`[bootstrap] ✗ migration ${file} 失败:`, err.message);
      throw err;
    }
  }
}

/**
 * 朴素 SQL 拆分：按分号+换行拆分，跳过 -- 和 /* * / 注释，处理 DO $$..$$ 块
 */
function splitSqlStatements(sql) {
  const stmts = [];
  let cur = '';
  let inDollarBlock = false;
  const lines = sql.split('\n');
  for (const lineRaw of lines) {
    const line = lineRaw;
    const stripped = line.trim();
    // 跳过纯注释行
    if (!inDollarBlock && (stripped.startsWith('--') || stripped === '')) {
      continue;
    }
    // 检测 $$ 块（PG 函数体 / DO 块）
    const dollarMatches = (line.match(/\$\$/g) || []).length;
    if (dollarMatches % 2 === 1) {
      inDollarBlock = !inDollarBlock;
    }
    cur += line + '\n';
    // 不在 $$ 块内、行尾分号 → 切分
    if (!inDollarBlock && stripped.endsWith(';')) {
      stmts.push(cur);
      cur = '';
    }
  }
  if (cur.trim()) stmts.push(cur);
  return stmts;
}

// ─── seed 内置参考 skill ────────────────────────────────────────────────
const BUILTIN_STANDARDS = [
  {
    folder: 'skill-evaluator',
    standardKey: 'skill-evaluator',
    displayName: '通用评估（generic-skill-rubric）',
    description: '对 Codex skill 进行确定性的通用评估：元数据、流程、渐进披露、资源、验证、安全 6 维度。',
    rubricVersion: 'generic-skill-rubric-v1',
    totalScore: 100,
    scriptFilename: 'evaluate_skill.py',
    displayOrder: 10,
  },
  {
    folder: 'ved-evaluate-skill-rules',
    standardKey: 'ved-evaluate-skill-rules',
    displayName: '火山专项评估（一期：命名与结构）',
    description: '火山 VolcanoDesign AI Skill 一期评估：ved- 前缀、kebab-case、命名结构、目录结构。',
    rubricVersion: 'volcano-skill-rules-v1',
    totalScore: 100,
    scriptFilename: 'evaluate_volcano_rules.py',
    displayOrder: 20,
  },
];

async function seedBuiltinStandards() {
  const builtinDir = path.join(PROJECT_ROOT, 'references', 'builtin');
  if (!fs.existsSync(builtinDir)) {
    console.warn('[bootstrap] references/builtin 不存在，跳过 seed');
    return;
  }

  for (const meta of BUILTIN_STANDARDS) {
    const folder = path.join(builtinDir, meta.folder);
    const skillMdPath = path.join(folder, 'SKILL.md');
    const scriptPath = path.join(folder, 'scripts', meta.scriptFilename);
    const refsMdPath = path.join(folder, 'references', 'evaluation-standard.md');

    if (!fs.existsSync(skillMdPath) || !fs.existsSync(scriptPath)) {
      console.warn(`[bootstrap] ${meta.standardKey} 缺少必需文件，跳过`);
      continue;
    }

    const skillMdContent = fs.readFileSync(skillMdPath, 'utf-8');
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    const referencesMd = fs.existsSync(refsMdPath) ? fs.readFileSync(refsMdPath, 'utf-8') : null;

    try {
      await EvaluationStandards.upsertByKey({
        standardKey: meta.standardKey,
        displayName: meta.displayName,
        description: meta.description,
        rubricVersion: meta.rubricVersion,
        totalScore: meta.totalScore,
        skillMdContent,
        scriptFilename: meta.scriptFilename,
        scriptContent,
        referencesMd,
        isBuiltin: true,
        displayOrder: meta.displayOrder,
        createdBy: 'system-bootstrap',
      });
      console.log(`[bootstrap] ✓ seed builtin standard: ${meta.standardKey}`);
    } catch (err) {
      console.warn(`[bootstrap] ✗ seed ${meta.standardKey} 失败:`, err.message);
    }
  }
}

// ─── 入口 ──────────────────────────────────────────────────────────────
export async function runBootstrap() {
  if (!process.env.DATABASE_URL) {
    console.warn('[bootstrap] DATABASE_URL 未设置，跳过 migration & seed');
    return;
  }
  initializePool(process.env.DATABASE_URL);
  console.log('[bootstrap] running migrations...');
  await runMigrations();
  console.log('[bootstrap] seeding builtin standards...');
  await seedBuiltinStandards();
  console.log('[bootstrap] ✓ done');
}
