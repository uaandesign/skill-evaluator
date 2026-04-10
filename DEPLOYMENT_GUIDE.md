# Skill Evaluator Platform — Vercel + PostgreSQL 部署指南

## 🚀 快速开始

本指南帮助您在 Vercel + PostgreSQL 环境中部署 Skill Evaluator 平台。

---

## 第 1 步：准备工作

### 1.1 必要的工具和账户
- **Vercel 账户**：[vercel.com](https://vercel.com)
- **GitHub 账户**：用于连接代码库（可选，也支持 GitLab、Bitbucket）
- **PostgreSQL 数据库**：
  - **推荐**：Vercel Postgres（一键集成）
  - **备选**：AWS RDS、阿里云 RDS、自建 PostgreSQL

### 1.2 获取 API 密钥

在以下服务获取 API 密钥：

| 供应商 | 获取方式 | 环境变量 |
|------|---------|--------|
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `OPENAI_API_KEY` |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com) | `ANTHROPIC_API_KEY` |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com) | `DEEPSEEK_API_KEY` |
| **Doubao** | [console.bytedance.com](https://console.bytedance.com) | `DOUBAO_API_KEY` |
| **Qwen** | [dashscope.aliyuncs.com](https://dashscope.aliyuncs.com) | `QWEN_API_KEY` |
| **Gemini** | [aistudio.google.com](https://aistudio.google.com) | `GEMINI_API_KEY` |

### 1.3 生成 Admin Token

```bash
# 生成一个安全的 Admin Token（用于数据库初始化）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 第 2 步：配置数据库

### 2.1 使用 Vercel Postgres（推荐）

1. 在 Vercel 控制面板中创建项目
2. 进入 **Storage** → **Create Database** → 选择 **Postgres**
3. 完成创建后，会获得 `DATABASE_URL`，格式如下：
   ```
   postgresql://username:password@ep-xxx.us-east-1.postgres.vercel.sh:5432/verceldb
   ```

### 2.2 使用外部 PostgreSQL

如使用 AWS RDS 或自建数据库，需要：

1. 确保数据库可从 Vercel 边缘节点访问（允许所有 IP 或 Vercel IP 白名单）
2. 获取连接字符串：`postgresql://user:password@host:port/database`

---

## 第 3 步：部署到 Vercel

### 3.1 连接 GitHub 并部署

1. **推送代码到 GitHub**
   ```bash
   cd skill-evaluator
   git init
   git add .
   git commit -m "Initial commit for Skill Evaluator deployment"
   git remote add origin https://github.com/your-username/skill-evaluator.git
   git push -u origin main
   ```

2. **在 Vercel 中导入项目**
   - 访问 [vercel.com/new](https://vercel.com/new)
   - 选择 **Import Git Repository**
   - 选择您的 `skill-evaluator` 仓库
   - 点击 **Import**

### 3.2 配置环境变量

在 Vercel 项目设置中，进入 **Settings** → **Environment Variables**，添加以下变量：

```
DATABASE_URL=postgresql://...（从 Storage 或外部数据库获取）
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
DOUBAO_API_KEY=...
QWEN_API_KEY=...
GEMINI_API_KEY=...
ADMIN_TOKEN=<生成的 Admin Token>
NODE_ENV=production
VITE_API_BASE_URL=https://your-domain.vercel.app
```

### 3.3 触发部署

环境变量配置完成后，Vercel 会自动重新部署。如未自动部署，进入 **Deployments** 手动触发。

---

## 第 4 步：初始化数据库

### 4.1 运行初始化脚本

部署完成后，使用以下命令初始化数据库（仅需运行一次）：

```bash
curl -X POST https://your-domain.vercel.app/api/init \
  -H "x-admin-token: <your-admin-token>" \
  -H "Content-Type: application/json"
```

**成功响应**：
```json
{
  "success": true,
  "message": "数据库初始化成功",
  "timestamp": "2025-04-10T12:34:56.000Z"
}
```

**或者在本地运行**（需要 DATABASE_URL）：

```bash
# 在项目目录中
node scripts/init-db.js
```

如果脚本不存在，可以手动执行 SQL：

```bash
# 连接到 PostgreSQL
psql $DATABASE_URL

# 复制并粘贴 db/schema.sql 中的所有内容并执行
```

---

## 第 5 步：更新前端配置

### 5.1 前端 API 端点配置

编辑 `src/store.js` 中的 API 基础 URL：

```javascript
// 用于生产环境
const API_BASE = process.env.VITE_API_BASE_URL || 'https://your-domain.vercel.app';

// API 端点示例
const API_ENDPOINTS = {
  SKILLS: `${API_BASE}/api/skills`,
  EVALUATE: `${API_BASE}/api/evaluate-skill`,
  MODEL_CONFIGS: `${API_BASE}/api/model-configs`,
  // ... 其他端点
};
```

### 5.2 构建和测试

```bash
# 开发环境
npm run dev

# 生产构建
npm run build

# 预览构建结果
npm run preview
```

---

## 第 6 步：验证部署

### 6.1 检查 API 健康状态

```bash
curl https://your-domain.vercel.app/api/skills
```

预期响应：
```json
{
  "skills": []
}
```

### 6.2 测试技能上传和评估

1. 打开应用：`https://your-domain.vercel.app`
2. 上传一个测试 SKILL.md
3. 配置 LLM 模型
4. 运行评估

---

## 性能优化和配置

### 数据库连接池

默认配置：
- **最大连接数**：20
- **空闲超时**：30 秒
- **连接超时**：2 秒

如需调整，编辑 `lib/db.js`：

```javascript
const pool = new Pool({
  max: 20,        // 根据预期并发调整
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Vercel Function 配置

在 `vercel.json` 中配置：

```json
"functions": {
  "api/**/*.js": {
    "memory": 3008,      // 增加至 3GB（最大）
    "maxDuration": 60    // 最长执行时间 60 秒
  }
}
```

---

## 常见问题和故障排查

### Q1: 数据库连接失败

**症状**：`Error: connect ECONNREFUSED`

**解决方案**：
1. 检查 `DATABASE_URL` 是否正确：`echo $DATABASE_URL`
2. 如使用 Vercel Postgres，确保已创建数据库
3. 如使用外部 DB，确保 IP 白名单包括 Vercel 的 IP 地址

### Q2: 初始化脚本失败

**症状**：`Error: 404 not found` 或数据库初始化返回 500

**解决方案**：
1. 验证 `ADMIN_TOKEN` 正确性
2. 查看 Vercel 日志：`vercel logs <project-name>`
3. 手动连接数据库并运行 `db/schema.sql`

### Q3: LLM API 调用超时

**症状**：评估请求超时（>60秒）

**解决方案**：
1. 增加 Vercel Function 的 `maxDuration`：
   ```json
   "maxDuration": 120
   ```
2. 降低 `max_tokens` 参数
3. 检查 LLM API 速率限制

### Q4: 环境变量未生效

**症状**：API 密钥错误或未定义

**解决方案**：
1. 在 Vercel 控制面板中验证环境变量已添加
2. 重新部署应用：`vercel --prod`
3. 检查前端代码是否正确读取环境变量（前端需要 `VITE_` 前缀）

### Q5: 数据持久化问题

**症状**：刷新页面后数据丢失

**解决方案**：
- 确保 `skills` 表中有数据：
  ```sql
  SELECT COUNT(*) FROM skills;
  ```
- 检查前端是否正确调用 `/api/skills` 获取数据

---

## 监控和日志

### Vercel 日志

```bash
# 实时查看日志
vercel logs <project-name> --follow

# 查看特定函数日志
vercel logs <project-name> --function evaluate-skill
```

### PostgreSQL 日志

```bash
# 连接到数据库
psql $DATABASE_URL

# 查看最近的评估结果
SELECT id, skill_id, final_score, created_at 
FROM evaluation_results 
ORDER BY created_at DESC LIMIT 10;

# 查看技能列表
SELECT id, name, version, created_at FROM skills;
```

---

## 安全建议

1. **API 密钥管理**：
   - 不要在代码中硬编码 API 密钥
   - 使用 Vercel 的 Environment Variables
   - 定期轮换密钥

2. **数据库安全**：
   - 如使用外部数据库，启用 SSL/TLS 连接
   - 定期备份数据库
   - 限制数据库访问 IP

3. **Admin Token**：
   - 使用强密码生成 Admin Token
   - `/api/init` 仅在初始化时调用，生产环境可删除或保护
   - 定期更新 Admin Token

4. **CORS 配置**：
   - 生产环境应限制 CORS 来源，不要使用 `*`
   - 在 `vercel.json` 中设置：
     ```json
     "headers": [
       {
         "source": "/api/:path*",
         "headers": [
           { "key": "Access-Control-Allow-Origin", "value": "https://your-domain.com" }
         ]
       }
     ]
     ```

---

## 后续步骤

1. **添加用户认证**：集成 Auth0、Clerk 或 NextAuth
2. **数据备份**：配置自动备份（Vercel Postgres 自动备份）
3. **CDN 和缓存**：配置静态资源缓存策略
4. **监控和告警**：集成 Sentry、DataDog 等监控工具
5. **API 速率限制**：添加 rate-limiting middleware
6. **数据库索引优化**：根据查询模式优化索引

---

## 支持和反馈

如遇到问题，请：
1. 查看 [Vercel 文档](https://vercel.com/docs)
2. 检查 [PostgreSQL 文档](https://www.postgresql.org/docs/)
3. 提交 Issue 或联系技术支持

---

**祝部署顺利！** 🎉
