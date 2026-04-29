/**
 * GET /api/stats
 * ----------------------------------------------------------------------
 * 首页统计数据：技能数 / 版本数 / 评估次数 / 启用的标准数
 * 不抛错，DB 不通时返回 0 值（首页不阻塞）
 */
import { initializePool, query } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60'); // 简单 60s 缓存

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const stats = {
    skills_count: 0,
    skill_versions_count: 0,
    evaluations_count: 0,
    standards_active_count: 0,
    standards_total_count: 0,
  };

  try {
    initializePool(process.env.DATABASE_URL);

    // 并发查 5 个计数（容错：单个失败不影响其他）
    const queries = [
      query('SELECT COUNT(*)::int AS c FROM skills').catch(() => ({ rows: [{ c: 0 }] })),
      query('SELECT COUNT(*)::int AS c FROM skill_versions').catch(() => ({ rows: [{ c: 0 }] })),
      query('SELECT COUNT(*)::int AS c FROM evaluation_results').catch(() => ({ rows: [{ c: 0 }] })),
      query('SELECT COUNT(*)::int AS c FROM evaluation_standards WHERE is_active = TRUE')
        .catch(() => ({ rows: [{ c: 0 }] })),
      query('SELECT COUNT(*)::int AS c FROM evaluation_standards').catch(() => ({ rows: [{ c: 0 }] })),
    ];

    const [skills, skillVers, evals, stdActive, stdTotal] = await Promise.all(queries);
    stats.skills_count           = skills.rows[0]?.c ?? 0;
    stats.skill_versions_count   = skillVers.rows[0]?.c ?? 0;
    stats.evaluations_count      = evals.rows[0]?.c ?? 0;
    stats.standards_active_count = stdActive.rows[0]?.c ?? 0;
    stats.standards_total_count  = stdTotal.rows[0]?.c ?? 0;
  } catch (err) {
    console.warn('[stats] DB error:', err.message);
  }

  return res.status(200).json(stats);
}
