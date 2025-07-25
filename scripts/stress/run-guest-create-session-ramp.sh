#!/bin/bash

# guest创建会话阶梯式压力测试运行脚本
# 支持自定义并发数参数

echo "🚀 启动Guest创建会话阶梯式压力测试..."

# 默认并发数
DEFAULT_VUS=100

# 从命令行参数获取并发数，如果没有提供则使用默认值
TARGET_VUS=${1:-$DEFAULT_VUS}

echo "🎯 目标并发数: $TARGET_VUS (1分钟爬坡→5分钟稳定→30秒归零)"
echo "📁 切换到测试脚本目录..."

# 切换到脚本所在目录
cd "$(dirname "$0")"

echo "⚡ 开始执行K6测试..."
echo "命令: k6 run -e TARGET_VUS=$TARGET_VUS guest-create-session-ramp-test.js"
echo "----------------------------------------"

# 执行K6测试，传入并发数参数
k6 run -e TARGET_VUS=$TARGET_VUS guest-create-session-ramp-test.js

# 检查测试结果
if [ $? -eq 0 ]; then
    echo "✅ 测试执行完成"
else
    echo "❌ 测试执行失败"
    exit 1
fi

echo "📊 测试报告已生成，请查看K6输出结果"
echo "🔧 提示：可通过 ./run-guest-create-session-ramp.sh [目标并发数] 自定义目标并发数"
echo "   示例: ./run-guest-create-session-ramp.sh 200  # 200并发标准递增测试(1m爬坡→5m稳定)"
echo "   默认: ./run-guest-create-session-ramp.sh       # 100并发标准递增测试(1m爬坡→5m稳定)" 