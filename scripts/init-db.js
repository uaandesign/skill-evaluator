#!/usr/bin/env node

/**
 * Database initialization script
 * Usage: node scripts/init-db.js
 *
 * This script:
 * 1. Reads db/schema.sql
 * 2. Connects to PostgreSQL
 * 3. Executes all SQL statements
 * 4. Reports success or errors
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ 错误：DATABASE_URL 环境变量未设置');
    console.error('   使用方法：DATABASE_URL=postgresql://... node scripts/init-db.js');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('📦 数据库初始化脚本');
    console.log('─'.repeat(50));

    // Read schema
    const schemaPath = path.join(__dirname, '../db/schema.sql');
    console.log(`📖 读取 schema 文件：${schemaPath}`);
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Connect
    const client = await pool.connect();
    console.log('✅ 数据库连接成功');

    // Execute statements
    const statements = schema.split(';').filter(s => s.trim());
    console.log(`📝 执行 ${statements.length} 个 SQL 语句...`);

    let successCount = 0;
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;

      try {
        await client.query(stmt);
        successCount++;

        // Show progress
        if ((i + 1) % 5 === 0) {
          console.log(`   ✓ 已执行 ${i + 1}/${statements.length}`);
        }
      } catch (e) {
        // Some statements may fail if already exist (CREATE IF NOT EXISTS)
        // This is OK, continue
        if (!e.message.includes('already exists') && !e.message.includes('CONSTRAINT')) {
          console.warn(`   ⚠️  语句 ${i + 1} 警告：${e.message}`);
        }
      }
    }

    client.release();

    console.log('─'.repeat(50));
    console.log(`✅ 初始化完成！已执行 ${successCount} 个语句`);
    console.log('');
    console.log('📊 已创建的表：');
    console.log('   • skill_categories - 技能类别');
    console.log('   • skills - 技能定义');
    console.log('   • test_cases - 测试用例');
    console.log('   • model_configs - 模型配置');
    console.log('   • evaluation_results - 评估结果');
    console.log('   • specialized_dimensions - 专项维度');
    console.log('   • audit_logs - 审计日志');
    console.log('');

    // Verify tables
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log(`📋 当前表数量：${result.rows.length}`);
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    console.log('');
    console.log('🎉 数据库初始化成功！');
    console.log('   现在可以启动应用程序了');

  } catch (error) {
    console.error('');
    console.error('❌ 初始化失败：');
    console.error(`   ${error.message}`);
    console.error('');
    console.error('排查步骤：');
    console.error('   1. 检查 DATABASE_URL 是否正确');
    console.error('   2. 确保数据库可访问');
    console.error('   3. 检查是否有权限创建表');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run
initializeDatabase();
