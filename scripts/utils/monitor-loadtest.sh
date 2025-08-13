#!/bin/bash

# loadtest-automation系统监控脚本
# 使用方法: ./monitor-loadtest.sh &

echo "开始监控压测系统性能..."
LOG_FILE="loadtest-monitor-$(date +%Y%m%d_%H%M%S).log"

while true; do
    echo "=== $(date) ===" >> $LOG_FILE
    
    # CPU使用率
    echo "CPU Usage:" >> $LOG_FILE
    top -l 1 | grep "CPU usage" >> $LOG_FILE
    
    # 内存使用
    echo "Memory Usage:" >> $LOG_FILE
    vm_stat | head -8 >> $LOG_FILE
    
    # k6进程状态
    echo "k6 Process:" >> $LOG_FILE
    ps aux | grep -E "(k6|PID)" | head -2 >> $LOG_FILE
    
    # 网络连接数
    echo "Network Connections:" >> $LOG_FILE
    echo "TCP连接总数: $(netstat -an | grep tcp | wc -l)" >> $LOG_FILE
    echo "ESTABLISHED连接: $(netstat -an | grep ESTABLISHED | wc -l)" >> $LOG_FILE
    echo "TIME_WAIT连接: $(netstat -an | grep TIME_WAIT | wc -l)" >> $LOG_FILE
    
    # 文件描述符使用
    if pgrep k6 > /dev/null; then
        K6_PID=$(pgrep k6)
        echo "k6文件描述符: $(lsof -p $K6_PID 2>/dev/null | wc -l)" >> $LOG_FILE
    fi
    
    # 网络流量
    echo "Network I/O:" >> $LOG_FILE
    netstat -i | grep -E "(Name|en0)" >> $LOG_FILE
    
    echo "---" >> $LOG_FILE
    sleep 5
done
