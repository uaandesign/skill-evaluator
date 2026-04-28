---
name: skill-evaluator
description: 对 Codex skill 进行确定性的通用评估。用于需要为 skill 文件夹打分、审计、对比、准入检查或在专项测试、火山测试之前执行平台通用测试的场景。评估 SKILL.md 结构、触发描述、流程可执行性、渐进披露、资源集成、验证就绪度和安全性，并使用不依赖 LLM 的稳定评分规则。
---

# Skill 评估器

## 平台 Agent 读取摘要

本 `SKILL.md` 是平台 agent 的主读取入口。平台需要抽取评估维度、执行脚本、输出字段和判定规则时，优先读取本文件。

- 评估类型：通用评估
- 评估阶段：通用测试
- 标准版本：`generic-skill-rubric-v1`
- 总分：100
- 维度数量：6
- 评估脚本：`scripts/evaluate_skill.py`
- 人类说明文件：`references/evaluation-standard.md`
- 人类说明文件用途：给评审者解释评分标准，不作为平台 agent 的主解析入口
- 评分方式：确定性静态检查
- 稳定性要求：评估器本身不调用 LLM、不访问网络、不读取系统时间或文件修改时间

## Agent 执行流程

1. 接收目标 skill 文件夹路径。
2. 确认目标目录存在，并包含 `SKILL.md`。
3. 需要 Markdown 报告时运行：

```bash
python3 /path/to/skill-evaluator/scripts/evaluate_skill.py /path/to/target-skill --format md
```

4. 需要平台 JSON 时运行：

```bash
python3 /path/to/skill-evaluator/scripts/evaluate_skill.py /path/to/target-skill --format json --output report.json
```

5. 需要基线对比时运行：

```bash
python3 /path/to/skill-evaluator/scripts/evaluate_skill.py /path/to/target-skill --baseline-json baseline.json --format json --output report.json
```

## 评估维度

| 维度 ID | 维度名称 | 分值 | 平台解析说明 |
| --- | --- | ---: | --- |
| metadata_and_triggering | 元数据与触发能力 | 15 | 检查 `SKILL.md` frontmatter、`name`、`description` 和触发语义。 |
| procedural_usefulness | 流程可执行性 | 20 | 检查正文是否包含流程、输入、输出、验证和具体调用方式。 |
| progressive_disclosure_and_concision | 渐进披露与简洁性 | 15 | 检查正文简洁性、资源引用和模板残留。 |
| resource_integration | 资源集成 | 15 | 检查脚本、引用资料和资源目录是否可被稳定使用。 |
| validation_readiness | 验证就绪度 | 20 | 检查是否说明验证方式、成功标准、基线对比、证据产物和验证完整性。 |
| safety_and_operational_reliability | 安全性与运行可靠性 | 15 | 检查破坏性操作护栏、依赖权限说明、副作用约束和密钥反模式。 |

## 输出字段

JSON 输出必须包含：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `rubric_version` | string | 通用评分规则版本。 |
| `skill_path` | string | 被评估 skill 的绝对路径。 |
| `fingerprint` | string | 被评估内容的 SHA-256 指纹。 |
| `score` | number | 0-100 总分。 |
| `grade` | string | A、B、C、D 或 F。 |
| `generic_assessment` | object | 通用评估标签和原因。 |
| `category_scores` | object | 各一级维度得分。 |
| `checks` | array | 所有检查项明细。 |
| `baseline_comparison` | object | 仅在提供 `--baseline-json` 时输出。 |

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

平台应读取 `generic_assessment.tag` 作为通用评估结论。

| tag | 判定条件 |
| --- | --- |
| `通过` | 总分不低于 90，且所有一级维度得分均不低于该维度可得分的 70%。 |
| `警告` | 总分为 80-89，或任一一级维度得分低于该维度可得分的 70%。 |
| `不通过` | 总分低于 80。 |

## 资源

- `scripts/evaluate_skill.py`：平台 agent 执行的确定性评估脚本。
- `references/evaluation-standard.md`：面向人类评审者的完整标准解释。
