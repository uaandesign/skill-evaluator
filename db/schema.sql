-- PostgreSQL Schema for Skill Evaluator Platform
-- Run this after connecting to your PostgreSQL database

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "moddatetime";

-- Skill categories table
CREATE TABLE IF NOT EXISTS skill_categories (
  id SERIAL PRIMARY KEY,
  category_key VARCHAR(50) UNIQUE NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO skill_categories (category_key, category_name, description) VALUES
  ('text-generation', '文本生成', '生成、编辑、改写文本内容'),
  ('code-generation', '代码生成', '生成、优化、调试代码'),
  ('data-collection', '数据采集', '从网页、API 采集和解析数据'),
  ('competitor-research', '竞品调研', '收集和分析竞品信息')
ON CONFLICT (category_key) DO NOTHING;

-- Skills table
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  skill_content TEXT NOT NULL,
  category_id INTEGER REFERENCES skill_categories(id),
  version VARCHAR(20) DEFAULT 'v1.0',
  version_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255)
);

CREATE INDEX idx_skills_name ON skills(name);
CREATE INDEX idx_skills_category ON skills(category_id);

-- Test cases table
CREATE TABLE IF NOT EXISTS test_cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  scenario TEXT,
  input TEXT NOT NULL,
  expected_output TEXT,
  test_type VARCHAR(50),
  priority VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_test_cases_skill ON test_cases(skill_id);

-- Model configurations table
CREATE TABLE IF NOT EXISTS model_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255),
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  api_key VARCHAR(1024) NOT NULL,
  base_url TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_model_configs_user ON model_configs(user_id);
CREATE INDEX idx_model_configs_provider ON model_configs(provider);

-- Evaluation results table
CREATE TABLE IF NOT EXISTS evaluation_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES model_configs(id) ON DELETE SET NULL,
  test_case_id UUID REFERENCES test_cases(id),

  -- Phase 1: Execution
  phase_1_output TEXT,
  phase_1_success BOOLEAN,
  phase_1_error TEXT,

  -- Phase 2: Generic evaluation
  phase_2_quality_dimension NUMERIC(5,2),
  phase_2_functionality_dimension NUMERIC(5,2),
  phase_2_safety_dimension NUMERIC(5,2),
  phase_2_score NUMERIC(5,2),
  phase_2_evaluation TEXT,
  phase_2_optimization_suggestions TEXT,

  -- Phase 3: Specialized evaluation (if applicable)
  phase_3_dimensions JSONB,
  phase_3_score NUMERIC(5,2),
  phase_3_evaluation TEXT,
  phase_3_optimization_suggestions TEXT,

  -- Final score
  final_score NUMERIC(5,2),

  -- Metadata
  evaluation_duration_ms INTEGER,
  status VARCHAR(50),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_evaluation_results_skill ON evaluation_results(skill_id);
CREATE INDEX idx_evaluation_results_model ON evaluation_results(model_id);
CREATE INDEX idx_evaluation_results_created ON evaluation_results(created_at DESC);

-- Specialized dimensions reference table (for query optimization)
CREATE TABLE IF NOT EXISTS specialized_dimensions (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES skill_categories(id),
  dimension_key VARCHAR(100) NOT NULL,
  dimension_name VARCHAR(255) NOT NULL,
  rubric TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO specialized_dimensions (category_id, dimension_key, dimension_name, rubric) VALUES
  (1, 'readability', '可读性', '文本表达清晰度和流畅性'),
  (1, 'accuracy', '准确性', '事实和数据的准确程度'),
  (1, 'relevance', '相关性', '内容与主题的匹配度'),
  (1, 'completeness', '完整性', '覆盖所有必要内容'),
  (2, 'correctness', '正确性', '代码逻辑和语法正确性'),
  (2, 'efficiency', '效率', '算法时间空间复杂度'),
  (2, 'maintainability', '可维护性', '代码结构和注释质量'),
  (2, 'best_practices', '最佳实践', '遵循编码规范'),
  (3, 'completeness', '完整性', '采集数据的完整性'),
  (3, 'accuracy', '准确性', '数据采集的准确度'),
  (3, 'robustness', '鲁棒性', '应对异常的能力'),
  (3, 'performance', '性能', '采集速度和资源效率'),
  (4, 'depth', '深度', '调研信息的深度'),
  (4, 'coverage', '覆盖度', '竞品覆盖的广度'),
  (4, 'timeliness', '时效性', '信息的新鲜程度'),
  (4, 'actionability', '可操作性', '建议的实用价值')
ON CONFLICT DO NOTHING;

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255),
  action VARCHAR(100),
  entity_type VARCHAR(50),
  entity_id UUID,
  changes JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_skills_updated_at BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_model_configs_updated_at BEFORE UPDATE ON model_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
