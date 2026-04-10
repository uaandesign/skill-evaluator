# Skill Evaluator Platform — 架构设计

## 系统架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                   前端应用 (React + Vite)                    │
│              在 Vercel 部署 / 构建为静态资源                 │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTP/HTTPS
               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Vercel Serverless Functions                  │
│                                                             │
│  /api/skills          - 技能 CRUD                           │
│  /api/test-cases      - 测试用例管理                        │
│  /api/evaluate-skill  - 三阶段评估流程                      │
│  /api/model-configs   - 模型配置管理                        │
│  /api/export-report   - 评估报告导出                        │
│  /api/init            - 数据库初始化（一次性）              │
└──────────────┬──────────────────────────────────────────────┘
               │ SQL
               ▼
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                       │
│                                                             │
│  Tables:                                                    │
│  • skills - 技能定义                                        │
│  • test_cases - 测试用例                                    │
│  • evaluation_results - 评估结果                            │
│  • model_configs - 模型配置                                │
│  • skill_categories - 技能类别                              │
│  • audit_logs - 审计日志                                    │
└─────────────────────────────────────────────────────────────┘

               │ REST API
               ▼
┌─────────────────────────────────────────────────────────────┐
│                   外部 LLM API 供应商                        │
│                                                             │
│  • OpenAI (GPT-4, GPT-4o mini)                             │
│  • Anthropic (Claude Opus/Sonnet)                          │
│  • DeepSeek (DeepSeek-Chat, Reasoner)                      │
│  • Doubao (豆包 Seed/1.5)                                   │
│  • Qwen (通义千问)                                          │
│  • Gemini (Google Gemini)                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心模块

### 1. 前端（`src/`）

#### 组件结构
```
src/
├── components/
│   ├── SkillEvaluatorModule.jsx       # 主评估模块
│   ├── SkillLibrary.jsx               # 技能库管理
│   ├── SkillCategorySelector.jsx      # 技能分类选择
│   ├── CodeSandbox.jsx                # 代码沙箱
│   ├── ConfigCenter.jsx               # 模型配置中心
│   └── ...
├── store.js                           # Zustand 状态管理（本地持久化）
├── specializedRules.js                # 专项评估规则
├── utils/
│   └── specializedEvaluation.js       # 专项评估工具函数
└── App.jsx
```

#### 状态管理
- **Zustand Store** (`store.js`)
  - 本地浏览器存储（LocalStorage）
  - 支持 skills、modelConfigs、evaluationState 等
  - 在线版本应改为从数据库获取

### 2. 后端 API（`api/`）

#### Vercel Serverless Functions

**无状态设计**：
- 每个 HTTP 请求独立处理
- 不依赖本地文件系统
- 所有状态存储在 PostgreSQL

#### 核心 API 端点

| 端点 | 方法 | 功能 |
|-----|------|------|
| `/api/skills` | GET | 列出所有技能 |
| `/api/skills` | POST | 创建新技能 |
| `/api/skills/{id}` | GET | 获取技能详情 |
| `/api/skills/{id}` | PUT | 更新技能 |
| `/api/skills/{id}` | DELETE | 删除技能 |
| `/api/test-cases` | GET | 获取测试用例 |
| `/api/test-cases` | POST | 创建测试用例 |
| `/api/evaluate-skill` | POST | 执行评估 |
| `/api/model-configs` | GET/POST/PUT | 模型配置 |
| `/api/export-report` | POST | 导出评估报告 |
| `/api/init` | POST | 初始化数据库 |

### 3. 数据库（`db/`）

#### PostgreSQL Schema

**表设计**

```sql
skills
├─ id (UUID, PK)
├─ name (VARCHAR)
├─ description (TEXT)
├─ skill_content (TEXT)           -- SKILL.md 内容
├─ category_id (INT, FK)          -- 关联 skill_categories
├─ version (VARCHAR)              -- v1.0, v1.1, ...
├─ version_count (INT)            -- 版本号计数器
├─ created_at, updated_at
└─ created_by (VARCHAR)

test_cases
├─ id (UUID, PK)
├─ skill_id (UUID, FK)
├─ name, scenario
├─ input, expected_output
├─ test_type (正常/边界/异常)
├─ priority (高/中/低)
└─ created_at

evaluation_results
├─ id (UUID, PK)
├─ skill_id (UUID, FK)
├─ model_id (UUID, FK)
├─ test_case_id (UUID, FK)
│
├─ Phase 1: 执行
│  ├─ phase_1_output (TEXT)
│  ├─ phase_1_success (BOOLEAN)
│  └─ phase_1_error (TEXT)
│
├─ Phase 2: 通用评估
│  ├─ phase_2_quality_dimension
│  ├─ phase_2_functionality_dimension
│  ├─ phase_2_safety_dimension
│  ├─ phase_2_score
│  ├─ phase_2_evaluation
│  └─ phase_2_optimization_suggestions
│
├─ Phase 3: 专项评估
│  ├─ phase_3_dimensions (JSONB)
│  ├─ phase_3_score
│  ├─ phase_3_evaluation
│  └─ phase_3_optimization_suggestions
│
├─ final_score
├─ evaluation_duration_ms
├─ status, error_message
└─ created_at

model_configs
├─ id (UUID, PK)
├─ user_id (VARCHAR)
├─ provider (openai/anthropic/...)
├─ model (gpt-4o/claude-opus-4-6/...)
├─ api_key (ENCRYPTED)
├─ base_url (TEXT)
├─ is_default (BOOLEAN)
└─ created_at, updated_at

skill_categories
├─ id (INT, PK)
├─ category_key (text-generation/code-generation/...)
├─ category_name (中文名)
└─ description
```

#### 索引优化

```sql
-- 快速查询
CREATE INDEX idx_skills_name ON skills(name);
CREATE INDEX idx_skills_category ON skills(category_id);
CREATE INDEX idx_evaluation_results_skill ON evaluation_results(skill_id);
CREATE INDEX idx_evaluation_results_created ON evaluation_results(created_at DESC);
CREATE INDEX idx_model_configs_user ON model_configs(user_id);
```

---

## 评估流程（三阶段）

### Phase 1: 执行（Execution）
```
输入：SKILL.md + 测试用例
处理：LLM 按 SKILL.md 指令执行任务
输出：任务执行结果
```

**Prompt 结构**：
- System: SKILL.md 内容
- User: 测试输入

### Phase 2: 通用评估（Generic Evaluation）
```
输入：Phase 1 输出 + SKILL.md
维度：质量 40% + 功能 35% + 安全 25%
输出：四维评分 + 优化建议
```

**评估维度**：
| 维度 | 权重 | 分数范围 |
|-----|-----|--------|
| 质量维度（有用性） | 40% | 1-5 |
| 功能维度（稳定性） | 35% | 1-5 |
| 安全合规（准确性） | 25% | 1-5 |

**分数计算**：
```
通用评分 = 质量×40% + 功能×35% + 安全×25%
```

### Phase 3: 专项评估（Specialized Evaluation，可选）
```
输入：Phase 1 输出 + 技能类别 + 该类别的专项维度
维度：4 个类别 × 4 个维度 = 16 维度总数
输出：专项评分 + 优化建议
```

**四大类别**：

| 类别 | 维度 1 | 维度 2 | 维度 3 | 维度 4 |
|-----|-------|-------|-------|-------|
| **文本生成** | 可读性 | 准确性 | 相关性 | 完整性 |
| **代码生成** | 正确性 | 效率 | 可维护性 | 最佳实践 |
| **数据采集** | 完整性 | 准确性 | 鲁棒性 | 性能 |
| **竞品调研** | 深度 | 覆盖度 | 时效性 | 可操作性 |

**最终评分**：
```
总分 = 通用评分×60% + 专项评分×40%
```

---

## 数据流

### 1. 技能上传流程

```
用户界面
  │
  ├─ 上传 SKILL.md
  ├─ 选择技能类别
  └─ 点击上传
      │
      ▼
  POST /api/skills
      │
      ├─ 验证输入
      ├─ 保存到 skills 表
      ├─ 审计日志记录
      └─ 返回技能 ID
      │
      ▼
  前端更新技能列表
```

### 2. 评估流程

```
用户界面
  │
  ├─ 选择技能 + 模型 + 测试输入
  └─ 点击"评估"
      │
      ▼
  POST /api/evaluate-skill
      │
      ├─ Phase 1: 执行技能
      │  ├─ 调用 LLM（SKILL.md 作为 system prompt）
      │  └─ 获取输出
      │
      ├─ Phase 2: 通用评估
      │  ├─ 构造 Judge prompt
      │  ├─ 调用 LLM 评分
      │  └─ 计算加权分数
      │
      ├─ Phase 3: 专项评估（如果有 category）
      │  ├─ 构造专项 prompt
      │  ├─ 调用 LLM 评分
      │  └─ 合并评分
      │
      ├─ 保存到 evaluation_results 表
      └─ 返回完整评估结果
      │
      ▼
  前端展示评估结果
```

---

## API 调用重试机制

### Retry Policy（exponential backoff）

```javascript
// 最多 3 次重试
maxRetries: 3

// 基础延迟 1 秒
baseDelay: 1000

// 指数退避：1s → 2s → 4s
delay = baseDelay * 2^attempt

// 特殊处理
429 (Rate Limit) → 尊重 Retry-After 头，或 2 倍延长
503 (Service Unavailable) → 标准指数退避
404 (Not Found) → 直接报错不重试
```

### 优化参数

```javascript
// 所有 LLM 调用
temperature: 0              // 确定性输出
seed: 42                    // (OpenAI only) 固定随机种子

// 连接池配置
max: 20                     // 最大连接数
idleTimeoutMillis: 30000    // 空闲 30 秒断开
connectionTimeoutMillis: 2000  // 连接超时 2 秒
```

---

## 环境变量

### 必需
- `DATABASE_URL`: PostgreSQL 连接字符串
- `ADMIN_TOKEN`: Admin 初始化 token

### API 密钥（至少需要一个）
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `DEEPSEEK_API_KEY`
- `DOUBAO_API_KEY`
- `QWEN_API_KEY`
- `GEMINI_API_KEY`

### 前端配置
- `VITE_API_BASE_URL`: API 基础 URL
- `VITE_APP_NAME`: 应用名称
- `VITE_APP_VERSION`: 应用版本

---

## 性能特性

### 缓存策略
- **前端**：Zustand + LocalStorage（开发时）
- **数据库**：索引优化，避免全表扫描
- **API**：无缓存（评估结果实时计算）

### 并发限制
- **DB 连接池**：20 并发连接
- **Vercel Function**：3GB 内存，60 秒超时
- **LLM API**：取决于供应商速率限制

### 可观测性
- **日志**：控制台日志 + PostgreSQL audit_logs 表
- **监控**：Vercel Analytics + 自定义指标
- **性能**：evaluation_duration_ms 记录评估耗时

---

## 扩展点

### 1. 多租户支持
```sql
-- 添加 tenant_id 到各表
ALTER TABLE skills ADD COLUMN tenant_id VARCHAR(255);
ALTER TABLE model_configs ADD COLUMN tenant_id VARCHAR(255);
```

### 2. 权限管理
```javascript
// 添加 role-based access control (RBAC)
// 用户表 + 权限表
```

### 3. 实时通知
```javascript
// WebSocket 连接
// 评估进度实时推送
```

### 4. 高级缓存
```javascript
// Redis 缓存热点数据
// 如 skill 定义、category 列表
```

---

## 部署清单

- [ ] 创建 GitHub 仓库
- [ ] 配置 Vercel 环境变量
- [ ] 创建 PostgreSQL 数据库（Vercel Postgres 或外部）
- [ ] 运行 `/api/init` 初始化数据库
- [ ] 配置 LLM API 密钥
- [ ] 测试 API 端点
- [ ] 验证前端功能
- [ ] 配置监控告警
- [ ] 准备备份策略
- [ ] 文档和团队培训

---

**版本**：2.0.0 | **最后更新**：2025-04-10
