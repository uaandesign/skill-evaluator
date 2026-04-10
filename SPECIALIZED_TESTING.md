# 专项评估功能测试验证指南

## 功能验证清单

### 模块1: 技能上传与类别选择

- [ ] **技能库 → 上传技能**
  - [ ] 表单包含"技能类别"选项（在"简介"字段之后）
  - [ ] 显示4个类别选项：
    - [ ] 文本生成类
    - [ ] 代码生成类
    - [ ] 数据采集类
    - [ ] 竞品调研类
  - [ ] 可以选择"不指定"（仅通用评估）
  - [ ] 选择类别后展示提示："已选择『XX类』，评估将包含通用评估(60%) + 专项评估(40%)"

- [ ] **Category持久化**
  - [ ] 上传完成后，切换到"技能编辑"或其他页面再回到"技能库"
  - [ ] 检查skill卡片或列表是否显示所选类别标签

### 模块2: 测试用例生成

- [ ] **技能评估 → 智能生成测试用例**
  - [ ] 选择一个带category的Skill
  - [ ] 点击"智能生成测试用例"
  - [ ] 检查生成的用例是否与Skill类别对应：

    **文本生成类应包括**:
    - [ ] "基础文本优化" (正常场景)
    - [ ] "专业术语准确性" (专业场景)
    - [ ] "边界情况 - 超长文本"

    **代码生成类应包括**:
    - [ ] "基础HTML/CSS代码生成" (正常场景)
    - [ ] "React组件生成" (专业场景)
    - [ ] "边界情况 - 复杂布局"

    **数据采集类应包括**:
    - [ ] "基础数据采集" (正常场景)
    - [ ] "大规模批量采集" (专业场景)
    - [ ] "敏感信息处理" (安全场景)

    **竞品调研类应包括**:
    - [ ] "竞品基本信息调研" (正常场景)
    - [ ] "竞品深度对比分析" (专业场景)
    - [ ] "行业趋势调研"

### 模块3: 三阶段评估执行

- [ ] **Phase 1 - 执行**
  - [ ] 控制台显示："[evaluate-skill] 开始执行 X 条测试用例"
  - [ ] 每条用例都获得actual_output和latency_ms

- [ ] **Phase 2 - Judge通用评估**
  - [ ] 控制台显示："[evaluate-skill] Phase 1 完成，开始 Phase 2 Judge 评估..."
  - [ ] 返回结果包含dimensional_scores (有用性/稳定性/准确性/安全性)

- [ ] **Phase 3 - 专项评估（仅category非空时）**
  - [ ] 对于有category的Skill：
    - [ ] 控制台显示："[evaluate-skill] 开始 Phase 3 专项评估（XXX）..."
    - [ ] 评估完成后显示："[evaluate-skill] Phase 3 完成，专项评分: XXX"
  - [ ] 对于无category的Skill：
    - [ ] 跳过Phase 3，直接完成
    - [ ] 控制台无"Phase 3"信息

### 模块4: 评分计算与合并

- [ ] **通用评分计算**
  - [ ] `generic_score = quality×40% + functionality×35% + safety×25%`
  - [ ] 返回的`summary.generic_score`符合此公式

- [ ] **专项评分计算**
  - [ ] `specialized_score = avg(4个维度分数) × 20`（1-5分 → 0-100分）
  - [ ] 返回的`summary.specialized_score`非null

- [ ] **总分合并**
  - [ ] 有专项评分：`overall_score = generic × 0.6 + specialized × 0.4`
  - [ ] 无专项评分：`overall_score = generic × 1.0`
  - [ ] `summary.overall_score`符合此逻辑

- [ ] **验证数值关系**
  ```
  示例：
  generic_score: 75
  specialized_score: 90
  overall_score: 应该 = 75×0.6 + 90×0.4 = 45 + 36 = 81 ✓
  ```

### 模块5: UI展示

- [ ] **综合评分卡片**
  - [ ] 显示overall_score
  - [ ] 显示quality_score、functionality_score、safety_score

- [ ] **评分构成进度条**
  - [ ] 仅当有specialized_score时显示
  - [ ] 显示3条进度条：质量维度、功能维度、安全合规
  - [ ] 数值准确（与summary匹配）

- [ ] **专项评估维度（新增）**
  - [ ] 显示"专项评估维度（XXX类，占比40%）"标题
  - [ ] 显示4个维度卡片，每个包含：
    - [ ] 维度名称
    - [ ] 1-5分评分
    - [ ] "/ 5 分"标签
    - [ ] 评分comment（如有）

- [ ] **优化建议合并**
  - [ ] 包含通用建议 + 专项建议
  - [ ] 按优先级排序（高 > 中 > 低）
  - [ ] 建议数量=通用建议数+专项建议数

### 模块6: 报告导出

- [ ] **导出按钮**
  - [ ] "技能评估"标签页右上角显示"导出报告 (MD)"按钮
  - [ ] 点击后下载Markdown文件（格式：评估报告_<技能名>_<日期>.md）

- [ ] **MD报告内容**
  - [ ] 包含技能名称、版本、测试模型、评估时间
  - [ ] 包含综合评分和评分构成表
  - [ ] **包含"维度评分详情"表格（新增）**，列出：
    - [ ] 维度名
    - [ ] 分数 (1-5分)
    - [ ] 映射百分分数 (0-100)
    - [ ] 权重归属 (通用/专项维度)
    - [ ] 评价说明
  - [ ] 包含测试执行过程（Phase 1结果）
  - [ ] 包含评估结果详情表格
  - [ ] 包含失败用例分析
  - [ ] **包含专项弱点分析（如有）**
  - [ ] **包含优化建议（通用+专项合并）**

### 模块7: 错误处理

- [ ] **无category的Skill**
  - [ ] 正常执行通用评估
  - [ ] 不报错，only_score = generic_score

- [ ] **专项评估LLM失败**
  - [ ] 保留通用评估结果
  - [ ] 控制台显示错误但不中断评估
  - [ ] 返回结果中specialized_score为null
  - [ ] overall_score = generic_score

- [ ] **格式错误的测试用例**
  - [ ] 两个都拒绝（Phase 1失败）
  - [ ] 返回错误提示

---

## 测试案例

### 测试案例1: 文本生成类Skill

**前提条件**:
- 创建一个markdown Skill，内容为文本优化指南
- 在上传时选择"文本生成类"

**执行步骤**:
1. 进入技能评估
2. 选择刚创建的Skill
3. 点击"智能生成测试用例"
4. 检查是否生成4条文本生成特定的用例
5. 点击"测试"执行评估
6. 等待完成

**预期结果**:
```
✓ 返回结果包含 specialized_dimensional_scores
✓ 包含4个维度: 可读性提升、专业度匹配、信息完整性、格式规范性
✓ 每个维度有1-5分的评分
✓ summary.specialized_score存在（不为null）
✓ summary.overall_score = generic × 0.6 + specialized × 0.4
✓ UI显示专项评估维度卡片
```

### 测试案例2: 代码生成类Skill

**前提条件**:
- 创建一个包含HTML/CSS示例的Skill
- 在上传时选择"代码生成类"

**执行步骤**:
1. 进入技能评估
2. 选择刚创建的Skill
3. 点击"智能生成测试用例"
4. 检查是否生成4条代码生成特定的用例
5. 点击"测试"

**预期结果**:
```
✓ 返回结果包含 specialized_dimensional_scores
✓ 包含4个维度: 语法正确性、可运行性、规范符合性、性能与安全
✓ summary.specialized_score存在
✓ 优化建议中有与代码相关的建议
```

### 测试案例3: 无category的Skill（对照组）

**前提条件**:
- 创建一个Skill但不选择类别

**执行步骤**:
1. 进入技能评估
2. 选择该Skill
3. 上传或生成测试用例
4. 点击"测试"

**预期结果**:
```
✓ 返回结果中 specialized_score = null
✓ 返回结果中 overall_score = generic_score
✓ UI不显示专项评估维度卡片
✓ 控制台无"Phase 3"日志
✓ 优化建议仅包含通用建议
```

### 测试案例4: 一键优化循环

**执行步骤**:
1. 评估一个有category的Skill，获得初始分数（如70分）
2. 点击"一键优化"
3. 确认后等待生成新版本（应该是v1.1、v1.2等）
4. 回到技能评估
5. 选择新版本，再次点击"测试"
6. 对比新旧版本的分数

**预期结果**:
```
✓ 新版本分数 >= 旧版本分数
✓ 版本号顺次递增（不是总是v1.1）
✓ 专项维度分数有改进
✓ overall_score上升
```

### 测试案例5: 报告导出完整性

**执行步骤**:
1. 评估一个有category的Skill
2. 点击"导出报告 (MD)"
3. 检查下载的文件

**预期结果**:
```
✓ 文件名格式: 评估报告_<技能名>_<日期>.md
✓ 包含"维度评分详情"表格，列出通用+专项维度
✓ 包含"专项评估维度"章节（标注占比40%）
✓ 包含"优化建议"章节，合并通用+专项建议
✓ MD格式正确，可正常渲染
```

---

## 性能测试

- [ ] **通用评估耗时**: ~45-60秒（Phase 1+2）
- [ ] **加上专项评估耗时**: ~50-65秒（Phase 1+2+3）
- [ ] **专项评估额外开销**: <5秒
- [ ] **并发评估**: 同时2个评估不应互相影响

---

## 浏览器兼容性

- [ ] Chrome 90+ ✓
- [ ] Firefox 88+ ✓
- [ ] Safari 14+ ✓
- [ ] Edge 90+ ✓

---

## 日志检查清单

在浏览器控制台或服务器日志中检查以下信息：

```
[evaluate-skill] 开始执行 5 条测试用例，模型: claude-opus-4-1
[evaluate-skill] Phase 1 完成，开始 Phase 2 Judge 评估 + Phase 3 专项评估...
[evaluate-skill]   [1/5] 执行用例: 测试用例1
[evaluate-skill]   [2/5] 执行用例: 测试用例2
...
[evaluate-skill] Phase 1 完成，开始 Phase 2 Judge 评估...
[evaluate-skill] 开始 Phase 3 专项评估（code-generation）...
[evaluate-skill] Phase 3 完成，专项评分: 88
[evaluate-skill] 评估完成，通过 4/5，加权总分: 81
```

---

## 调试技巧

### 检查是否成功进入Phase 3

在browser DevTools → Network中：
1. 过滤 `/api/evaluate-skill` 请求
2. 查看Request body是否包含 `skill_category`：
   ```json
   {
     "skill_category": "code-generation",
     ...
   }
   ```
3. 查看Response是否包含 `specialized_score` 和 `specialized_dimensional_scores`

### 验证评分合并逻辑

Response中检查：
```json
{
  "summary": {
    "generic_score": 75,
    "specialized_score": 90,
    "overall_score": 81  // 应该 = 75*0.6 + 90*0.4
  }
}
```

### 检查UI是否正确展示

在React DevTools中：
- 查看 `results` state是否包含 `specialized_dimensional_scores`
- 检查 `renderEvaluationTab()` 是否渲染专项维度卡片

---

## 已知限制

- [ ] 前端沙箱仅支持HTML/CSS/JS（不支持Node.js）
- [ ] 专项维度不可自定义（V1.1计划支持）
- [ ] 评估结果的稳定性受LLM影响（建议多次评估取平均）

---

## 验收标准

✅ **功能完整**: 上述所有模块均通过测试
✅ **性能达标**: 耗时 < 90秒（包含Phase 3）
✅ **UI正确**: 专项维度正确展示
✅ **导出完整**: 报告包含所有必要信息
✅ **无关键错误**: 日志无exception

---

**更新日期**: 2026年4月9日
**版本**: V1.0
