#!/bin/bash

# HyperEcho 参数化瞬时压力测试序列脚本
# 支持自定义用户数量和测试时长的顺序压测

echo "🌌 HyperEcho 瞬时压力测试序列启动..."
echo "================================================="

# 默认测试序列：100, 200, 300用户
DEFAULT_VUS_SEQUENCE="100 200 300"
DEFAULT_DURATION="5m"

# 从参数获取用户序列，如果没有提供则使用默认值
VUS_SEQUENCE=${1:-$DEFAULT_VUS_SEQUENCE}
DURATION=${2:-$DEFAULT_DURATION}

echo "📋 测试序列: $VUS_SEQUENCE"
echo "⏱️  每轮时长: $DURATION"
echo "🎯 目标接口: guest/create-session"
echo "================================================="

# 计数器
TEST_COUNT=1
TOTAL_TESTS=$(echo $VUS_SEQUENCE | wc -w)

# 循环执行不同用户数量的测试
for VUS in $VUS_SEQUENCE; do
    echo ""
    echo "🚀 第 $TEST_COUNT/$TOTAL_TESTS 轮测试开始"
    echo "👥 用户数量: $VUS"
    echo "⏱️  测试时长: $DURATION"
    echo "================================================="
    
    # 执行参数化测试
    ./run-complete-test.sh guest-create-session-spike-test.js "spike-${VUS}users" \
        -e VUS_COUNT=$VUS \
        -e TEST_DURATION=$DURATION
    
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ 第 $TEST_COUNT 轮测试 ($VUS 用户) 完成"
    else
        echo "❌ 第 $TEST_COUNT 轮测试 ($VUS 用户) 失败 (退出码: $EXIT_CODE)"
        echo "🛑 是否继续下一轮测试？[y/N]"
        read -r CONTINUE
        if [[ ! $CONTINUE =~ ^[Yy]$ ]]; then
            echo "🚫 测试序列中断"
            exit 1
        fi
    fi
    
    # 如果不是最后一个测试，等待一段时间让系统恢复
    if [ $TEST_COUNT -lt $TOTAL_TESTS ]; then
        echo "⏳ 等待30秒让系统恢复..."
        sleep 30
    fi
    
    ((TEST_COUNT++))
done

echo ""
echo "🎉 所有瞬时压力测试完成！"
echo "📊 测试结果位于 reports/ 目录"
echo "📈 建议对比分析不同用户数量下的性能表现"
echo "=================================================" 