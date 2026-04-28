# VolcanoDesign Skill & Tool 一期评估标准

Standard version：`volcano-skill-rules-v1`

Phase：`phase-1-naming-structure`

本文件面向人类评审者，用于解释火山规则来源、分值和细则。平台 agent 的主读取入口是同目录上级的 `SKILL.md`。

本标准来自《VolcanoDesign Skill & Tool 命名规则（规则汇总版）》中可直接执行的规则信息。一期仅检查命名和结构，不检查 skill 的领域能力、工具执行效果、提示词质量、业务正确性或火山内部专项能力。

## 适用范围

适用于 VolcanoDesign 部门的以下对象：

- AI Skill
- 工具类网站（Tool Site）
- 软件插件（Plugin）
- 工程代码库（Repo）
- 内部唯一标识符（ID）
- 文件夹路径

对外展示名称，例如网站标题、插件市场名称、UI 文案，不强制遵循本规则，应优先可读、易懂的人性化命名。

## 一期硬规则

硬规则失败会导致 `volcano_assessment.tag` 为 `不通过`。

### H1. 必须使用 `ved-` 前缀

所有内部命名必须添加 `ved-` 前缀。

目的：

- 明确资产归属。
- 避免全局命名冲突。
- 保持内部使用和对外协作一致。

### H2. 必须使用 kebab-case

统一使用全小写和中划线分隔。

允许：

- `ved-generate-ui-copy`
- `ved-fetch-design-token`

禁止：

- `GenerateUICopy`
- `ved_generate_ui_copy`
- `VED-GENERATE-UI-COPY`

### H3. 必须符合 `ved-<verb>-<noun>[-modifier]` 结构

基本结构：

```text
ved- + 动词 + - 名词 [- 修饰词]
```

动词必须紧跟 `ved-` 前缀，也就是 `ved-<verb>-...`。

### H4. 禁止使用语义过泛动词

以下动词禁止作为 `ved-` 后的首个动词：

- `process`
- `handle`
- `do`
- `run`
- `manage`

对应禁止前缀：

- `ved-process-`
- `ved-handle-`
- `ved-do-`
- `ved-run-`
- `ved-manage-`

### H5. `SKILL.md` frontmatter `name` 必须与目录名一致

目标 skill 的文件夹名应与 `SKILL.md` frontmatter 中的 `name` 字段一致。

示例：

```yaml
---
name: ved-generate-brand-guide
description: >
  为产品或项目生成品牌指南草稿，包含色彩、字体、图标风格建议。
  当用户提到「品牌规范」「视觉系统」「设计语言」「brand guide」时触发。
---
```

## 一期建议规则

建议规则失败不会直接判定为不通过，但会导致 `volcano_assessment.tag` 为 `警告`。

### W1. 命名建议控制在 3-5 个词

词数按中划线拆分，并包含 `ved` 前缀。

示例：

- `ved-summarize-brief`：3 词。
- `ved-generate-ui-copy`：4 词。
- `ved-extract-color-from-image`：5 词，可接受。

超过 5 个词通常意味着抽象层级过大，建议拆分为多个独立 Skill 或 Tool。

## 一期结构规则

目标 skill 推荐使用以下结构：

```text
ved-<verb>-<noun>/
├── SKILL.md
├── references/
├── scripts/
└── assets/
```

检查规则：

- `SKILL.md` 必须存在。
- `references/`、`scripts/`、`assets/` 是可选目录。
- `agents/` 作为 Codex 平台元数据目录允许存在，但不属于 VolcanoDesign 核心结构要求。
- 顶层其他目录会被标记为结构问题。
- 顶层常见 license 文件允许存在。

## 评分规则

总分为 100 分。

### 1. 命名强制规则：55 分

| ID | 分值 | 类型 | 检查项 |
| --- | ---: | --- | --- |
| N1 | 15 | 硬规则 | 目录名或目标名以 `ved-` 开头。 |
| N2 | 10 | 硬规则 | 名称使用 kebab-case，且不包含大写、下划线或空格。 |
| N3 | 10 | 硬规则 | 名称符合 `ved-<verb>-<noun>[-modifier]`，即至少包含 `ved`、动词、名词三段。 |
| N4 | 10 | 硬规则 | `ved-` 后的首个词不是禁用泛动词。 |
| N5 | 10 | 建议规则 | 名称为 3-5 个词，含 `ved` 前缀。 |

### 2. `SKILL.md` 与 frontmatter：25 分

| ID | 分值 | 类型 | 检查项 |
| --- | ---: | --- | --- |
| F1 | 5 | 硬规则 | `SKILL.md` 存在。 |
| F2 | 5 | 硬规则 | `SKILL.md` 包含 YAML frontmatter。 |
| F3 | 10 | 硬规则 | Frontmatter `name` 与目录名一致。 |
| F4 | 5 | 普通规则 | Frontmatter `description` 存在且非空。 |

### 3. 目录结构：20 分

| ID | 分值 | 类型 | 检查项 |
| --- | ---: | --- | --- |
| S1 | 5 | 硬规则 | `SKILL.md` 位于 skill 根目录。 |
| S2 | 5 | 普通规则 | 可选资源目录只使用 `references/`、`scripts/`、`assets/`；允许 `agents/`。 |
| S3 | 5 | 普通规则 | 顶层没有未知资源目录。 |
| S4 | 5 | 普通规则 | `references/`、`scripts/`、`assets/` 如果存在，必须是目录而不是文件。 |

## 评估标签

`volcano_assessment.tag` 固定为：

- `通过`：总分不低于 90，且没有硬规则失败和警告项。
- `警告`：没有硬规则失败，但存在建议项问题或总分为 80-89。
- `不通过`：存在硬规则失败，或总分低于 80。

## 稳定性要求

以下要求仅约束本评估器，不约束被评估 skill 的真实运行逻辑。分析类 skill、工具类 skill 或插件在真实执行任务时可以按自身设计调用 LLM 或访问网络；但本评估器的一期任务只检查命名和结构规则，这些规则可以通过静态分析判断，因此不需要 LLM 或网络参与。

评估器必须保持稳定：

- 评估命名与结构规则时，不调用 LLM。
- 评估命名与结构规则时，不访问网络。
- 不读取系统时间或文件修改时间。
- 文件路径排序后再参与哈希。
- 统一换行符后再计算 `fingerprint`。
- 同一内容重复评估必须得到同一 JSON 报告。
