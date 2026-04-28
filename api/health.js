/**
 * GET /api/health
 * 极简健康检查端点 —— 无任何外部依赖。
 * 用于排除 npm 包（如 @neondatabase/serverless）加载失败导致的 502。
 *
 * 如果这个端点能正常返回 200，说明：
 *   - Vercel 函数运行环境正常
 *   - 路由层正常
 *   - 502 一定是其他文件或依赖的问题
 *
 * 如果这个端点还 502，说明问题在 Vercel 平台层面（边缘缓存、域名路由等）。
 */
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Content-Type', 'application/json');

  return res.status(200).json({
    status: 'ok',
    deploy_marker: 'v3-minimal-health',
    timestamp: new Date().toISOString(),
    runtime_node: process.version,
    region: process.env.VERCEL_REGION || 'unknown',
    env_check: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      ADMIN_TOKEN: !!process.env.ADMIN_TOKEN,
    },
  });
}
