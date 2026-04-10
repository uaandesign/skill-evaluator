# Skill Evaluator Platform — 部署检查清单

> **预计部署时间**：30-45 分钟

---

## 📋 部署前准备

### 第 1 步：获取必需信息（5 分钟）

- [ ] **Vercel 账户** - 访问 [vercel.com](https://vercel.com) 注册
- [ ] **GitHub 账户** - 用于连接代码仓库
- [ ] **PostgreSQL 数据库**
  - [ ] 选择 Vercel Postgres（推荐）或外部数据库
  - [ ] 获取 `DATABASE_URL`
- [ ] **Admin Token** - 执行以下命令生成：
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] **LLM API 密钥**（至少选择一个）
  - [ ] OpenAI: `OPENAI_API_KEY`
  - [ ] Anthropic: `ANTHROPIC_API_KEY`
  - [ ] DeepSeek: `DEEPSEEK_API_KEY`
  - [ ] Doubao: `DOUBAO_API_KEY`
  - [ ] Qwen: `QWEN_API_KEY`
  - [ ] Gemini: `GEMINI_API_KEY`

### 第 2 步：本地验证（5 分钟）

```bash
cd skill-evaluator

# 安装依赖（包括 pg）
npm install

# 验证 build
npm run build

# 验证数据库 schema（可选）
DATABASE_URL=<测试数据库> npm run db:init
```

- [ ] 依赖安装成功
- [ ] 构建完成（无错误）
- [ ] package.json 已更新（包含 pg 和新脚本）

---

## 🚀 Vercel 部署

### 第 3 步：代码准备（5 分钟）

```bash
# 推送到 GitHub
git init
git add .
git commit -m "Deploy Skill Evaluator to Vercel + PostgreSQL"
git remote add origin https://github.com/YOUR_USERNAME/skill-evaluator.git
git push -u origin main
```

- [ ] 代码已推送到 GitHub
- [ ] GitHub 上的文件包括：
  - [ ] `api/` 目录（Vercel Functions）
  - [ ] `db/schema.sql`（数据库 Schema）
  - [ ] `vercel.json`（Vercel 配置）
  - [ ] `scripts/init-db.js`（初始化脚本）
  - [ ] `.env.example`（环境变量示例）

### 第 4 步：Vercel 项目配置（10 分钟）

1. **创建项目**
   - [ ] 访问 [vercel.com/new](https://vercel.com/new)
   - [ ] 点击 **Import Git Repository**
   - [ ] 选择 `skill-evaluator` 仓库
   - [ ] 点击 **Import**

2. **配置环境变量**
   - 进入 **Settings** → **Environment Variables**
   - 添加以下变量：

| 变量名 | 值 | 备注 |
|-------|-----|------|
| `DATABASE_URL` | `postgresql://...` | 从 Vercel Postgres 或外部 DB 获取 |
| `OPENAI_API_KEY` | `sk-...` | 如果使用 OpenAI |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | 如果使用 Claude |
| `DEEPSEEK_API_KEY` | `sk-...` | 如果使用 DeepSeek |
| `DOUBAO_API_KEY` | `...` | 如果使用豆包 |
| `QWEN_API_KEY` | `...` | 如果使用通义千问 |
| `GEMINI_API_KEY` | `...` | 如果使用 Gemini |
| `ADMIN_TOKEN` | `<生成的 token>` | **重要** |
| `NODE_ENV` | `production` | |
| `VITE_API_BASE_URL` | `https://your-project.vercel.app` | 部署后更新 |

   - [ ] 所有环境变量已添加
   - [ ] **Deploy** 自动触发

3. **验证部署**
   - [ ] 部署日志中无红色错误
   - [ ] 部署时间 < 5 分钟
   - [ ] 生成的 URL：`https://<project>.vercel.app`

---

## 🗄️ 数据库初始化

### 第 5 步：初始化 PostgreSQL（5 分钟）

部署完成后，初始化数据库：

**方法 1：通过 HTTP 请求（推荐）**

```bash
curl -X POST https://<your-project>.vercel.app/api/init \
  -H "x-admin-token: <your-admin-token>" \
  -H "Content-Type: application/json"
```

预期响应：
```json
{
  "success": true,
  "message": "数据库初始化成功",
  "timestamp": "2025-04-10T12:34:56.000Z"
}
```

**方法 2：本地初始化**

```bash
DATABASE_URL="<your-production-db-url>" npm run db:init
```

- [ ] 数据库初始化成功
- [ ] 所有表已创建：
  - [ ] `skill_categories`
  - [ ] `skills`
  - [ ] `test_cases`
  - [ ] `evaluation_results`
  - [ ] `model_configs`
  - [ ] `specialized_dimensions`
  - [ ] `audit_logs`

---

## ✅ 部署验证

### 第 6 步：功能测试（10 分钟）

1. **访问应用**
   ```bash
   open https://<your-project>.vercel.app
   ```
   - [ ] 页面加载（无白屏）
   - [ ] UI 正常渲染

2. **测试 API**
   ```bash
   # 获取技能列表（应为空）
   curl https://<your-project>.vercel.app/api/skills
   
   # 预期：{"skills":[]}
   ```
   - [ ] API 返回 200 状态码
   - [ ] 返回有效 JSON

3. **上传技能**
   - [ ] 在 UI 中上传一个测试 SKILL.md
   - [ ] 检查数据库：
     ```sql
     SELECT COUNT(*) FROM skills;  -- 应为 1
     ```

4. **配置模型**
   - [ ] 添加 LLM 模型配置
   - [ ] 测试连接（应显示 ✓）

5. **运行评估**
   - [ ] 选择技能 + 模型 + 测试输入
   - [ ] 点击评估
   - [ ] 等待结果（3-10 秒，取决于 LLM）
   - [ ] 检查评估结果显示
   - [ ] 检查数据库：
     ```sql
     SELECT COUNT(*) FROM evaluation_results;  -- 应 > 0
     ```

---

## 📊 生产环境检查

### 第 7 步：监控和维护（进行中）

- [ ] **配置 Vercel 告警**
  - [ ] 错误率告警
  - [ ] Function 超时告警
  - [ ] 构建失败通知

- [ ] **数据库备份**
  - [ ] Vercel Postgres 自动备份已启用
  - [ ] 如使用外部 DB，配置自动备份

- [ ] **查看日志**
  ```bash
  # 实时日志
  vercel logs --follow
  ```

- [ ] **性能监控**
  - [ ] 检查 Vercel Analytics
  - [ ] 评估延迟是否 < 10 秒

---

## 🔒 安全配置

- [ ] **API 密钥**
  - [ ] 不在代码中暴露（✓ 使用环境变量）
  - [ ] 定期轮换密钥
  - [ ] 监控 API 使用量

- [ ] **数据库安全**
  - [ ] 如使用外部 DB，启用 SSL/TLS
  - [ ] 限制数据库访问 IP（如可行）

- [ ] **Admin Token**
  - [ ] 部署后删除或禁用 `/api/init` 端点
  - [ ] 定期更新 `ADMIN_TOKEN`

- [ ] **CORS 配置**
  - [ ] 生产环境应限制 CORS 来源
  - [ ] 更新 `vercel.json` 中的 `Access-Control-Allow-Origin`

---

## 📚 文档和资源

生成的文档（已包含在项目中）：

- [ ] **DEPLOYMENT_GUIDE.md** - 详细部署指南（含故障排查）
- [ ] **ARCHITECTURE.md** - 系统架构设计
- [ ] **.env.example** - 环境变量模板
- [ ] **vercel.json** - Vercel 配置文件
- [ ] **db/schema.sql** - PostgreSQL Schema
- [ ] **scripts/init-db.js** - 数据库初始化脚本

---

## 🎯 后续优化（可选）

部署完成后，可进行以下优化：

1. **用户认证**
   - 集成 Auth0、Clerk 或 NextAuth
   - 多租户支持

2. **性能优化**
   - Redis 缓存热数据
   - CDN 加速静态资源

3. **高可用性**
   - 多区域部署
   - 自动故障转移

4. **监控增强**
   - 集成 Sentry（错误跟踪）
   - 集成 DataDog（APM）

5. **功能扩展**
   - 实时评估进度推送（WebSocket）
   - 批量评估支持
   - 评估历史对比

---

## 📞 常见问题

**Q: 如何切换 LLM 供应商？**
- 修改环境变量中的 API 密钥
- 在应用的 ConfigCenter 中选择不同供应商

**Q: 数据持久化是否有效？**
- 检查 PostgreSQL 连接正常
- 运行 `SELECT 1` 验证连接
- 查看 database 中的数据

**Q: 如何回滚部署？**
- Vercel → **Deployments** → 选择之前的版本 → **Promote to Production**

**Q: 如何增加 Function 超时？**
- 编辑 `vercel.json`：`"maxDuration": 120`（最多 120 秒）
- 重新部署

---

## ✨ 部署完成清单

- [ ] 应用在线访问
- [ ] 所有 API 端点可用
- [ ] 数据库完整初始化
- [ ] LLM 模型配置通过测试
- [ ] 至少成功运行一次评估
- [ ] 数据已持久化到数据库
- [ ] 监控和告警已配置
- [ ] 安全配置已应用
- [ ] 团队已通知部署完成
- [ ] 文档已更新

---

**🎉 恭喜！Skill Evaluator 已成功部署到 Vercel + PostgreSQL！**

如有问题，请参考 **DEPLOYMENT_GUIDE.md** 中的故障排查部分。

---

**开始日期**：_____  
**完成日期**：_____  
**部署者**：_____  
**备注**：_____
