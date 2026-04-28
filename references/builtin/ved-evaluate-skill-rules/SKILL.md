---
name: ved-evaluate-skill-rules
description: 对 VolcanoDesign 的 AI Skill 执行一期命名与结构规则评估。用于检查 skill 文件夹、内部唯一标识符、Repo 命名和 SKILL.md frontmatter 是否符合 ved- 前缀、kebab-case、ved 加动词加名词结构、禁用动词、3-5 词建议，以及标准目录结构要求。
---

# 火山 Skill 规则评估

## 平台 Agent 读取摘要

本 `SKILL.md` 是平台 agent 的主读取入口。平台需要抽取评估维度、执行脚本、输出字段和判定规则时，优先读取本文件。

- 评估类型：火山专项评估
- 评估阶段：一期，命名与结构
- 标准版本：`volcano-skill-rules-v1`
- Phase：`phase-1-naming-structure`
- 总分：100
- 维度数量：3
- 评估脚本：`scripts/evaluate_volcano_rules.py`
- 人类说明文件：`references/evaluation-standard.md`
- 人类说明文件用途：给评审者解释火山规则来源和细则，不作为平台 agent 的主解析入口
- 评分方式：确定性静态检查
- 稳定性要求：评估器本身在检查命名与结构规则时不调用 LLM、不访问网络、不读取系统时间或文件修改时间
- 范围限制：一期只评估命名和结构，不评估领域能力、工具效果、提示词质量或业务正确性

## Agent 执行流程

1. 接收目标 skill 文件夹路径。
2. 确认目标目录存在。
3. 需要 Markdown 报告时运行：

```bash
python3 /path/to/ved-evaluate-skill-rules/scripts/evaluate_volcano_rules.py /path/to/target-skill --format md
```

4. 需要平台 JSON 时运行：

```bash
python3 /path/to/ved-evaluate-skill-rules/scripts/evaluate_volcano_rules.py /path/to/target-skill --format json --output volcano-report.json
```

## 评估维度

| 维度 ID | 维度名称 | 分值 | 平台解析说明 |
| --- | --- | ---: | --- |
| naming_required_rules | 命名强制规则 | 55 | 检查 `ved-` 前缀、kebab-case、ved 加动词加名词结构、禁用泛动词和 3-5 词建议。 |
| skill_frontmatter | `SKILL.md` 与 frontmatter | 25 | 检查 `SKILL.md` 是否存在、是否包含 YAML frontmatter、`name` 是否与目录名一致、`description` 是否非空。 |
| directory_structure | 目录结构 | 20 | 检查 `SKILL.md` 是否在根目录、可选资源目录是否规范、是否存在未知顶层资源，以及资源路径类型是否正确。 |

## 一期检查范围

| 检查对象 | 检查内容 |
| --- | --- |
| 命名前缀 | 名称必须使用 `ved-` 前缀。 |
| 命名格式 | 名称必须使用 kebab-case。 |
| 命名结构 | 名称必须符合 ved 加动词加名词结构。 |
| 动词位置 | 动词必须紧跟 `ved-` 前缀。 |
| 禁用动词 | 首个动词不能是 `process`、`handle`、`do`、`run`、`manage`。 |
| 词数建议 | 名称建议为 3-5 个词，包含 `ved`。 |
| frontmatter | `SKILL.md` frontmatter `name` 必须与目录名一致。 |
| 目录结构 | 根目录必须包含 `SKILL.md`，可选资源目录为 `references/`、`scripts/`、`assets/`，允许 `agents/`。 |

## 输出字段

JSON 输出必须包含：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `standard_version` | string | 火山规则版本。 |
| `phase` | string | 当前评估阶段。 |
| `skill_path` | string | 被评估 skill 的绝对路径。 |
| `evaluated_name` | string | 被评估的名称。 |
| `fingerprint` | string | 被评估内容的 SHA-256 指纹。 |
| `score` | number | 0-100 总分。 |
| `volcano_assessment` | object | 火山规则评估标签和原因。 |
| `category_scores` | object | 各一级维度得分。 |
| `checks` | array | 所有检查项明细。 |
| `hard_failures` | array | 硬规则失败项。 |
| `warnings` | array | 建议项或警告项。 |

## 平台展示字段

平台展示时，优先使用以下中文字段，不要优先展示英文技术字段：

### category_scores

- `display_name_zh`：维度中文名称
- `description_zh`：维度中文说明
- `total_checks`：该维度检查项总数
- `passed_checks`：该维度通过项数量
- `failed_checks`：该维度未通过项数量

### checks

- `id`：检查项 ID
- `title_zh`：检查项中文标题
- `description_zh`：检查项中文解释说明
- `result_message_zh`：该检查项本次评估的中文结果
- `category_name_zh`：所属维度中文名称
- `evidence`：中文可展示结果，平台可以直接展示
- `debug_evidence`：英文调试证据，仅用于排查，不建议面向普通用户展示

## 判定规则

平台应读取 `volcano_assessment.tag` 作为火山规则评估结论。

| tag | 判定条件 |
| --- | --- |
| `通过` | 总分不低于 90，且没有硬规则失败和警告项。 |
| `警告` | 没有硬规则失败，但存在建议项问题或总分为 80-89。 |
| `不通过` | 存在硬规则失败，或总分低于 80。 |

## 资源

- `scripts/evaluate_volcano_rules.py`：平台 agent 执行的一期火山命名与结构评估脚本。
- `references/evaluation-standard.md`：面向人类评审者的完整标准解释。
