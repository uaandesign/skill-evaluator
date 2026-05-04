/**
 * /api/auth — 用户认证接口
 * ─────────────────────────────────────────────────────────────────────────
 * 路由（通过 req.query.action 区分，兼容单文件 Express 挂载风格）：
 *
 *   POST /api/auth?action=register   注册（email + password + displayName）
 *   POST /api/auth?action=login      登录（email + password）→ 返回 JWT token
 *   GET  /api/auth?action=me         获取当前登录用户信息（需 Bearer token）
 *   POST /api/auth?action=logout     登出（前端删 token 即可，服务端无状态）
 *
 * 密码：PBKDF2-SHA512，salt 随机生成，均存储在 users 表
 * Token：HS256 JWT，7 天有效期，密钥来自 JWT_SECRET 环境变量
 */

import { initializePool, query } from '../lib/db.js';
import {
  generateSalt, hashPassword, verifyPassword,
  signToken, verifyToken,
} from '../lib/auth.js';

// ─── 辅助 ─────────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeUser(row) {
  if (!row) return null;
  const { password_hash, password_salt, ...safe } = row;
  return safe;
}

// ─── 主 handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    initializePool(process.env.DATABASE_URL);
  } catch (e) {
    console.error('[auth] DB init failed:', e.message);
    return res.status(503).json({ error: '数据库未就绪' });
  }

  const action = req.query.action || req.query.id;

  // ── 注册 ──────────────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'register') {
    const { email, password, displayName } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: '密码至少 8 位' });
    }

    // 检查邮箱是否已注册
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: '该邮箱已注册，请直接登录' });
    }

    // 哈希密码
    const salt = generateSalt();
    const hash = hashPassword(password, salt);
    const name = displayName?.trim() || email.split('@')[0];

    const result = await query(
      `INSERT INTO users (email, password_hash, password_salt, display_name, role)
       VALUES ($1, $2, $3, $4, 'user')
       RETURNING id, email, display_name, role, created_at`,
      [email.toLowerCase(), hash, salt, name]
    );

    const user = result.rows[0];
    const token = signToken({ sub: user.id, email: user.email, role: user.role });

    return res.status(201).json({
      user: sanitizeUser(user),
      token,
      message: '注册成功',
    });
  }

  // ── 登录 ──────────────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'login') {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' });
    }

    const result = await query(
      'SELECT * FROM users WHERE email = $1 AND is_active = TRUE',
      [email.toLowerCase()]
    );
    const user = result.rows[0];

    // 用户不存在或密码错误（统一错误信息，防枚举）
    if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    // 更新最后登录时间
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = signToken({ sub: user.id, email: user.email, role: user.role });

    return res.status(200).json({
      user: sanitizeUser(user),
      token,
      message: '登录成功',
    });
  }

  // ── 获取当前用户 ───────────────────────────────────────────────────────
  if (req.method === 'GET' && (action === 'me' || !action)) {
    const authHeader = req.headers['authorization'] || '';
    const tokenStr = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!tokenStr) {
      return res.status(401).json({ error: '未登录', code: 'UNAUTHORIZED' });
    }

    let claims;
    try {
      claims = verifyToken(tokenStr);
    } catch (err) {
      return res.status(401).json({ error: err.message, code: 'TOKEN_INVALID' });
    }

    const result = await query(
      'SELECT id, email, display_name, role, last_login_at, created_at FROM users WHERE id = $1',
      [claims.sub]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: '用户不存在' });
    }

    return res.status(200).json({ user: result.rows[0] });
  }

  // ── 登出（无状态，客户端删 token 即可，服务端记录一下即可）──────────────
  if (req.method === 'POST' && action === 'logout') {
    return res.status(200).json({ message: '已登出' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
