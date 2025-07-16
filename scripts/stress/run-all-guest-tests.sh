#!/bin/bash

# HyperEcho 负载测试快捷脚本
# 包含四个核心测试命令


./run-complete-test.sh guest-create-session-baseline-test.js stress

# 瞬时压测测试
TIMESTAMP=$(date +%Y%m%d-%H%M%S) && k6 run --summary-export=../../reports/guest-create-session-spike-100users-summary-${TIMESTAMP}.json guest-create-session-spike-test.js && node generate-core-report.js ../../reports/guest-create-session-spike-100users-summary-${TIMESTAMP}.json




# 创建会话阶梯式压力测试
./run-complete-test.sh guest-create-session-ramp-test.js ramp-stress

# 创建会话参数化瞬时压力测试序列 (100→200→300用户)
./run-spike-sequence.sh

# 聊天基准测试
./run-complete-test.sh guest-chat-baseline-test.js chat

# 聊天压力测试
./run-complete-test.sh guest-chat-test.js chat-stress 



