#!/bin/bash

# 压测监控实时看板
# 使用方法: ./monitor-dashboard.sh

LOG_FILE=$(ls -t loadtest-monitor-*.log 2>/dev/null | head -1)

if [ -z "$LOG_FILE" ]; then
    echo "❌ 没有找到监控日志文件"
    echo "请先运行: ./scripts/utils/monitor-loadtest.sh &"
    exit 1
fi

echo "🎯 压测系统实时监控看板"
echo "📊 日志文件: $LOG_FILE"
echo "🔄 每5秒自动刷新 (Ctrl+C退出)"
echo "================================"

while true; do
    clear
    echo "🎯 压测系统实时监控看板 - $(date)"
    echo "📊 日志文件: $LOG_FILE"
    echo "================================"
    
    # 获取最新的监控数据
    LATEST_DATA=$(tail -50 "$LOG_FILE")
    
    # 解析CPU使用率
    CPU_USAGE=$(echo "$LATEST_DATA" | grep "CPU usage" | tail -1)
    if [ ! -z "$CPU_USAGE" ]; then
        echo "🖥️  CPU状态: $CPU_USAGE"
    fi
    
    # 解析内存使用
    echo ""
    echo "💾 内存状态:"
    echo "$LATEST_DATA" | grep -A 5 "Memory Usage:" | tail -4 | head -3
    
    # 解析网络连接
    echo ""
    echo "🌐 网络连接:"
    TCP_TOTAL=$(echo "$LATEST_DATA" | grep "TCP连接总数" | tail -1)
    ESTABLISHED=$(echo "$LATEST_DATA" | grep "ESTABLISHED连接" | tail -1)
    TIME_WAIT=$(echo "$LATEST_DATA" | grep "TIME_WAIT连接" | tail -1)
    
    echo "  $TCP_TOTAL"
    echo "  $ESTABLISHED"  
    echo "  $TIME_WAIT"
    
    # k6进程状态
    echo ""
    echo "🚀 k6进程状态:"
    if pgrep k6 > /dev/null; then
        K6_PID=$(pgrep k6)
        K6_CPU=$(ps -p $K6_PID -o %cpu | tail -1)
        K6_MEM=$(ps -p $K6_PID -o %mem | tail -1)
        K6_RSS=$(ps -p $K6_PID -o rss | tail -1)
        echo "  ✅ k6正在运行 (PID: $K6_PID)"
        echo "  📊 CPU: ${K6_CPU}% | 内存: ${K6_MEM}% | RSS: ${K6_RSS}KB"
        
        # 文件描述符
        FD_COUNT=$(lsof -p $K6_PID 2>/dev/null | wc -l)
        echo "  📁 文件描述符: $FD_COUNT"
    else
        echo "  ❌ k6未运行"
    fi
    
    # 监控脚本状态
    echo ""
    echo "📊 监控状态:"
    if pgrep -f monitor-loadtest > /dev/null; then
        echo "  ✅ 监控脚本正在运行"
        echo "  📝 日志大小: $(ls -lh $LOG_FILE | awk '{print $5}')"
        echo "  ⏰ 最后更新: $(tail -1 $LOG_FILE | grep "===" | sed 's/=== //g' | sed 's/ ===//g')"
    else
        echo "  ❌ 监控脚本未运行"
    fi
    
    echo ""
    echo "🔄 5秒后自动刷新... (Ctrl+C退出)"
    sleep 5
done
