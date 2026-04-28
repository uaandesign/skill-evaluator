-- ─────────────────────────────────────────────────────────────────────────
-- Migration 001: 评估标准 + 版本历史 + 评估结果增强
-- ─────────────────────────────────────────────────────────────────────────
-- 使用方式（任意一种）：
--   1. 通过 /api/init 端点（带 ADMIN_TOKEN 调用）
--   2. 通过 npm run db:migrate
--   3. 在 Neon SQL Editor 中直接粘贴执行
--
-- 设计要点：
--   • 所有新表用 IF NOT EXISTS，幂等可重跑
--   • 所有 ALTER 用 IF NOT EXISTS，不破坏旧字段
--   • 评估标准（参考 skill）的内容直接存数据库 TEXT 字段
--     —— 避开 Render 免费版无持久磁盘的问题
-- ─────────────────────────────────────────────────────────────────────────

-- ─── 评估标准表 ──────────────────────────────────────────────────────────
-- 一条记录 = 一个"评估器标准件"（参考 skill）
-- 例：内置的 skill-evaluator（通用）、ved-evaluate-skill-rules（火山一期）
CREATE TABLE IF NOT EXISTS evaluation_standards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  standard_key       VARCHAR(100) UNIQUE NOT NULL,        -- e.g. 'skill-evaluator'
  display_name       VARCHAR(200) NOT NULL,               -- 中文显示名
  description        TEXT,                                -- 评估器用途说明
  rubric_version     VARCHAR(50),                         -- e.g. 'generic-skill-rubric-v1'
  total_score        INTEGER DEFAULT 100,
  -- 文件内容（直接存库，避免持久存储依赖）
  skill_md_content   TEXT NOT NULL,                       -- SKILL.md 完整内容
  script_filename    VARCHAR(100) NOT NULL,               -- e.g. 'evaluate_skill.py'
  script_content     TEXT NOT NULL,                       -- Python 脚本完整内容
  references_md      TEXT,                                -- 可选：references/evaluation-standard.md
  -- 状态
  is_active          BOOLEAN DEFAULT TRUE,                -- 是否启用（评估时是否运行）
  is_builtin         BOOLEAN DEFAULT FALSE,               -- 是否平台内置（不可删除）
  display_order      INTEGER DEFAULT 100,                 -- UI 显示顺序
  -- 元数据
  created_by         VARCHAR(255),
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_eval_std_active   ON evaluation_standards(is_active);
CREATE INDEX IF NOT EXISTS idx_eval_std_key      ON evaluation_standards(standard_key);

-- 版本历史
CREATE TABLE IF NOT EXISTS evaluation_standard_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  standard_id        UUID NOT NULL REFERENCES evaluation_standards(id) ON DELETE CASCADE,
  version_label      VARCHAR(50) NOT NULL,                -- e.g. 'v1', 'v2-2026-04-28'
  rubric_version     VARCHAR(50),
  skill_md_content   TEXT NOT NULL,
  script_filename    VARCHAR(100) NOT NULL,
  script_content     TEXT NOT NULL,
  references_md      TEXT,
  notes              TEXT,                                 -- 该版本的变更说明
  uploaded_by        VARCHAR(255),
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(standard_id, version_label)
);

CREATE INDEX IF NOT EXISTS idx_eval_std_ver_std ON evaluation_standard_versions(standard_id, created_at DESC);

-- 触发器：updated_at 自动更新
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_eval_std_updated_at'
  ) THEN
    CREATE TRIGGER update_eval_std_updated_at BEFORE UPDATE ON evaluation_standards
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── Skill 版本历史表（编辑器用）──────────────────────────────────────
-- 用户在编辑器里改 skill 时，每次保存都新增一条版本记录
CREATE TABLE IF NOT EXISTS skill_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id           UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version_label      VARCHAR(50) NOT NULL,
  skill_content      TEXT NOT NULL,
  description        TEXT,
  notes              TEXT,                                 -- 该版本变更说明
  edited_by          VARCHAR(255),
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(skill_id, version_label)
);

CREATE INDEX IF NOT EXISTS idx_skill_ver_skill ON skill_versions(skill_id, created_at DESC);

-- ─── evaluation_results 字段扩展 ───────────────────────────────────────
-- 适配新格式（标准化报告 JSON、grade、checks 明细等）
-- 旧字段保留，不破坏存量数据
ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS standard_id UUID REFERENCES evaluation_standards(id);
ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS rubric_version VARCHAR(50);
ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(100);
ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS grade VARCHAR(2);
ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS assessment_tag VARCHAR(20);              -- '通过' | '警告' | '不通过'
ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS category_scores JSONB;
ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS checks JSONB;
ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS report JSONB;                            -- 完整原始报告备份
ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS optimization_suggestions TEXT;
ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS optimized_by_model VARCHAR(100);
-- 让 model_id 和 skill_id 可空：本期评估不强制绑定（skill 可能是临时上传未入库的）
ALTER TABLE evaluation_results ALTER COLUMN model_id DROP NOT NULL;
ALTER TABLE evaluation_results ALTER COLUMN skill_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eval_results_standard ON evaluation_results(standard_id);
CREATE INDEX IF NOT EXISTS idx_eval_results_tag      ON evaluation_results(assessment_tag);

-- ─── Done ────────────────────────────────────────────────────────────────
-- Migration 001 完成。下一步：
--   1. 调用 /api/standards/seed 把内置参考 skill 灌入数据库
--   2. 或在 server.js 启动时自动 seed
