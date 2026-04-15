# Judge 模型改进部署检查清单

## 文件变更清单

### 后端文件
- ✅ `server.js` - Judge 调用错误处理和 fallback 机制改进
  - 行 1835-1893: Judge 调用、错误处理、fallback 逻辑
  - 行 1878-1934: Judge 响应解析
  - 新增日志：Judge 调用开始、成功、失败、fallback 尝试

### 前端文件
- ✅ `src/components/SkillEvaluatorModule.jsx` - 结果展示优化
  - 行 398-648: renderEvaluationTab 函数
  - 增强的摘要卡片（颜色编码）
  - 新增优化建议展示版块
  - 改进的弱点分析展示

## 部署步骤

### 1. 验证代码改动
```bash
cd skill-evaluator

# 检查 server.js 语法
node -c server.js

# 检查 package.json 依赖
npm list express node-fetch
```

### 2. 启动开发环境
```bash
# 安装依赖（如果需要）
npm install

# 启动开发 server（前台运行，便于查看日志）
npm run dev
# 或
node server.js
```

### 3. 构建前端
```bash
# 在另一个终端构建 React 应用
npm run build
```

### 4. 验证部署
- 打开浏览器访问 http://localhost:5173
- 检查是否有 JavaScript 错误
- 检查 Network 选项卡是否有 API 调用错误

## 测试场景

### 场景 1：正常 Judge 流程
1. **配置模型**：选择一个快速且可靠的模型（建议使用 Claude）
2. **创建或选择技能**：使用简单的技能定义
3. **添加测试用例**：2-3 个简单的测试用例
4. **运行评估**：点击"测试"按钮
5. **验证结果**：
   - ✓ 浏览器显示评估结果
   - ✓ 服务器日志显示 Judge 调用成功
   - ✓ 结果包含维度评分和建议

### 场景 2：Judge Fallback（可选）
1. **配置慢速模型**：选择 Qwen 等容易超时的模型
2. **确保配置了 Claude**：ANTHROPIC_API_KEY 环境变量已设置
3. **运行评估**：点击"测试"按钮
4. **观察日志**：
   - 应该看到 Qwen 超时消息
   - 然后看到 "尝试使用 Claude 作为 Judge 备用模型..."
   - 最后看到 Judge 调用成功

### 场景 3：结果显示验证
1. **评估完成后检查**：
   - ✓ 综合评分卡片显示正确的颜色编码
   - ✓ 质量等级显示为 A+/A/B/C/D
   - ✓ 维度评分显示 4 个维度和分数
   - ✓ 优化建议显示（如有）
   - ✓ 弱点分析显示
2. **导出报告**：
   - ✓ 点击"📥 导出报告"下载 Markdown 文件
   - ✓ 打开 Markdown 文件验证内容完整

## 环境要求

```
- Node.js >= 16
- npm >= 8
- 至少一个有效的 LLM API Key（推荐配置 Claude）
```

## 故障排除

### 问题 1：Judge 仍然报错
**可能原因**：
- API Key 无效或过期
- 网络连接问题
- 模型名称错误

**解决方案**：
1. 检查 API Key 是否正确配置
2. 测试网络连通性
3. 查看服务器日志获取详细错误信息
4. 尝试切换到 Claude（需要 ANTHROPIC_API_KEY）

### 问题 2：Fallback 没有工作
**可能原因**：
- 没有配置 ANTHROPIC_API_KEY 环境变量
- Claude 配置的 API Key 也无效

**解决方案**：
1. 设置 ANTHROPIC_API_KEY：
   ```bash
   export ANTHROPIC_API_KEY="your-key-here"
   ```
2. 重启服务器
3. 再次尝试评估

### 问题 3：结果显示不完整
**可能原因**：
- 前端代码未更新（缓存问题）
- 浏览器 React 开发者工具有错误

**解决方案**：
1. 清除浏览器缓存
2. 硬刷新（Ctrl+Shift+R 或 Cmd+Shift+R）
3. 重新构建前端：`npm run build`
4. 检查浏览器控制台错误

## 监控项

启动后，定期检查以下指标：

1. **Judge 成功率**
   - 预期：> 90% 的评估成功调用 Judge
   - 检查日志：`[evaluate-skill] Judge 调用成功`

2. **Fallback 触发率**
   - 预期：< 10%（仅在主模型超时时触发）
   - 检查日志：`[evaluate-skill] 尝试使用 Claude 作为 Judge`

3. **响应时间**
   - Phase 2 Judge：通常 5-30 秒
   - 如果 > 60 秒，可能表示网络问题

4. **结果质量**
   - 维度评分：必须为 1-5 的整数
   - 优化建议：必须包含 dimension, priority, issue, suggestion

## 回滚计划

如果部署后发现问题，可以回滚到之前的版本：

```bash
# 保存当前改动（可选）
git stash

# 检出之前的版本
git checkout HEAD~1 server.js src/components/SkillEvaluatorModule.jsx

# 重启服务器
npm run dev
```

## 文档和支持

- 查看 `JUDGE_IMPROVEMENT_SUMMARY.md` 了解改进细节
- 查看 `server.js` 行 1835-1893 了解 Judge 实现
- 查看 `src/components/SkillEvaluatorModule.jsx` 行 398-648 了解 UI 实现

## 成功标志

✅ 部署成功的标志：

1. 服务器启动无错误
2. 首次评估中 Judge 被调用并返回结果
3. 结果页面显示完整的评估数据
4. 可以导出 Markdown 报告
5. 浏览器控制台没有 React 错误
6. 所有维度评分都显示正确的值
7. 优化建议按优先级排序并显示
