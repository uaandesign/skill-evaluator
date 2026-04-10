/**
 * POST /api/init
 * Initialize database schema (one-time setup)
 * Only accessible with ADMIN_TOKEN
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializePool, getPool, query } from '../lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function handler(req, res) {
  // Verify admin token
  const adminToken = req.headers['x-admin-token'] || req.body?.admin_token;
  if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: '未授权' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize pool
    initializePool(process.env.DATABASE_URL);

    // Read schema file
    const schemaPath = path.join(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Execute schema
    const pool = getPool();
    const client = await pool.connect();
    try {
      // Split and execute each statement
      const statements = schema.split(';').filter(s => s.trim());
      for (const statement of statements) {
        if (statement.trim()) {
          await client.query(statement);
        }
      }
    } finally {
      client.release();
    }

    res.status(200).json({
      success: true,
      message: '数据库初始化成功',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Init Error]', error);
    res.status(500).json({
      error: '初始化失败',
      details: error.message,
    });
  }
}
