/**
 * Neon Serverless Database Adapter
 * ---------------------------------------------------------------
 * 使用 @neondatabase/serverless（HTTP fetch 协议）替代 node-postgres，
 * 解决 Vercel Serverless Functions 中 pg.Pool 连接挂死导致 502 的问题。
 *
 * 设计要点：
 * 1. 不维护连接池：每次 query 都通过 HTTP 单次调用，符合 Lambda 短生命周期。
 * 2. 延迟初始化：模块 import 不触发连接，避免 DATABASE_URL 缺失时函数启动崩溃。
 * 3. 接口兼容：保留 query()/initializePool()/getPool() 旧签名，
 *    迁移期间各 API handler 无需大改；后续可逐步移除 Pool 兼容层。
 * 4. 迁移友好：所有 SQL 通过 sql 标签或 query() 调用，未来切换到字节云 PG
 *    只需替换驱动实现，业务 ORM 层不受影响。
 */

import { neon, neonConfig } from '@neondatabase/serverless';

// 在 Edge / Node.js 环境下复用同一个 fetch agent，提升冷启动后的请求速度
neonConfig.fetchConnectionCache = true;

let sqlClient = null;

/**
 * 初始化 Neon SQL 客户端（兼容旧的 initializePool 签名）。
 * @param {string} connectionString - Neon 连接串，需带 ?sslmode=require
 * @returns {Function} sql 标签函数
 */
export function initializePool(connectionString) {
  if (sqlClient) return sqlClient;
  const conn = connectionString || process.env.DATABASE_URL;
  if (!conn) {
    throw new Error('DATABASE_URL 未配置：请在 Vercel 项目环境变量中设置 Neon 连接串');
  }
  sqlClient = neon(conn);
  return sqlClient;
}

/**
 * 获取已初始化的 SQL 客户端。
 * 旧代码调用 getPool().connect() 的位置已在 query() 内统一处理，
 * 仍然导出本函数仅为兼容 api/init.js 的逐条执行场景。
 */
export function getPool() {
  if (!sqlClient) {
    sqlClient = initializePool(process.env.DATABASE_URL);
  }
  return {
    // 模拟 pg.Pool.connect() 接口，让 api/init.js 的旧代码继续可用
    async connect() {
      return {
        async query(text, params) {
          return execQuery(text, params);
        },
        release() {
          /* no-op：HTTP 协议无需释放连接 */
        },
      };
    },
    async end() {
      sqlClient = null;
    },
  };
}

export async function closePool() {
  sqlClient = null;
}

/**
 * 执行参数化 SQL。返回 { rows } 与 pg 兼容。
 * @param {string} text - SQL 语句，使用 $1, $2 风格占位
 * @param {Array} params - 参数数组
 */
async function execQuery(text, params = []) {
  if (!sqlClient) {
    sqlClient = initializePool(process.env.DATABASE_URL);
  }
  // neon() 返回的函数支持 query(text, params) 风格调用
  const rows = await sqlClient(text, params);
  return { rows, rowCount: rows.length };
}

export async function query(text, params) {
  return execQuery(text, params);
}

// ─── ORM 层（保持原接口不变） ──────────────────────────────────────────────

export const Skills = {
  async create({ name, description, skillContent, categoryId, createdBy }) {
    const res = await query(
      `INSERT INTO skills (name, description, skill_content, category_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, version, version_count, created_at`,
      [name, description, skillContent, categoryId, createdBy]
    );
    return res.rows[0];
  },

  async getById(id) {
    const res = await query(
      `SELECT id, name, description, skill_content, category_id, version, version_count,
              created_at, updated_at, created_by
       FROM skills WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  async getAll(limit = 100, offset = 0) {
    const res = await query(
      `SELECT id, name, description, category_id, version, version_count,
              created_at, updated_at
       FROM skills ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return res.rows;
  },

  async update(id, { name, description, skillContent, categoryId, version, versionCount }) {
    const res = await query(
      `UPDATE skills SET
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        skill_content = COALESCE($4, skill_content),
        category_id = COALESCE($5, category_id),
        version = COALESCE($6, version),
        version_count = COALESCE($7, version_count)
       WHERE id = $1
       RETURNING id, name, version, version_count, updated_at`,
      [id, name, description, skillContent, categoryId, version, versionCount]
    );
    return res.rows[0] || null;
  },

  async delete(id) {
    const res = await query('DELETE FROM skills WHERE id = $1 RETURNING id', [id]);
    return res.rows[0] || null;
  },

  async getByName(name) {
    const res = await query(
      `SELECT id, name, description, skill_content, category_id, version, version_count,
              created_at, updated_at, created_by
       FROM skills WHERE name = $1`,
      [name]
    );
    return res.rows[0] || null;
  },
};

export const TestCases = {
  async create({ skillId, name, scenario, input, expectedOutput, testType, priority }) {
    const res = await query(
      `INSERT INTO test_cases (skill_id, name, scenario, input, expected_output, test_type, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, skill_id, name, test_type, priority, created_at`,
      [skillId, name, scenario, input, expectedOutput, testType, priority]
    );
    return res.rows[0];
  },

  async getBySkillId(skillId, limit = 50) {
    const res = await query(
      `SELECT id, skill_id, name, scenario, input, expected_output, test_type, priority, created_at
       FROM test_cases WHERE skill_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [skillId, limit]
    );
    return res.rows;
  },

  async getById(id) {
    const res = await query(
      `SELECT id, skill_id, name, scenario, input, expected_output, test_type, priority, created_at
       FROM test_cases WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  async delete(id) {
    const res = await query('DELETE FROM test_cases WHERE id = $1 RETURNING id', [id]);
    return res.rows[0] || null;
  },
};

export const ModelConfigs = {
  async create({ userId, provider, model, apiKey, baseUrl, isDefault }) {
    const res = await query(
      `INSERT INTO model_configs (user_id, provider, model, api_key, base_url, is_default)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, provider, model, is_default, created_at`,
      [userId, provider, model, apiKey, baseUrl || null, isDefault]
    );
    return res.rows[0];
  },

  async getById(id) {
    const res = await query(
      `SELECT id, user_id, provider, model, api_key, base_url, is_default, created_at, updated_at
       FROM model_configs WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  async getByUserId(userId, limit = 100) {
    const res = await query(
      `SELECT id, user_id, provider, model, api_key, base_url, is_default, created_at
       FROM model_configs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return res.rows;
  },

  async update(id, { provider, model, apiKey, baseUrl, isDefault }) {
    const res = await query(
      `UPDATE model_configs SET
        provider = COALESCE($2, provider),
        model = COALESCE($3, model),
        api_key = COALESCE($4, api_key),
        base_url = COALESCE($5, base_url),
        is_default = COALESCE($6, is_default)
       WHERE id = $1
       RETURNING id, provider, model, is_default, updated_at`,
      [id, provider, model, apiKey, baseUrl, isDefault]
    );
    return res.rows[0] || null;
  },

  async delete(id) {
    const res = await query('DELETE FROM model_configs WHERE id = $1 RETURNING id', [id]);
    return res.rows[0] || null;
  },
};

export const EvaluationResults = {
  async create(data) {
    const {
      skillId, modelId, testCaseId,
      phase1Output, phase1Success, phase1Error,
      phase2QualityDim, phase2FuncDim, phase2SafetyDim, phase2Score, phase2Eval, phase2Suggestions,
      phase3Dimensions, phase3Score, phase3Eval, phase3Suggestions,
      finalScore, duration, status, errorMessage,
    } = data;

    const res = await query(
      `INSERT INTO evaluation_results (
        skill_id, model_id, test_case_id,
        phase_1_output, phase_1_success, phase_1_error,
        phase_2_quality_dimension, phase_2_functionality_dimension, phase_2_safety_dimension,
        phase_2_score, phase_2_evaluation, phase_2_optimization_suggestions,
        phase_3_dimensions, phase_3_score, phase_3_evaluation, phase_3_optimization_suggestions,
        final_score, evaluation_duration_ms, status, error_message
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      ) RETURNING id, created_at, final_score`,
      [
        skillId, modelId, testCaseId,
        phase1Output, phase1Success, phase1Error,
        phase2QualityDim, phase2FuncDim, phase2SafetyDim, phase2Score, phase2Eval, phase2Suggestions,
        phase3Dimensions ? JSON.stringify(phase3Dimensions) : null,
        phase3Score, phase3Eval, phase3Suggestions,
        finalScore, duration, status, errorMessage,
      ]
    );
    return res.rows[0];
  },

  async getBySkillId(skillId, limit = 50, offset = 0) {
    const res = await query(
      `SELECT id, skill_id, model_id, final_score, status, created_at
       FROM evaluation_results WHERE skill_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [skillId, limit, offset]
    );
    return res.rows;
  },

  async getById(id) {
    const res = await query(
      `SELECT * FROM evaluation_results WHERE id = $1`,
      [id]
    );
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      ...row,
      phase_3_dimensions: row.phase_3_dimensions
        ? (typeof row.phase_3_dimensions === 'string'
            ? JSON.parse(row.phase_3_dimensions)
            : row.phase_3_dimensions)
        : null,
    };
  },

  async getLatestBySkillAndModel(skillId, modelId) {
    const res = await query(
      `SELECT id, skill_id, model_id, final_score, status, created_at
       FROM evaluation_results WHERE skill_id = $1 AND model_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [skillId, modelId]
    );
    return res.rows[0] || null;
  },
};

export const SkillCategories = {
  async getAll() {
    const res = await query(
      `SELECT id, category_key, category_name, description FROM skill_categories`
    );
    return res.rows;
  },

  async getById(id) {
    const res = await query(
      `SELECT id, category_key, category_name, description FROM skill_categories WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  async getByKey(key) {
    const res = await query(
      `SELECT id, category_key, category_name, description FROM skill_categories WHERE category_key = $1`,
      [key]
    );
    return res.rows[0] || null;
  },
};

// ─── 评估标准（参考 skill）ORM ─────────────────────────────────────────
// 一条 evaluation_standards 记录 = 一个评估器标准件（自带 SKILL.md + Python 脚本）
// 评估时由 server.js 把 script_content 写入临时目录后用 python3 子进程执行
export const EvaluationStandards = {
  async create({
    standardKey, displayName, description, rubricVersion, totalScore,
    skillMdContent, scriptFilename, scriptContent, referencesMd,
    isBuiltin, displayOrder, createdBy,
  }) {
    const res = await query(
      `INSERT INTO evaluation_standards (
        standard_key, display_name, description, rubric_version, total_score,
        skill_md_content, script_filename, script_content, references_md,
        is_active, is_builtin, display_order, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $11, $12)
      RETURNING id, standard_key, display_name, rubric_version, is_active, is_builtin, created_at`,
      [
        standardKey, displayName, description, rubricVersion, totalScore || 100,
        skillMdContent, scriptFilename, scriptContent, referencesMd || null,
        !!isBuiltin, displayOrder ?? 100, createdBy,
      ]
    );
    return res.rows[0];
  },

  // 按 key 更新全部内容（用于覆盖式上传新版本）
  async upsertByKey({
    standardKey, displayName, description, rubricVersion, totalScore,
    skillMdContent, scriptFilename, scriptContent, referencesMd,
    isBuiltin, displayOrder, createdBy,
  }) {
    const res = await query(
      `INSERT INTO evaluation_standards (
        standard_key, display_name, description, rubric_version, total_score,
        skill_md_content, script_filename, script_content, references_md,
        is_active, is_builtin, display_order, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $11, $12)
      ON CONFLICT (standard_key) DO UPDATE SET
        display_name     = EXCLUDED.display_name,
        description      = EXCLUDED.description,
        rubric_version   = EXCLUDED.rubric_version,
        total_score      = EXCLUDED.total_score,
        skill_md_content = EXCLUDED.skill_md_content,
        script_filename  = EXCLUDED.script_filename,
        script_content   = EXCLUDED.script_content,
        references_md    = EXCLUDED.references_md
      RETURNING id, standard_key, display_name, rubric_version, is_active, is_builtin, updated_at`,
      [
        standardKey, displayName, description, rubricVersion, totalScore || 100,
        skillMdContent, scriptFilename, scriptContent, referencesMd || null,
        !!isBuiltin, displayOrder ?? 100, createdBy,
      ]
    );
    return res.rows[0];
  },

  async getAll({ activeOnly = false } = {}) {
    const where = activeOnly ? 'WHERE is_active = TRUE' : '';
    const res = await query(
      `SELECT id, standard_key, display_name, description, rubric_version,
              total_score, script_filename, is_active, is_builtin, display_order,
              created_at, updated_at
       FROM evaluation_standards ${where}
       ORDER BY display_order ASC, created_at ASC`,
      []
    );
    return res.rows;
  },

  async getById(id) {
    const res = await query(
      `SELECT * FROM evaluation_standards WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  async getByKey(key) {
    const res = await query(
      `SELECT * FROM evaluation_standards WHERE standard_key = $1`,
      [key]
    );
    return res.rows[0] || null;
  },

  async setActive(id, isActive) {
    const res = await query(
      `UPDATE evaluation_standards SET is_active = $2 WHERE id = $1
       RETURNING id, standard_key, is_active, updated_at`,
      [id, !!isActive]
    );
    return res.rows[0] || null;
  },

  async delete(id) {
    // 内置标准不允许删除
    const res = await query(
      `DELETE FROM evaluation_standards WHERE id = $1 AND is_builtin = FALSE
       RETURNING id, standard_key`,
      [id]
    );
    return res.rows[0] || null;
  },
};

export const EvaluationStandardVersions = {
  async create({
    standardId, versionLabel, rubricVersion,
    skillMdContent, scriptFilename, scriptContent, referencesMd,
    notes, uploadedBy,
  }) {
    const res = await query(
      `INSERT INTO evaluation_standard_versions (
        standard_id, version_label, rubric_version,
        skill_md_content, script_filename, script_content, references_md,
        notes, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, version_label, created_at`,
      [
        standardId, versionLabel, rubricVersion,
        skillMdContent, scriptFilename, scriptContent, referencesMd || null,
        notes || null, uploadedBy,
      ]
    );
    return res.rows[0];
  },

  async listByStandard(standardId, limit = 50) {
    const res = await query(
      `SELECT id, standard_id, version_label, rubric_version, notes, uploaded_by, created_at
       FROM evaluation_standard_versions
       WHERE standard_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [standardId, limit]
    );
    return res.rows;
  },

  async getByLabel(standardId, versionLabel) {
    const res = await query(
      `SELECT * FROM evaluation_standard_versions
       WHERE standard_id = $1 AND version_label = $2`,
      [standardId, versionLabel]
    );
    return res.rows[0] || null;
  },
};

// ─── 全局开关（app_settings） ORM ─────────────────────────────────────
// 键值对全局开关。配置中心的开关（如 testcase_features_enabled）
// 实时读取这里，切换无需重新部署。
export const AppSettings = {
  async getAll() {
    const res = await query(
      `SELECT key, value, description, updated_at, updated_by FROM app_settings ORDER BY key`
    );
    return res.rows;
  },

  async get(key) {
    const res = await query(
      `SELECT value FROM app_settings WHERE key = $1`,
      [key]
    );
    if (res.rows.length === 0) return undefined;
    const v = res.rows[0].value;
    // value 是 JSONB，pg 会自动 parse；保险起见再处理一次
    return typeof v === 'string' ? JSON.parse(v) : v;
  },

  async set(key, value, { updatedBy, description } = {}) {
    const res = await query(
      `INSERT INTO app_settings (key, value, description, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         description = COALESCE(EXCLUDED.description, app_settings.description),
         updated_by  = EXCLUDED.updated_by
       RETURNING key, value, description, updated_at`,
      [key, JSON.stringify(value), description || null, updatedBy || null]
    );
    return res.rows[0];
  },

  async getMany(keys) {
    if (!keys || keys.length === 0) return {};
    const res = await query(
      `SELECT key, value FROM app_settings WHERE key = ANY($1)`,
      [keys]
    );
    const out = {};
    for (const row of res.rows) {
      const v = row.value;
      out[row.key] = typeof v === 'string' ? JSON.parse(v) : v;
    }
    return out;
  },
};

// ─── Skill 版本历史 ORM（编辑器用）────────────────────────────────────
export const SkillVersions = {
  async create({ skillId, versionLabel, skillContent, description, notes, editedBy }) {
    const res = await query(
      `INSERT INTO skill_versions (skill_id, version_label, skill_content, description, notes, edited_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, skill_id, version_label, created_at`,
      [skillId, versionLabel, skillContent, description || null, notes || null, editedBy]
    );
    return res.rows[0];
  },

  async listBySkill(skillId, limit = 100) {
    const res = await query(
      `SELECT id, skill_id, version_label, description, notes, edited_by, created_at
       FROM skill_versions
       WHERE skill_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [skillId, limit]
    );
    return res.rows;
  },

  async getByLabel(skillId, versionLabel) {
    const res = await query(
      `SELECT * FROM skill_versions WHERE skill_id = $1 AND version_label = $2`,
      [skillId, versionLabel]
    );
    return res.rows[0] || null;
  },

  async getById(id) {
    const res = await query(`SELECT * FROM skill_versions WHERE id = $1`, [id]);
    return res.rows[0] || null;
  },
};

export const AuditLogs = {
  async create({ userId, action, entityType, entityId, changes }) {
    const res = await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, changes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [userId, action, entityType, entityId, JSON.stringify(changes)]
    );
    return res.rows[0];
  },
};
