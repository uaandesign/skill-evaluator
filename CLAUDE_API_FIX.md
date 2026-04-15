# Claude API 401 认证错误修复指南

## ❌ 错误信息
```
Anthropic API error (401): invalid x-api-key
```

这表示 Claude API Key 未被正确配置或已过期。

---

## 🔍 快速诊断

### 问题清单

- [ ] **没有配置 API Key** - Claude 在配置中心没有添加，或环境变量未设置
- [ ] **API Key 格式错误** - API Key 应该以 `sk-ant-` 开头
- [ ] **API Key 已过期** - API Key 已失效或被删除
- [ ] **复制有误** - API Key 中包含多余的空格或字符
- [ ] **权限不足** - API Key 对应的账户没有足够的配额

---

## ✅ 修复方案（4 步）

### 方案 A：在配置中心添加 Claude（推荐）

**步骤 1**: 获取 Claude API Key
```
1. 访问 https://console.anthropic.com/
2. 登录你的 Anthropic 账户
3. 左侧菜单 → API Keys
4. 点击 "Create Key"
5. 复制新生成的密钥（格式：sk-ant-xxxxxxxxxx）
```

**步骤 2**: 在 Skill Evaluator 添加配置
```
1. 打开 Skill Evaluator
2. 进入"配置中心"选项卡
3. 点击"+ 添加新模型配置"
4. 选择提供商：Anthropic (Claude)
```

**步骤 3**: 填写配置信息
```
- 显示名称：My Claude（或任何名字）
- 模型：claude-sonnet-4-6（推荐）
- API Key：粘贴你复制的 API Key（sk-ant-...）
```

**步骤 4**: 保存和测试
```
1. 点击"保存"
2. 在技能评估器选择新添加的 Claude 配置
3. 运行一次评估测试
4. 确认成功完成
```

---

### 方案 B：使用环境变量（仅限开发）

如果你想让 Claude 自动作为 fallback 模型，可以设置环境变量：

```bash
# 方式 1：临时设置（当前终端会话）
export ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxx"

# 方式 2：永久设置（Unix/Linux/Mac）
# 添加到 ~/.bashrc 或 ~/.zshrc
echo 'export ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxx"' >> ~/.bashrc
source ~/.bashrc

# 方式 3：永久设置（Windows PowerShell）
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-ant-xxxxxxxxxx", "User")
# 然后重启 PowerShell

# 验证设置
echo $ANTHROPIC_API_KEY
# 应该显示你的 API Key
```

---

## 🔧 验证配置

### 检查 1：API Key 格式

```bash
# 你的 API Key 应该看起来像这样：
sk-ant-v7c4c0c4c4c4c4c4c4c4c4c4c4c4c4c4

# ❌ 不正确的格式：
sk-xxx...           # ← 不是以 ant 开头
AIzaSy...          # ← 这是 Google 的 Key
sk-proj-...        # ← 这是 OpenAI 的 Key
```

### 检查 2：环境变量

```bash
# 查看是否设置了环境变量
echo $ANTHROPIC_API_KEY

# 应该输出你的 API Key（如果已设置）
# 如果为空，说明环境变量未设置
```

### 检查 3：配置中心

```
打开 Skill Evaluator → 配置中心
看是否有任何 Claude 配置显示为"已配置"
```

---

## 🐛 常见问题和解决方案

### 问题 1: "API key 未配置"错误

**原因**: 既没有在配置中心添加 Claude，也没有设置环境变量

**解决**:
```bash
# 方案 A（推荐）：在配置中心添加（见上面的"方案 A"）

# 方案 B：设置环境变量
export ANTHROPIC_API_KEY="你的-API-Key"

# 重启服务器
npm run dev
```

### 问题 2: "invalid x-api-key"错误

**原因**: API Key 格式错误或已过期

**解决**:
```
1. 检查 API Key 是否以 "sk-ant-" 开头
2. 确认没有复制多余的空格
3. 登录 https://console.anthropic.com/ 检查 API Key 是否仍然有效
4. 如果过期，创建新 API Key
```

### 问题 3: 即使配置了仍然报错

**原因**: 服务器没有重启，或配置没有被正确保存

**解决**:
```bash
# 1. 重启服务器
npm run dev

# 2. 在浏览器中硬刷新
Ctrl+Shift+R  # Windows/Linux
Cmd+Shift+R   # Mac

# 3. 重新选择 Claude 模型
# 4. 再次运行评估
```

---

## 📋 配置检查清单

- [ ] 已在 [Anthropic Console](https://console.anthropic.com/) 创建 API Key
- [ ] API Key 格式正确（以 `sk-ant-` 开头）
- [ ] API Key 已经过验证（能访问对应的项目）
- [ ] 在 Skill Evaluator 配置中心添加了 Claude 配置
- [ ] 配置显示为"已配置"状态
- [ ] 模型选择为 `claude-sonnet-4-6` 或其他有效型号
- [ ] 服务器已重启
- [ ] 浏览器已硬刷新（清除缓存）
- [ ] 已成功运行一次评估测试

---

## 🔐 API Key 安全提示

⚠️ **重要**：不要将 API Key 提交到 Git 仓库！

```bash
# 确保 .gitignore 中有这些条目
echo "ANTHROPIC_API_KEY" >> .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
```

---

## 📚 相关资源

- 📖 [Anthropic 官方文档](https://docs.anthropic.com/)
- 🔑 [API Keys 管理](https://console.anthropic.com/api_keys)
- 📊 [使用额度和计费](https://console.anthropic.com/account/billing/overview)
- ⚠️ [API 限制](https://docs.anthropic.com/en/docs/resources/rate-limits)

---

## 🎯 成功标志

配置成功后，你应该看到：

✅ 在配置中心显示 Claude 为"已配置"  
✅ 在技能评估器中能选择 Claude 配置  
✅ 能成功运行评估（不再出现 401 错误）  
✅ Judge 模型如果使用其他供应商也能自动 fallback 到 Claude  

---

## 📞 如果仍未解决

1. **检查 API 配额**：https://console.anthropic.com/account/billing/overview
2. **查看 API 状态**：https://status.anthropic.com/
3. **查阅官方文档**：https://docs.anthropic.com/
4. **联系 Anthropic 支持**

---

**最后更新**: 2025-04-14  
**适用版本**: Skill Evaluator v2.0+
