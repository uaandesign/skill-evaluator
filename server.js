/**
 * Production server (for Render.com / 字节云 / 任何传统 Node.js PaaS)
 * ----------------------------------------------------------------------
 * 一个 Express 服务器同时承担：
 *   1. 静态资源：服务 vite build 产物 dist/
 *   2. API 路由：把 /api/*.js 文件按 Vercel Serverless 风格挂载为 Express 路由
 *   3. SPA fallback：所有非 /api 非静态的路径回退到 index.html
 *
 * 本地启动：node server.js
 * 部署平台：Render / Railway / 字节云 / 任意支持 Node 的 PaaS
 *   - 平台会自动注入 PORT 环境变量
 *   - 不依赖 Vercel 任何专有特性
 *
 * 与 dev-server.js 的关系：
 *   - dev-server.js 是开发期专用（端口 3001，配合 vite dev 使用）
 *   - server.js 是生产期专用（监听平台 PORT，serving dist/ 静态文件）
 */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { runBootstrap } from './lib/bootstrap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(cors());
// JSON body（普通 API）
app.use(express.json({ limit: '50mb' }));
// Zip / 二进制 body（用于参考 skill 上传等场景）
// 仅当 Content-Type 是 application/zip 或 application/octet-stream 时启用
app.use(
  express.raw({
    type: ['application/zip', 'application/octet-stream'],
    limit: '50mb',
  })
);

// ─── Serverless-style handler 适配器 ──────────────────────────────────────
/**
 * Vercel Serverless 函数签名：(req, res) => any
 * Express 中间件签名：    (req, res, next) => any
 *
 * 路径参数注入规则（Vercel 行为模拟）：
 *   /api/skills          → 无额外注入
 *   /api/skills/123      → req.query.id = '123'
 *   /api/skills/123/foo  → req.query.id = '123', req.query.action = 'foo'
 *   /api/auth/register   → req.query.action = 'register'
 */
function wrapHandler(handler) {
  return async (req, res, next) => {
    try {
      const pathParts = req.path.split('/').filter(Boolean);
      // pathParts: ['api', 'skills', '123', 'foo']
      if (pathParts.length >= 2 && pathParts[0] === 'api') {
        const segments = pathParts.slice(2); // 去掉 'api' 和路由名
        if (segments.length === 1) {
          // /api/route/:id  或  /api/auth/register（action 用 id 字段传递）
          const val = segments[0];
          // 如果是纯 UUID，注入为 id；否则注入为 action
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
          if (isUuid) {
            req.query = { ...req.query, id: val };
          } else {
            req.query = { ...req.query, action: val, id: val };
          }
        } else if (segments.length === 2) {
          // /api/route/:id/:action  e.g. /api/standards/uuid/active
          req.query = { ...req.query, id: segments[0], action: segments[1] };
        }
      }
      await handler(req, res);
    } catch (err) {
      console.error(`[${req.method} ${req.path}] handler error:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error', details: err.message });
      } else {
        next(err);
      }
    }
  };
}

// ─── 自动挂载 /api/*.js 文件 ──────────────────────────────────────────────
async function mountApiRoutes() {
  const apiDir = join(__dirname, 'api');
  if (!fs.existsSync(apiDir)) {
    console.warn('[server] api/ 目录不存在，跳过 API 路由挂载');
    return;
  }

  const files = fs.readdirSync(apiDir).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const routeName = file.replace(/\.js$/, '');
    const routePath = `/api/${routeName}`;
    const filePath = join(apiDir, file);

    try {
      const mod = await import(`file://${filePath}`);
      const handler = mod.default;
      if (typeof handler !== 'function') {
        console.warn(`[server] ${file} 没有 default export，跳过`);
        continue;
      }
      // 支持多层子路径：
      //   /api/skills
      //   /api/skills/:id
      //   /api/skills/:id/:action   ← 新增，支持 /api/standards/uuid/active
      //   /api/auth/:action         ← 支持 /api/auth/register 等
      app.all(routePath, wrapHandler(handler));
      app.all(`${routePath}/:id`, wrapHandler(handler));
      app.all(`${routePath}/:id/:action`, wrapHandler(handler));
      console.log(`[server] ✓ 挂载 ${routePath}`);
    } catch (err) {
      console.error(`[server] ✗ 加载 ${file} 失败:`, err.message);
    }
  }
}

// ─── 静态资源 + SPA fallback ──────────────────────────────────────────────
function setupStaticAndFallback() {
  const distDir = join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    console.warn('[server] dist/ 目录不存在！请先运行 `npm run build`');
    return;
  }

  // 静态资源（assets 走长缓存，html 不缓存）
  app.use(
    '/assets',
    express.static(join(distDir, 'assets'), {
      maxAge: '1y',
      immutable: true,
    })
  );
  app.use(express.static(distDir, { maxAge: '0', index: false }));

  // SPA fallback：所有非 /api 路径回退到 index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(distDir, 'index.html'));
  });
}

// ─── 健康检查（无需 dist 即可工作）────────────────────────────────────────
app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    node: process.version,
    env_check: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      ADMIN_TOKEN: !!process.env.ADMIN_TOKEN,
    },
  });
});

// ─── 启动 ────────────────────────────────────────────────────────────────
async function start() {
  // 1. Bootstrap：跑 migration + seed 内置参考 skill
  //    DATABASE_URL 没配置时会内部跳过，不阻塞启动
  try {
    await runBootstrap();
  } catch (err) {
    console.error('[server] bootstrap 失败:', err.message);
    console.error('[server] 服务器将仍然启动，但数据库相关功能可能不可用');
  }

  // 2. 挂载 API 路由 + 静态资源
  await mountApiRoutes();
  setupStaticAndFallback();

  app.listen(PORT, () => {
    console.log(`[server] ✓ 启动成功`);
    console.log(`[server] 监听端口: ${PORT}`);
    console.log(`[server] Node 版本: ${process.version}`);
    console.log(`[server] 健康检查: http://localhost:${PORT}/healthz`);
  });
}

start().catch((err) => {
  console.error('[server] 启动失败:', err);
  process.exit(1);
});
