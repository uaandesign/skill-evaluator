# UI/UX 改进计划

## 🎯 概述
基于用户反馈，计划改进技能库、技能测试和技能评估的界面和功能。

---

## 📋 改进清单

### 1️⃣ 技能库 - 搜索框和按钮间距
**状态**: 待修复
**问题**: 搜索框、过滤下拉框、视图切换按钮之间的间距不均匀，需要统一为 12px
**文件**: `src/components/SkillLibrary.jsx`
**位置**: 第 587-609 行
**修复方案**:
- 统一 gap 值为 12px
- 确保所有按钮和输入框对齐
- 调整 Space.Compact 的边距

### 2️⃣ 技能库 - 卡片视图和列表视图间距
**状态**: 待修复
**问题**: Row 的 gutter 默认为 [16, 16]，卡片之间间距不够
**文件**: `src/components/SkillLibrary.jsx`
**位置**: 第 629 行
**修复方案**:
- 将 Row gutter 改为 [20, 20] 或 [24, 24]
- 统一卡片和列表的间距

### 3️⃣ 技能库 - 卡片 Icon 替换
**状态**: 待修复
**问题**: 卡片右上角的"使用中"icon 和版本数的 icon（⊙）不够美观
**文件**: `src/components/SkillLibrary.jsx`
**位置**: 第 475-476 行（使用中icon），第 493 行（版本icon）
**修复方案**:
- 使用 Ant Design Icon（如 CheckCircleOutlined）替代"使用中"
- 使用更好看的 icon 替代 ⊙（如 FileTextOutlined、BookOutlined 等）

### 4️⃣ 技能库 - 版本和时间对齐
**状态**: 已有 alignItems: 'flex-end'，但可能需要优化
**问题**: 卡片底部版本信息和更新时间的对齐可能不够精确
**文件**: `src/components/SkillLibrary.jsx`
**位置**: 第 491-499 行
**修复方案**:
- 确保 flexDirection 是 row（默认）
- 版本数显示在左，时间显示在右
- 使用 flex-end 对齐底部

### 5️⃣ 技能测试 - 预览 Tab 显示代码而非效果
**状态**: 待修复
**问题**: 预览 tab 显示的是 HTML/CSS 代码（如 `vertical-align:middle; margin-left:4px...`）而不是最终的渲染效果
**文件**: `src/components/SkillEvaluatorModule.jsx` (技能评估中的预览)
         或 `src/components/CompareTest.jsx` (技能测试中的预览)
**根本原因**: 
- 大模型返回的可能是原始的 HTML/CSS 样式代码
- SimpleMarkdown 组件未能正确渲染这些 HTML
- cleanOutput 函数清理了 XML 标签但可能没有处理 HTML
**修复方案**:
- 改进 cleanOutput 函数，移除 HTML 样式标签（如 `style="..."`）
- 使用 HTML 实体编码（如 `&lt;` 代替 `<`）来显示代码
- 或者添加一个"显示代码"/"显示渲染"的切换按钮

### 6️⃣ 技能测试和技能评估 - 保留历史记录
**状态**: 待实现
**问题**: 用户无法查看以前的测试和评估结果，不便于对比
**文件**: `src/store.js`（添加新 state）
         `src/components/SkillEvaluatorModule.jsx`
         `src/components/CompareTest.jsx`
**修复方案**:
- 在 Zustand store 中添加 `testHistory` 和 `evaluationHistory`
- 保存每次测试/评估的结果，包括：
  - 时间戳
  - 模型
  - 输入
  - 输出
  - 耗时
- 在 UI 中添加历史记录面板，支持：
  - 查看历史结果列表
  - 对比不同时间的结果
  - 删除历史记录
  - 导出历史报告

---

## 📊 优先级

| 优先级 | 任务 | 预计时间 |
|--------|------|--------|
| 🔴 高 | 预览 Tab 显示代码问题 | 1-2 小时 |
| 🟡 中 | Icon 替换和间距调整 | 30-45 分钟 |
| 🟢 低 | 历史记录功能 | 2-3 小时 |

---

## 🔧 实现顺序

1. **优先修复预览 Tab**（用户反馈最明显）
2. **调整间距和 Icon**（快速改进 UI）
3. **添加历史记录**（功能增强）

---

## 📝 相关文件

| 组件 | 文件路径 | 主要函数 |
|------|---------|---------|
| 技能库 | `src/components/SkillLibrary.jsx` | `renderSkillCard`, `renderSkillListItem` |
| 技能测试 | `src/components/CompareTest.jsx` | `cleanOutput`, `runPanelTest` |
| 技能评估 | `src/components/SkillEvaluatorModule.jsx` | `renderEvaluationTab`, `renderTestResultsTab` |
| 状态管理 | `src/store.js` | `useStore` hooks |

---

## ✅ 完成标准

### 1. 间距和对齐
- [ ] 搜索框和按钮间距统一为 12px
- [ ] 卡片之间间距 ≥ 20px
- [ ] 版本和时间底部对齐

### 2. Icon 和样式
- [ ] 使用中 icon 为 ✓ 或类似
- [ ] 版本 icon 更换为文件相关 icon
- [ ] 所有样式与设计系统一致

### 3. 预览功能
- [ ] 预览 Tab 显示最终效果，不显示代码
- [ ] 代码显示正确（如需要）
- [ ] 可选：添加"源码"/"渲染"切换

### 4. 历史记录
- [ ] 保存测试历史
- [ ] 保存评估历史
- [ ] 支持查看和对比历史
- [ ] 支持删除历史

---

## 🚀 开始修复

需要我现在开始修复这些问题吗？建议的修复顺序：
1. 预览 Tab（最重要）
2. Icon 和间距（快速赢）
3. 历史记录（增强功能）
