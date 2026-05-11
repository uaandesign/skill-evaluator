/**
 * /api/auth/[action].js
 * ──────────────────────────────────────────────────────────────────────────
 * 统一处理认证相关接口：
 *   POST /api/auth/register  — 注册
 *   POST /api/auth/login     — 登录
 *   GET  /api/auth/me        — 验证 token & 获取当前用户信息
 *
 * 实现特点：
 *   - 零额外依赖：密码哈希用 Node.js 内置 crypto.scrypt，
 *     token 用 HMAC-SHA256 自签名（无需 jsonwebtoken / bcrypt）
 *   - users 表首次访问时自动建表（幂等 CREATE TABLE IF NOT EXISTS）
 *   - 统一 CORS 头，本地开发与 Vercel 均可使用
 *
 * 迁移提示（字节云）：
 *   - 替换 lib/db.js 驱动即可，其余逻辑无变动
 *   - JWT_SECRET 通过环境变量注入，生产请务必设置强随机串
 */

import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'crypto';
import { promisify } from 'util';
import { query } from '../../lib/db.js';

const scryptAsync = promisify(scrypt);

// ─── 环境变量 ───────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'skill-evaluator-default-secret-change-in-prod';

// ─── CORS 公共头 ────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ─── 密码工具 ────────────────────────────────────────────────────────────────
/**
 * 哈希密码，返回 "hash.salt"（均为 hex 字符串）
 */
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString('hex')}.${salt}`;
}

/**
 * 校验密码是否与存储的哈希匹配
 */
async function verifyPassword(password, stored) {
  const [hashed, salt] = stored.split('.');
  if (!hashed || !salt) return false;
  const buf = await scryptAsync(password, salt, 64);
  const hashedBuf = Buffer.from(hashed, 'hex');
  if (buf.length !== hashedBuf.length) return false;
  return timingSafeEqual(buf, hashedBuf);
}

// ─── Token 工具 ──────────────────────────────────────────────────────────────
/**
 * 生成 token：base64url(userId:issuedAt) + "." + HMAC-SHA256
 * 不设过期时间（产品早期），需要过期可在 payload 加 exp 字段后验证
 */
function generateToken(userId) {
  const payload = `${userId}:${Date.now()}`;
  const encoded = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

/**
 * 验证 token，返回 { userId } 或 null（签名不匹配时）
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString();
    const [userId] = decoded.split(':');
    return userId ? { userId } : null;
  } catch {
    return null;
  }
}

// ─── 自动建表 ────────────────────────────────────────────────────────────────
async function ensureUsersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL PRIMARY KEY,
      email        VARCHAR(255) NOT NULL UNIQUE,
      password     VARCHAR(512) NOT NULL,
      display_name VARCHAR(255),
      role         VARCHAR(50)  NOT NULL DEFAULT 'user',
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
}

// ─── 从请求头解析 Bearer Token ───────────────────────────────────────────────
function parseBearerToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Action 处理器
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/auth/register
 * Body: { email, password, displayName? }
 */
async function handleRegister(req, res) {
  const { email, password, displayName } = req.body || {};

  // 参数校验
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: '邮箱不能为空' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: '密码不能为空' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '密码至少需要 8 位' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  await ensureUsersTable();

  // 检查邮箱是否已注册
  const existing = await query(
    'SELECT id FROM users WHERE email = $1',
    [normalizedEmail]
  );
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: '该邮箱已注册，请直接登录' });
  }

  // 哈希密码并写入数据库
  const hashedPwd = await hashPassword(password);
  const result = await query(
    `INSERT INTO users (email, password, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, role, created_at`,
    [normalizedEmail, hashedPwd, displayName?.trim() || null]
  );

  const user = result.rows[0];
  const token = generateToken(String(user.id));

  return res.status(201).json({
    user: {
      id:           user.id,
      email:        user.email,
      display_name: user.display_name,
      role:         user.role,
    },
    token,
  });
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
async function handleLogin(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: '邮箱和密码不能为空' });
  }

  await ensureUsersTable();

  const result = await query(
    'SELECT id, email, password, display_name, role FROM users WHERE email = $1',
    [email.trim().toLowerCase()]
  );

  const user = result.rows[0];

  // 用户不存在或密码错误，返回统一错误（防止枚举）
  if (!user) {
    return res.status(401).json({ error: '邮箱或密码不正确' });
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: '邮箱或密码不正确' });
  }

  const token = generateToken(String(user.id));

  return res.status(200).json({
    user: {
      id:           user.id,
      email:        user.email,
      display_name: user.display_name,
      role:         user.role,
    },
    token,
  });
}

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 */
async function handleMe(req, res) {
  const token = parseBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: '未提供 token' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'token 无效或已篡改' });
  }

  await ensureUsersTable();

  const result = await query(
    'SELECT id, email, display_name, role, created_at FROM users WHERE id = $1',
    [payload.userId]
  );

  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: '用户不存在' });
  }

  return res.status(200).json({
    user: {
      id:           user.id,
      email:        user.email,
      display_name: user.display_name,
      role:         user.role,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Vercel Handler 入口
// ═══════════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  setCors(res);

  // 处理 preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'register':
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        return await handleRegister(req, res);

      case 'login':
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        return await handleLogin(req, res);

      case 'me':
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        return await handleMe(req, res);

      default:
        return res.status(404).json({ error: `未知的 auth 操作: ${action}` });
    }
  } catch (err) {
    console.error('[Auth Error]', action, err);
    return res.status(500).json({
      error: '服务器内部错误',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}
