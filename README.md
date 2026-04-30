# Skill Evaluator

> 为 Claude Skill 打分的平台 — 基于规则评估 `SKILL.md` 的元数据完整性、流程可执行性、命名合规性等多维度，零大模型依赖，结果可复现。

[![Status](https://img.shields.io/badge/status-MVP_1.0-black)](#)
[![Node](https://img.shields.io/badge/node-≥20.x-black)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/python-≥3.x-black)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-black)](#license)

---

## ✨ 核心特性

- **🎯 确定性评估**：评估完全基于 Python 静态规则脚本，**不依赖大模型**，结果可复现，每次跑分一致
- **📋 多标准并行**：内置两套官方评估标准（通用 6 维度 + 火山一期命名结构），支持上传自定义标准
- **🤖 可选 LLM 增强**：评估完成后，配置 LLM API Key 可解锁智能优化建议（按失败检查项给出可执行修改方案）
- **📦 标准件即代码**：评估标准是一个完整的 Skill 文件夹（含 `SKILL.md` + `scripts/*.py`），可随业务规则演进随时更新
- **🎨 黑白极简 UI**：Hermes 风格的纯黑白配色，无干扰，专注内容
- **🚀 零云依赖部署**：可在任意 Node + Python 环境本地运行，无需云服务

---

## 🏗️ 工作流

```
┌─────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│ 1. 上传     │ →  │ 2. 确定性评估    │ →  │ 3. 可选优化（LLM）   │
│ Skill.zip   │    │ Python 脚本运行  │    │ 基于失败检查项生成   │
│ 或选已入库  │    │ 多标准并行 → JSON│    │ 建议或重写新版本    │
└─────────────┘    └──────────────────┘    └──────────────────────┘
                          │
                          ↓
                   ┌──────────────┐
                   │ 雷达图维度    │
                   │ 检查项明细    │
                   │ 通过/警告/    │
                   │ 不通过 标签   │
                   └──────────────┘
```

---

## 🚀 快速开始

### 系统要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 20.x（LTS） | 推荐 20，避免 Node 24 上的 npm 包兼容问题 |
| Python | 3.x | 评估脚本运行环境，macOS / Linux 一般已自带 |
| Git | 任意版本 | 克隆仓库 |
| PostgreSQL | 14+（可选） | 持久化评估历史；推荐免费 [Neon](https://neon.tech/) |

### 一键运行（无数据库模式）

```bash
git clone https://github.com/uaandesign/skill-evaluator.git
cd skill-evaluator
npm install && npm run build && npm start
# → http://localhost:3000
```

启动后访问 `http://localhost:3000`，**无需配置数据库即可使用全部评估功能**。

### 配置数据库（可选，启用历史记录）

```bash
# 1. 注册 Neon 免费账号 https://neon.tech，创建数据库
# 2. 复制连接串（必须是 -pooler 域名 + ?sslmode=require）

cp .env.example .env
# 编辑 .env，填入：
#   DATABASE_URL=postgresql://...-pooler.../db?sslmode=require
#   ADMIN_TOKEN=your-secret

# 3. 重启服务器
npm start
```

服务器启动时会自动跑 migration + seed 内置评估标准。

### 开发模式（热更新）

```bash
npm run dev
# 同时启动 Vite (5173) + dev-server (3001)
# → http://localhost:5173
```

---

## 📂 目录结构

```
skill-evaluator/
├── api/                              # serverless 风格 API（也被 server.js 自动挂载）
│   ├── evaluate.js                   # POST 评估端点（Python 静态规则）
│   ├── optimize.js                   # POST 优化建议（需 LLM）
│   ├── standards.js                  # CRUD 评估标准
│   ├── settings.js                   # 全局开关读写（app_settings）
│   ├── stats.js                      # 首页统计
│   └── health.js                     # 健康检查
├── lib/
│   ├── db.js                         # Neon Serverless Driver + ORM
│   ├── evaluator.js                  # Python 子进程评估器（核心）
│   └── bootstrap.js                  # 启动期 migration + seed
├── db/
│   ├── schema.sql                    # 完整 schema（首次部署用）
│   └── migrations/                   # 增量迁移脚本
├── references/builtin/               # 内置评估标准
│   ├── skill-evaluator/              # 通用评估（6 维度 100 分）
│   └── ved-evaluate-skill-rules/     # 火山一期（命名 + frontmatter + 目录）
├── src/                              # React 前端
│   ├── components/
│   │   ├── HomePage.jsx              # 首页（黑白 hermes 风）
│   │   ├── SkillEvaluatorModule.jsx  # 评估页（主流程）
│   │   ├── SkillEditorMVP.jsx        # 编辑器（含版本历史 + diff）
│   │   ├── ConfigCenter.jsx          # 配置中心（评估标准 / 模型 / 开关）
│   │   └── ...
│   └── store.js                      # Zustand 全局状态 + persist
├── server.js                         # 生产 Express 服务器
├── render.yaml                       # Render Blueprint（一键部署）
└── package.json
```

---

## 🧰 技术栈

| 层 | 选型 | 备注 |
|---|---|---|
| 前端 | **React 18** + **Vite 5** + **Ant Design 5** + **Zustand** | UI 主体 + 状态管理 |
| 图表 | **Recharts** | 雷达图、进度条 |
| Diff | **diff** | 编辑器版本对比 |
| 后端 | **Express** + **@neondatabase/serverless** | 一进程同时跑 dist 静态 + API 函数 |
| 数据库 | **PostgreSQL**（Neon） | 评估标准、版本历史、评估结果 |
| 评估器 | **Python 3** 子进程 | 确定性静态规则脚本 |
| 部署 | **Render**（推荐）/ Vercel / 自建 | 任意支持 Node + Python 的环境 |

---

## 🎯 评估标准（参考 Skill）

每个评估标准是一个完整的 Skill 文件夹，包含：

```
skill-evaluator/                # 评估器自身也是一个 Skill
├── SKILL.md                    # 评估器元数据（维度、分值、判定阈值）
├── scripts/
│   └── evaluate_skill.py       # 评估脚本（输入 skill 路径 → 输出 JSON 报告）
└── references/
    └── evaluation-standard.md  # 给人看的标准说明
```

**MVP 内置 2 个标准**：

### 1. 通用评估（generic-skill-rubric-v1）

| 维度 | 分值 | 检查内容 |
|---|---:|---|
| 元数据与触发能力 | 15 | frontmatter / name / description / 触发语义 |
| 流程可执行性 | 20 | 流程、输入、输出、验证、调用方式 |
| 渐进披露与简洁性 | 15 | 正文简洁性、资源引用、模板残留 |
| 资源集成 | 15 | 脚本、引用资料、资源目录 |
| 验证就绪度 | 20 | 验证方式、成功标准、基线对比、证据产物 |
| 安全性与运行可靠性 | 15 | 破坏性操作护栏、依赖权限、密钥反模式 |

### 2. 火山专项评估（一期：命名与结构）

| 维度 | 分值 | 检查内容 |
|---|---:|---|
| 命名强制规则 | 55 | `ved-` 前缀、kebab-case、ved+动词+名词、禁用泛动词、词数 |
| SKILL.md 与 frontmatter | 25 | SKILL.md 是否存在、YAML frontmatter、name 一致性 |
| 目录结构 | 20 | SKILL.md 在根目录、可选资源目录、未知顶层资源 |

判定规则：

| Tag | 条件 |
|---|---|
| **通过** | 总分 ≥ 90 且各维度均 ≥ 70% |
| **警告** | 80 ≤ 总分 < 90，或任一维度 < 70% |
| **不通过** | 总分 < 80 |

### 自定义标准

在 **配置中心 → 评估标准** 上传 zip 包（含 `SKILL.md` + `scripts/*.py`），平台自动解析入库。
评估时所有 `is_active=true` 的标准都会并行执行。

---

## 🔌 API 端点

主要 API 端点（生产 + 本地开发都可用）：

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/evaluate` | 评估一个 skill（接受 zip body / `skill_zip_base64` / `skill_id`） |
| `POST` | `/api/optimize` | 基于评估报告生成 LLM 优化建议（可选 `mode=rewrite` 直接重写） |
| `GET`  | `/api/standards` | 列出所有评估标准 |
| `POST` | `/api/standards` | 上传新评估标准 |
| `PATCH`| `/api/standards/:id?action=active` | 启用/停用 |
| `GET`  | `/api/settings` | 读取全局开关（如测试用例评估开关） |
| `PUT`  | `/api/settings/:key` | 更新单个开关 |
| `GET`  | `/api/stats` | 首页统计数据 |
| `GET`  | `/api/health` | 健康检查（含环境变量与 DB 连通性） |

完整的 `POST /api/evaluate` 调用示例：

```bash
curl -X POST http://localhost:3000/api/evaluate?save=true \
  -H "Content-Type: application/json" \
  -d '{
    "skill_content": "---\nname: my-skill\ndescription: ...\n---\n\n# My Skill\n...",
    "skill_name": "my-skill"
  }'
```

返回：

```jsonc
{
  "fingerprint": "<sha256>",
  "duration_ms": 1850,
  "results": [
    {
      "standard": { "standard_key": "skill-evaluator", "display_name": "通用评估" },
      "report": {
        "score": 78,
        "grade": "B",
        "generic_assessment": { "tag": "警告", "reason": "..." },
        "category_scores": { /* 6 个维度 */ },
        "checks": [ /* 30+ 检查项明细 */ ]
      }
    }
  ]
}
```

---

## ⚙️ 全局开关

在 **配置中心 → 评估标准** 可以切换：

| 开关 | 默认 | 作用 |
|---|---|---|
| `testcase_features_enabled` | `false` | MVP 一期关闭测试用例生成/评估流程（后端 + 前端 UI 双重门控） |
| `judge_model_scoring_enabled` | `false` | Python 评估失败时是否调用 LLM 兜底打分 |

切换实时生效，无需重启服务器。

---

## 🗺️ 路线图

### MVP 1.0 ✅（当前版本）

- [x] Python 子进程确定性评估
- [x] 内置通用 + 火山两套标准
- [x] 自定义标准上传 + 版本历史
- [x] 黑白极简 UI（首页 + 评估页 + 编辑器 + 配置中心）
- [x] 可选 LLM 优化建议（建议模式 + 重写模式）
- [x] Skill 版本编辑 + diff 对比
- [x] 全局开关（测试用例评估 / Judge 模型）

### MVP 2.0（计划中）

- [ ] 测试用例生成 + LLM 多阶段评估流程（默认开启）
- [ ] 评估历史趋势图（同一 skill 多版本得分变化）
- [ ] 自定义评估维度权重
- [ ] 多语言（i18n）
- [ ] CI/CD 集成（GitHub Actions 评估 PR 中的 SKILL.md）

### 长期

- [ ] 字节云迁移（已规划，server.js 已与平台无关）
- [ ] 团队协作（多用户、权限）
- [ ] 评估市场（公开标准件）

---

## 🛠️ 故障排查

| 问题 | 解决方案 |
|---|---|
| 启动后访问 `/api/health` 返回 502 | 检查 `DATABASE_URL` 是否带 `-pooler` 域名 + `?sslmode=require` |
| 评估时报 `spawn python3 ENOENT` | 系统没装 Python 3。Mac: `brew install python3`；Win: 去 [python.org](https://python.org) 下载 |
| `ACTIVE STANDARDS` 显示 0 | 数据库里 evaluation_standards 表是空的；检查 server 启动日志是否成功执行 `bootstrap.js` 的 seed 步骤 |
| 评估按钮 disable | 检查是否选了 skill 和版本；如果开了 Judge 或测试用例评估开关，还需配置评估模型 |
| `npm install` 报 `engines` 警告 | 把 Node 升到 20.x（推荐 LTS） |

---

## 🤝 贡献

欢迎提 Issue 和 Pull Request：

```bash
git clone https://github.com/uaandesign/skill-evaluator.git
cd skill-evaluator
npm install
npm run dev
```

修改完后跑一遍：

```bash
npm run build  # 确保前端构建通过
npm start      # 跑生产模式确认 server 正常启动
```

---

## 📄 License

MIT © 2026 [uaandesign](https://github.com/uaandesign)

---

## 🔗 链接

- **GitHub**：[uaandesign/skill-evaluator](https://github.com/uaandesign/skill-evaluator)
- **Issue Tracker**：[Issues](https://github.com/uaandesign/skill-evaluator/issues)
