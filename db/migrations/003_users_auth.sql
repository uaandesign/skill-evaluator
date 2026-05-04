-- ─────────────────────────────────────────────────────────────────────────
-- Migration 003: 用户认证系统
-- ─────────────────────────────────────────────────────────────────────────
-- 包含：
--   • users 表（邮箱注册 / 密码哈希）
--   • user_sessions 表（token 黑名单，可选）
--   • skills / model_configs 增加 owner_user_id 外键（可空，兼容旧数据）
-- ─────────────────────────────────────────────────────────────────────────

-- ─── 用户表 ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(320) UNIQUE NOT NULL,               -- 邮箱（登录凭证）
  password_hash VARCHAR(512) NOT NULL,                       -- PBKDF2 哈希
  password_salt VARCHAR(128) NOT NULL,                       -- 随机 salt
  display_name  VARCHAR(100),                                -- 显示名（可选）
  role          VARCHAR(20) DEFAULT 'user',                  -- 'user' | 'admin'
  is_active     BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMP,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 触发器：updated_at 自动更新
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at'
  ) THEN
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── skills 表增加 owner_user_id（向后兼容，可空）────────────────────────
ALTER TABLE skills ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_skills_owner ON skills(owner_user_id);

-- ─── model_configs 表增加 owner_user_id（向后兼容，可空）────────────────
ALTER TABLE model_configs ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_model_configs_owner ON model_configs(owner_user_id);

-- ─── evaluation_results 增加 owner_user_id ───────────────────────────────
ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- ─── Done ────────────────────────────────────────────────────────────────
