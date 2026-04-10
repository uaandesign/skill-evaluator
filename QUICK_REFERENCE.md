# 快速参考卡（Quick Reference）

## 📌 5 分钟快速部署

### 1. 本地准备
```bash
cd skill-evaluator
npm install
npm run build
```

### 2. 推送到 GitHub
```bash
git add . && git commit -m "Deploy to Vercel" && git push
```

### 3. Vercel 部署
1. 访问 [vercel.com/new](https://vercel.com/new)
2. 导入 GitHub 仓库
3. 添加环境变量（见下表）
4. 部署

### 4. 初始化数据库
```bash
curl -X POST https://YOUR_DOMAIN.vercel.app/api/init \
  -H "x-admin-token: YOUR_ADMIN_TOKEN"
```

---

## 🔧 环境变量速查表

| 变量 | 值 | 来源 |
|-----|-----|------|
| `DATABASE_URL` | `postgresql://...` | Vercel Postgres 或 AWS RDS |
| `OPENAI_API_KEY` | `sk-...` | [platform.openai.com](https://platform.openai.com) |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | [console.anthropic.com](https://console.anthropic.com) |
| `ADMIN_TOKEN` | `<generate>` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NODE_ENV` | `production` | 固定值 |
| `VITE_API_BASE_URL` | `https://your-domain.vercel.app` | 部署后填写 |

---

## 📝 项目文件结构

```
skill-evaluator/
├── api/                          # Vercel Functions
│   ├── init.js                  # 数据库初始化
│   ├── skills.js                # 技能 CRUD
│   ├── evaluate-skill.js        # 三阶段评估
│   └── ...
├── db/
│   └── schema.sql               # PostgreSQL Schema
├── lib/
│   ├── db.js                    # ORM 和数据库操作
│   └── ...
├── scripts/
│   └── init-db.js               # 初始化脚本
├── src/                          # React 前端
│   ├── components/
│   ├── store.js                 # Zustand 状态
│   └── App.jsx
├── vercel.json                  # Vercel 配置
├── package.json                 # 依赖和脚本
└── 文档/
    ├── DEPLOYMENT_GUIDE.md      # 详细部署指南
    ├── ARCHITECTURE.md          # 架构设计
    └── DEPLOYMENT_CHECKLIST.md  # 检查清单
```

---

## 🚀 常用命令

```bash
# 开发环境
npm run dev                      # 本地开发（前后端）

# 构建
npm run build                    # 构建前端 + Vercel Functions

# 数据库
npm run db:init                  # 初始化数据库（需要 DATABASE_URL）
DATABASE_URL=... npm run db:init  # 指定数据库

# Vercel 相关
vercel login                     # 登录 Vercel
vercel link                      # 关联 Vercel 项目
vercel logs                      # 查看实时日志
vercel env ls                    # 列出环境变量
```

---

## 📊 API 端点

| 端点 | 方法 | 功能 |
|-----|------|------|
| `/api/skills` | GET | 获取所有技能 |
| `/api/skills` | POST | 创建技能 |
| `/api/skills/{id}` | GET | 获取技能详情 |
| `/api/skills/{id}` | PUT | 更新技能 |
| `/api/skills/{id}` | DELETE | 删除技能 |
| `/api/evaluate-skill` | POST | 执行评估 |
| `/api/model-configs` | GET/POST | 管理模型配置 |
| `/api/init` | POST | 初始化数据库 |

---

## 🔍 故障排查

### 数据库连接失败
```bash
# 检查连接字符串
echo $DATABASE_URL

# 验证连接
psql $DATABASE_URL -c "SELECT 1"
```

### 初始化脚本失败
```bash
# 查看详细错误
vercel logs --function init

# 手动运行初始化脚本
DATABASE_URL="..." node scripts/init-db.js
```

### API 返回 404
```bash
# 检查 Vercel 部署是否完成
vercel list deployments

# 查看构建日志
vercel logs --build
```

### 评估超时
```json
// 在 vercel.json 中增加超时时间
"maxDuration": 120
```

---

## 📱 监控清单

- [ ] 访问 `https://your-domain.vercel.app`，确保页面加载
- [ ] 调用 `/api/skills`，确保返回 `{"skills":[]}`
- [ ] 上传技能，确保 API 返回成功
- [ ] 运行评估，确保完成且有结果
- [ ] 检查 PostgreSQL，确保数据已保存

---

## 🔐 安全要点

1. **API 密钥**
   - ✅ 使用 Vercel 环境变量管理
   - ❌ 不要在代码中硬编码

2. **数据库**
   - ✅ 使用 SSL/TLS 连接
   - ❌ 不要在日志中暴露连接字符串

3. **Admin Token**
   - ✅ 使用强密码生成
   - ❌ 生产环境禁用 `/api/init`

---

## 💡 性能优化建议

| 优化项 | 方法 | 预期效果 |
|------|------|---------|
| 数据库查询 | 添加索引 | -30% 查询时间 |
| 并发连接 | 增加连接池 | 支持更多用户 |
| Function 超时 | 调整 maxDuration | 支持更复杂评估 |
| 缓存 | 使用 Redis | -50% API 响应时间 |

---

## 🎯 核心工作流

```
上传 SKILL.md
    ↓
选择技能分类（可选）
    ↓
配置 LLM 模型
    ↓
输入测试用例
    ↓
点击"评估"
    ↓
Phase 1: 执行技能
    ↓
Phase 2: 通用评估（4维）
    ↓
Phase 3: 专项评估（如有分类）
    ↓
展示评估结果 + 优化建议
    ↓
导出报告（MD格式）
```

---

## 📞 获取帮助

| 问题 | 资源 |
|-----|------|
| Vercel 部署 | [vercel.com/docs](https://vercel.com/docs) |
| PostgreSQL 用法 | [postgresql.org/docs](https://postgresql.org/docs) |
| Node.js API | [nodejs.org/docs](https://nodejs.org/docs) |
| React/Zustand | [zustand-demo.vercel.app](https://zustand-demo.vercel.app) |

---

## 📅 维护周期

| 频率 | 任务 |
|-----|------|
| 日 | 检查 Vercel 日志，监控错误率 |
| 周 | 验证数据库连接，检查磁盘使用 |
| 月 | 轮换 API 密钥，备份数据库 |
| 季 | 更新依赖包，性能优化 |

---

**版本**：2.0.0 | **更新**：2025-04-10 | **快速参考** ⚡
