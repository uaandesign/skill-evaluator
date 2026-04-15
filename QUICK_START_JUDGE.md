# Judge 改进 - 快速开始指南

## 30 秒快速开始

### 1. 启动服务器
```bash
cd skill-evaluator
npm run dev
# 或
node server.js
```

### 2. 打开浏览器
访问 `http://localhost:5173`

### 3. 配置和运行评估
1. 进入"技能评估"页面
2. **选择模型**：推荐选择 Claude（需要配置 ANTHROPIC_API_KEY）
   - 如果只有其他模型，也可以使用，Judge 失败时会自动切换到 Claude
3. **选择或创建技能**
4. **添加测试用例**（至少 1 个）
5. **点击"测试"运行评估**

### 4. 查看改进的结果
✨ **你将看到**：
- 📊 **彩色编码的评分**：绿色（优）/ 黄色（中）/ 红色（差）
- 📈 **优化建议**：按优先级排序的改进建议
- 🔍 **清晰的弱点分析**：最低维度和常见问题
- 📥 **一键导出**：导出完整的 Markdown 报告

## Judge 调用验证

### 检查 Judge 是否成功调用
在服务器日志中查找以下信息：

```
✅ 成功的日志：
[evaluate-skill] Phase 2 开始调用 Judge 模型 (claude/claude-sonnet-4-6)...
[evaluate-skill] Judge 调用成功，耗时 8234ms，响应长度: 3456 字符
[evaluate-skill] Judge JSON 解析成功，包含字段: summary, dimensional_scores, detailed_results, weakness_analysis, optimization_suggestions
[evaluate-skill] 评估完成，通过 3/3，加权总分: 82

❌ 失败时会看到：
[evaluate-skill] Judge 模型调用失败 (qwen/qwen-long): 请求超时（单次 150s）
[evaluate-skill] 尝试使用 Claude 作为 Judge 备用模型...
[evaluate-skill] Claude 备用 Judge 调用成功  ← 注意：这里会自动恢复
```

## 新增 UI 特性

### 1️⃣ 彩色编码的评分卡片
```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ 综合评分        │  │ 质量等级        │  │ 测试通过        │
│ 82              │  │ A               │  │ 3 / 3           │
│ / 100           │  │                 │  │                 │
└─ Green ─────────┘  └─────────────────┘  └─────────────────┘
                      ← 左边框颜色编码（Green/Yellow/Red）
```

### 2️⃣ 优化建议展示
```
优化建议

🔴 高优先级 | 有用性
 ├─ 问题：输出内容不够完整
 └─ 建议：在结尾添加总结部分，预期提升 +5 分

🟡 中优先级 | 安全性
 ├─ 问题：存在潜在隐私泄露
 └─ 建议：移除敏感个人信息示例

🟢 低优先级 | 稳定性
 ├─ 问题：格式在某些情况下不一致
 └─ 建议：添加格式验证步骤
```

### 3️⃣ 弱点分析
```
弱点分析

最低得分维度：安全性
常见失败模式：
  · 输出包含敏感信息
  · 未验证输入安全性
  
系统性问题：
  · 缺少安全审查流程
```

## 故障排除

### 问题：Judge 调用失败（红色错误提示）

**检查清单：**
1. ✓ API Key 是否配置正确？
   ```bash
   echo $ANTHROPIC_API_KEY
   # 应该显示你的 API 密钥
   ```

2. ✓ 网络连接是否正常？
   ```bash
   ping api.anthropic.com  # 对于 Claude
   # 应该能 ping 通
   ```

3. ✓ 是否切换了模型？
   - 尝试换成 Claude（如果有配置的话）
   - Claude 通常最稳定

4. ✓ 查看详细日志
   ```bash
   # 重新启动服务器并观察日志
   node server.js 2>&1 | grep -A 2 "Judge"
   ```

### 问题：优化建议没有显示

**检查**：
- 评估是否完成成功？
- 是否有`optimization_suggestions`字段在响应中？
- 打开浏览器开发者工具（F12）检查 Network 选项卡

### 问题：UI 样式不对

**解决**：
1. 清除浏览器缓存
   - Ctrl+Shift+Delete（Windows/Linux）
   - Cmd+Shift+Delete（Mac）

2. 硬刷新页面
   - Ctrl+Shift+R（Windows/Linux）
   - Cmd+Shift+R（Mac）

3. 重新构建前端
   ```bash
   npm run build
   ```

## 环境变量配置

### 必须配置
```bash
# 推荐用于 Judge 备用模型
export ANTHROPIC_API_KEY="sk-ant-..."
```

### 可选配置
```bash
# 如果要使用其他模型作为主模型
export OPENAI_API_KEY="sk-..."  # for OpenAI
export QWEN_API_KEY="..."        # for Aliyun Qwen
```

## 性能指标（参考）

| 阶段 | 耗时 | 备注 |
|------|------|------|
| Phase 1 (执行) | 5-20s | 取决于模型和测试用例复杂度 |
| Phase 2 (Judge) | 5-30s | 主要耗时阶段 |
| Phase 3 (专项) | 3-10s | 如果配置了技能分类 |
| Phase 4 (火山) | 3-10s | 如果上传了规则 |
| **总计** | **15-70s** | 首次评估通常 30-50s |

## 常见问题

**Q: 为什么 Judge 调用这么慢？**
A: Judge 需要分析所有测试用例的执行结果，这是一个比较复杂的任务，通常需要 10-30 秒。这是正常的。

**Q: 可以跳过 Judge 吗？**
A: 不建议。Judge 是评估的核心，它提供了维度评分和优化建议。

**Q: Judge 失败后会怎样？**
A: 系统会自动尝试使用 Claude 作为备用。如果 Claude 也失败，会返回错误提示。

**Q: 为什么颜色有时候是绿有时候是黄？**
A: 这是根据评分自动设置的：
- 🟢 绿色：80+ 分（优秀）
- 🟡 黄色：60-79 分（可接受）
- 🔴 红色：<60 分（需改进）

## 下一步

1. 📖 查看 `JUDGE_IMPROVEMENT_SUMMARY.md` 了解技术细节
2. 🚀 查看 `DEPLOYMENT_CHECKLIST_JUDGE.md` 了解生产部署
3. 📋 查看 `ISSUE_6_SOLUTION.md` 了解完整的解决方案

## 支持

有问题？
1. 检查服务器日志（包含详细的调试信息）
2. 查看浏览器控制台（F12）
3. 参考本文档中的故障排除部分

祝你使用愉快！🚀
