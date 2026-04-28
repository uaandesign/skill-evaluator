/**
 * GET /api/health
 * 健康检查端点 —— 用于快速排查 Vercel 部署问题：
 *   - 返回 200 + JSON：函数运行环境正常
 *   - 502/超时：Vercel 函数本身异常（runtime/内存/超时）
 *   - db 字段为 false：DATABASE_URL 未配置或 Neon 不可达
 *
 * 不依赖任何业务逻辑，故意保持轻量，便于诊断 502 问题。
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const result = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    deploy_marker: 'v2-502-fix',
    runtime: {
      node: process.version,
      region: process.env.VERCEL_REGION || 'unknown',
      env: process.env.VERCEL_ENV || 'unknown',
    },
    env_check: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      ADMIN_TOKEN: !!process.env.ADMIN_TOKEN,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    },
    db: false,
  };

  // 可选：测试数据库连通性
  if (process.env.DATABASE_URL) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);
      const rows = await sql`SELECT 1 AS ok`;
      result.db = rows[0]?.ok === 1;
    } catch (e) {
      result.db = false;
      result.db_error = e.message;
    }
  }

  return res.status(200).json(result);
}
