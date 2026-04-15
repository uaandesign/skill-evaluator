# Claude 401 错误 - 快速修复（5 分钟）

## ❌ 问题

```
Anthropic API error (401): invalid x-api-key
```

## ✅ 解决方案

选择以下任意一种方法：

---

## 方法 1️⃣：在配置中心添加 Claude（推荐，最简单）

### 5 步快速配置

1. **获取 API Key**
   ```
   打开 https://console.anthropic.com/api_keys
   点击 "Create Key"
   复制密钥（格式：sk-ant-...）
   ```

2. **打开 Skill Evaluator**
   ```
   访问 http://localhost:5173
   ```

3. **进入配置中心**
   ```
   点击左边栏的"配置中心"
   ```

4. **添加 Claude 配置**
   ```
   点击 "+ 添加新模型配置"
   选择：Anthropic (Claude)
   填写：
   - 显示名称：My Claude
   - 模型：claude-sonnet-4-6
   - API Key：粘贴你复制的 Key（sk-ant-...）
   点击：保存
   ```

5. **测试**
   ```
   选择新添加的 Claude
   点击"测试"运行评估
   完成！✅
   ```

---

## 方法 2️⃣：使用环境变量（仅限开发）

### 快速设置

```bash
# 1. 设置环境变量
export ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxxxxx"

# 2. 验证设置
echo $ANTHROPIC_API_KEY
# 应该显示你的 API Key

# 3. 重启服务器
npm run dev

# 完成！✅
```

---

## 诊断脚本（如果上述方法不工作）

```bash
# 运行诊断
node diagnose-claude.js

# 输出会显示：
# - API Key 是否被正确设置
# - 格式是否正确
# - 网络连接是否正常
# - 具体的修复建议
```

---

## 常见错误及修复

### ❌ 错误 1: API Key 格式错误

**症状**: 
```
invalid x-api-key
```

**检查**:
```
API Key 应该以 "sk-ant-" 开头
不应该包含空格
长度应该 > 20 个字符
```

**修复**:
```
1. 重新访问 https://console.anthropic.com/api_keys
2. 重新复制 API Key（确保完整）
3. 粘贴到配置中心
```

### ❌ 错误 2: 环境变量未设置

**症状**:
```
Anthropic API key 未配置，请在配置中心添加 Claude 模型或设置 ANTHROPIC_API_KEY 环境变量
```

**修复**:
```bash
# 设置环境变量
export ANTHROPIC_API_KEY="你的-API-Key"

# 或者在配置中心添加 Claude
```

### ❌ 错误 3: API Key 已过期

**症状**:
```
invalid x-api-key（即使格式正确）
```

**修复**:
```
1. 登录 https://console.anthropic.com/api_keys
2. 检查 API Key 是否仍然存在
3. 如果不存在或显示为已删除，创建新 Key
4. 更新配置中心或环境变量
```

---

## 验证修复成功

修复后，你应该看到：

- ✅ 在配置中心看到 Claude 为"已配置"
- ✅ 在技能评估器中能选择 Claude 配置
- ✅ 能成功运行评估（不再出现 401 错误）
- ✅ 看到评估结果（综合评分、维度评分等）

---

## 如果仍然不工作

1. **清除缓存并重启**
   ```bash
   # 1. 停止服务器（Ctrl+C）
   # 2. 清除缓存
   rm -rf node_modules/.cache
   npm run build
   # 3. 重启
   npm run dev
   # 4. 在浏览器硬刷新（Ctrl+Shift+R）
   ```

2. **检查 API 配额**
   ```
   访问 https://console.anthropic.com/account/billing/overview
   确认有可用的配额
   ```

3. **查看完整文档**
   ```
   打开: CLAUDE_API_FIX.md
   ```

---

## 需要帮助？

查看以下文件获取更多详细信息：
- 📖 `CLAUDE_API_FIX.md` - 完整的修复指南
- 🔧 `diagnose-claude.js` - 诊断工具

或访问：
- [Anthropic 官方文档](https://docs.anthropic.com/)
- [API Keys 管理](https://console.anthropic.com/api_keys)
