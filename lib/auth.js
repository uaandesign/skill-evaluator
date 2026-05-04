/**
 * lib/auth.js — 认证工具（纯 Node.js 内置 crypto，无第三方依赖）
 * ─────────────────────────────────────────────────────────────────────────
 * 实现：
 *   • PBKDF2 密码哈希（hashPassword / verifyPassword）
 *   • HS256 JWT 签发与验证（signToken / verifyToken）
 *
 * JWT 密钥：读取环境变量 JWT_SECRET；未配置时使用固定 fallback（仅开发用）
 *
 * 迁移说明：
 *   未来切换到字节云时，只需替换本文件的 JWT_SECRET 来源（如从 KMS 读取），
 *   其余业务逻辑无需修改。
 */

import crypto from 'crypto';

// ─── 配置 ────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'skill-evaluator-dev-secret-change-in-production';
const TOKEN_EXPIRY_SEC = 7 * 24 * 60 * 60; // 7 天

// ─── 密码哈希（PBKDF2） ───────────────────────────────────────────────────

/**
 * 生成随机 salt（32 字节，hex 编码）
 */
export function generateSalt() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 用 PBKDF2 哈希密码，返回十六进制字符串
 * @param {string} password - 明文密码
 * @param {string} salt     - 十六进制 salt（来自 generateSalt()）
 */
export function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, 200_000, 64, 'sha512')
    .toString('hex');
}

/**
 * 验证密码是否匹配哈希
 * @param {string} password  - 待验证明文
 * @param {string} hash      - 存储的哈希值
 * @param {string} salt      - 存储的 salt
 */
export function verifyPassword(password, hash, salt) {
  const derived = hashPassword(password, salt);
  // 使用时间恒定比较，防止时序攻击
  return derived.length === hash.length &&
    crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'));
}

// ─── JWT（HS256） ─────────────────────────────────────────────────────────

function base64urlEncode(data) {
  const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(JSON.stringify(data));
  return buf.toString('base64url');
}

function base64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

/**
 * 签发 JWT token
 * @param {object} payload - 要编码的数据（建议包含 sub, email, role）
 * @param {number} [expiresIn] - 有效期（秒），默认 7 天
 */
export function signToken(payload, expiresIn = TOKEN_EXPIRY_SEC) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  };

  const unsigned = `${base64urlEncode(header)}.${base64urlEncode(claims)}`;
  const sig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(unsigned)
    .digest('base64url');

  return `${unsigned}.${sig}`;
}

/**
 * 验证并解码 JWT token
 * @param {string} token
 * @returns {object} payload（已验证），失败时抛出 Error
 */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') throw new Error('Token 不存在');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token 格式错误');

  const [headerB64, payloadB64, sigB64] = parts;
  const unsigned = `${headerB64}.${payloadB64}`;

  // 重新计算签名并比较
  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(unsigned)
    .digest('base64url');

  if (sigB64 !== expectedSig) throw new Error('Token 签名无效');

  // 解码 payload
  let claims;
  try {
    claims = JSON.parse(base64urlDecode(payloadB64));
  } catch {
    throw new Error('Token payload 解析失败');
  }

  // 检查过期
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && claims.exp < now) throw new Error('Token 已过期');

  return claims;
}

/**
 * Express 中间件：从 Authorization: Bearer <token> 头提取并验证 token
 * 验证成功时将 payload 挂到 req.user；失败时继续（不强制登录，由具体路由决定）
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

/**
 * Express 中间件：强制登录（req.user 必须存在）
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '未登录，请先登录', code: 'UNAUTHORIZED' });
  }
  next();
}
