import pg from 'pg';

const { Pool } = pg;

// PostgreSQL connection pool
let pool = null;

export function initializePool(connectionString) {
  if (pool) return pool;

  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    console.error('[DB Pool Error]', err);
  });

  return pool;
}

export function getPool() {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initializePool() first.');
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Query helper
export async function query(text, params) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// Skills ORM
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

// Test Cases ORM
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

// Model Configs ORM
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

// Evaluation Results ORM
export const EvaluationResults = {
  async create(data) {
    const {
      skillId, modelId, testCaseId,
      phase1Output, phase1Success, phase1Error,
      phase2QualityDim, phase2FuncDim, phase2SafetyDim, phase2Score, phase2Eval, phase2Suggestions,
      phase3Dimensions, phase3Score, phase3Eval, phase3Suggestions,
      finalScore, duration, status, errorMessage
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
        finalScore, duration, status, errorMessage
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
      phase_3_dimensions: row.phase_3_dimensions ? JSON.parse(row.phase_3_dimensions) : null,
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

// Skill Categories ORM
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

// Audit logs
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
