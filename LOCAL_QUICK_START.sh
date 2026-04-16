#!/bin/bash

# ═══════════════════════════════════════════════════════════════════
# Skill Evaluator — 本地快速启动脚本 (Local Quick Start)
# ═══════════════════════════════════════════════════════════════════

set -e

echo "════════════════════════════════════════════════════════════════"
echo "  Skill Evaluator — 本地开发快速启动"
echo "════════════════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────────────────────────
# 检查 Node.js
# ─────────────────────────────────────────────────────────────────
echo "✓ 检查 Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js >= 16.0.0"
    echo "   下载地址: https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "  当前版本: $NODE_VERSION"
echo ""

# ─────────────────────────────────────────────────────────────────
# 检查 .env.local
# ─────────────────────────────────────────────────────────────────
echo "✓ 检查环境变量配置..."
if [ ! -f ".env.local" ]; then
    echo "  ⚠️  .env.local 文件不存在，正在复制示例文件..."
    cp .env.example .env.local
    echo "  ✓ .env.local 已创建"
    echo ""
    echo "  ⚠️  请编辑 .env.local，至少配置一个 LLM API Key:"
    echo "     - OPENAI_API_KEY (推荐)"
    echo "     - ANTHROPIC_API_KEY"
    echo "     - 或其他支持的 API Key"
    echo ""
    echo "  编辑后再次运行此脚本。"
    exit 1
else
    echo "  ✓ .env.local 已存在"

    # 检查是否配置了 API Key
    if ! grep -q "^[A-Z_]*API_KEY=sk-\|^[A-Z_]*API_KEY=" .env.local | grep -v "^#"; then
        echo ""
        echo "  ⚠️  警告: 未检测到任何 LLM API Key 配置"
        echo "     请编辑 .env.local 文件，配置至少一个 API Key"
        echo ""
        exit 1
    fi
fi
echo ""

# ─────────────────────────────────────────────────────────────────
# 检查依赖
# ─────────────────────────────────────────────────────────────────
echo "✓ 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "  正在安装依赖（这可能需要几分钟）..."
    npm install
    echo "  ✓ 依赖安装完成"
else
    echo "  ✓ 依赖已安装"
fi
echo ""

# ─────────────────────────────────────────────────────────────────
# 启动应用
# ─────────────────────────────────────────────────────────────────
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "🚀 启动应用..."
echo ""
echo "   前端地址: http://localhost:5173"
echo "   后端地址: http://localhost:3001"
echo ""
echo "   按 Ctrl+C 停止应用"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

npm run dev
