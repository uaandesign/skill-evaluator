#!/usr/bin/env node

/**
 * Claude API 诊断工具
 * 用法: node diagnose-claude.js
 */

console.log('\n🔍 Claude API 诊断工具\n');

// 诊断 1: 检查环境变量
console.log('1️⃣  检查环境变量');
console.log('   检查 ANTHROPIC_API_KEY 是否被设置...');
const apiKey = process.env.ANTHROPIC_API_KEY;
if (apiKey) {
  const masked = apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4);
  console.log('   ✅ ANTHROPIC_API_KEY 已设置: ' + masked);
} else {
  console.log('   ❌ ANTHROPIC_API_KEY 未设置');
  console.log('   💡 运行: export ANTHROPIC_API_KEY="sk-ant-..."');
}

// 诊断 2: 检查 API Key 格式
console.log('\n2️⃣  检查 API Key 格式');
if (apiKey) {
  if (apiKey.startsWith('sk-ant-')) {
    console.log('   ✅ API Key 格式正确 (sk-ant-...)');
  } else {
    console.log('   ❌ API Key 格式不正确');
    console.log('   💡 正确格式应该以 "sk-ant-" 开头');
  }

  if (apiKey.includes(' ')) {
    console.log('   ❌ API Key 包含空格，可能是复制错误');
  } else {
    console.log('   ✅ API Key 不包含空格');
  }

  if (apiKey.length < 20) {
    console.log('   ❌ API Key 过短，可能不完整');
  } else {
    console.log('   ✅ API Key 长度合理 (' + apiKey.length + ' 字符)');
  }
} else {
  console.log('   ⏭️  跳过（未设置环境变量）');
}

// 诊断 3: 检查 package.json 依赖
console.log('\n3️⃣  检查依赖');
try {
  const pkg = require('./package.json');
  const hasFetch = !!pkg.dependencies['node-fetch'];
  const hasExpress = !!pkg.dependencies['express'];

  console.log('   ✅ node-fetch: ' + (hasFetch ? pkg.dependencies['node-fetch'] : '未安装'));
  console.log('   ✅ express: ' + (hasExpress ? pkg.dependencies['express'] : '未安装'));
} catch (e) {
  console.log('   ❌ 无法读取 package.json');
}

// 诊断 4: 网络连接检查
console.log('\n4️⃣  检查网络连接');
const https = require('https');
const testUrl = 'https://api.anthropic.com/v1/models';

const req = https.get(testUrl, (res) => {
  if (res.statusCode === 401) {
    console.log('   ⚠️  API 返回 401 (认证失败)');
    console.log('   💡 这可能表示 API Key 无效或已过期');
  } else if (res.statusCode === 200) {
    console.log('   ✅ 可以访问 api.anthropic.com');
  } else {
    console.log('   ⚠️  API 返回 ' + res.statusCode);
  }
  showRecommendations();
});

req.on('error', (e) => {
  if (e.code === 'ENOTFOUND') {
    console.log('   ❌ 无法连接到 api.anthropic.com (DNS 失败)');
    console.log('   💡 检查你的网络连接');
  } else {
    console.log('   ❌ 网络错误: ' + e.message);
  }
  showRecommendations();
});

function showRecommendations() {
  // 诊断 5: 建议
  console.log('\n5️⃣  建议和修复步骤');
  if (!apiKey) {
    console.log('🔧 修复步骤:');
    console.log('   1. 访问 https://console.anthropic.com/api_keys');
    console.log('   2. 创建或复制现有的 API Key');
    console.log('   3. 运行: export ANTHROPIC_API_KEY="sk-ant-..."');
    console.log('   4. 重启服务器: npm run dev');
  } else if (apiKey.startsWith('sk-ant-')) {
    console.log('✅ API Key 格式看起来正确');
    console.log('   可能的问题:');
    console.log('   - API Key 已过期 (在 Anthropic 控制台检查)');
    console.log('   - API 配额已用尽 (检查计费页面)');
    console.log('   - 服务器需要重启');
  } else {
    console.log('❌ API Key 格式不正确');
    console.log('   正确的 API Key 应该以 "sk-ant-" 开头');
  }

  console.log('\n📚 更多帮助:');
  console.log('   查看: CLAUDE_API_FIX.md\n');
}

