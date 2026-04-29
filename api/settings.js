/**
 * /api/settings - 全局开关读写
 * ----------------------------------------------------------------------
 * 路由：
 *   GET    /api/settings              拉所有开关 + 元信息
 *   GET    /api/settings/:key         拉单个开关值
 *   PUT    /api/settings/:key         更新单个开关 ({ value: <jsonb> })
 *
 * 设计：
 *   - 每次请求查 DB（不缓存），切换立即生效
 *   - 默认值由 migration 002 写入；运行时只更新已有 key
 *   - 未来可加 admin token 校验，MVP 先开放
 */

import { initializePool, AppSettings, AuditLogs } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    initializePool(process.env.DATABASE_URL);
  } catch (e) {
    console.error('[settings] DB init failed:', e.message);
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { id: key } = req.query;

    // GET /api/settings
    if (req.method === 'GET' && !key) {
      const list = await AppSettings.getAll();
      // 把 list 转成对象 { key: value, ... } + meta 单独保留
      const settings = {};
      const meta = {};
      for (const row of list) {
        const v = row.value;
        settings[row.key] = typeof v === 'string' ? JSON.parse(v) : v;
        meta[row.key] = {
          description: row.description,
          updated_at: row.updated_at,
          updated_by: row.updated_by,
        };
      }
      return res.status(200).json({ settings, meta });
    }

    // GET /api/settings/:key
    if (req.method === 'GET' && key) {
      const value = await AppSettings.get(key);
      if (value === undefined) return res.status(404).json({ error: '开关不存在' });
      return res.status(200).json({ key, value });
    }

    // PUT /api/settings/:key
    if (req.method === 'PUT' && key) {
      const body = req.body || {};
      if (!('value' in body)) {
        return res.status(400).json({ error: '请求体需要 value 字段' });
      }
      const updatedBy = req.headers['x-user-id'] || 'anonymous';
      const updated = await AppSettings.set(key, body.value, {
        updatedBy,
        description: body.description,
      });
      await AuditLogs.create({
        userId: updatedBy,
        action: 'UPDATE_SETTING',
        entityType: 'app_setting',
        entityId: null,
        changes: { key, value: body.value },
      });
      return res.status(200).json(updated);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[settings] error:', err);
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
}
