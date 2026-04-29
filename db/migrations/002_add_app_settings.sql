-- ─────────────────────────────────────────────────────────────────────────
-- Migration 002: app_settings 全局开关表
-- ─────────────────────────────────────────────────────────────────────────
-- 用于在配置中心提供"功能开关"，免去环境变量 + 重新部署的繁琐流程
--
-- 默认值:
--   testcase_features_enabled = false  // MVP 一期关闭测试用例评估
--   judge_model_scoring_enabled = false  // MVP 一期关闭 Judge 模型兜底
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by  VARCHAR(255)
);

-- 触发器：updated_at 自动更新
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_app_settings_updated_at'
  ) THEN
    CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON app_settings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 默认开关（仅插入不存在的）
INSERT INTO app_settings (key, value, description) VALUES
  ('testcase_features_enabled', 'false'::jsonb,
   'MVP 一期是否启用测试用例生成/评估（默认关闭，纯静态评估）'),
  ('judge_model_scoring_enabled', 'false'::jsonb,
   'Python 脚本不可用时是否调用 Judge 大模型兜底评分（默认关闭，依赖 Python 静态规则）')
ON CONFLICT (key) DO NOTHING;
