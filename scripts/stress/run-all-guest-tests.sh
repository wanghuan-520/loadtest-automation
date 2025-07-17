#!/bin/bash

# HyperEcho 负载测试快捷脚本
# 包含四个核心测试命令

# 聊天基准测试
./run-complete-test.sh guest-create-session-baseline-test.js stress

# 瞬时压测测试
TIMESTAMP=$(date +%Y%m%d-%H%M%S) && k6 run -e VUS_COUNT=10 --summary-export=../../reports/guest-create-session-spike-10users-summary-${TIMESTAMP}.json guest-create-session-spike-test.js && node generate-core-report.js ../../reports/guest-create-session-spike-10users-summary-${TIMESTAMP}.json
TIMESTAMP=$(date +%Y%m%d-%H%M%S) && k6 run -e VUS_COUNT=50 --summary-export=../../reports/guest-create-session-spike-50users-summary-${TIMESTAMP}.json guest-create-session-spike-test.js && node generate-core-report.js ../../reports/guest-create-session-spike-50users-summary-${TIMESTAMP}.json

TIMESTAMP=$(date +%Y%m%d-%H%M%S) && k6 run -e VUS_COUNT=100 --summary-export=../../reports/guest-create-session-spike-100users-summary-${TIMESTAMP}.json guest-create-session-spike-test.js && node generate-core-report.js ../../reports/guest-create-session-spike-100users-summary-${TIMESTAMP}.json
TIMESTAMP=$(date +%Y%m%d-%H%M%S) && k6 run -e VUS_COUNT=200 --summary-export=../../reports/guest-create-session-spike-200users-summary-${TIMESTAMP}.json guest-create-session-spike-test.js && node generate-core-report.js ../../reports/guest-create-session-spike-200users-summary-${TIMESTAMP}.json
TIMESTAMP=$(date +%Y%m%d-%H%M%S) && k6 run -e VUS_COUNT=300 --summary-export=../../reports/guest-create-session-spike-300users-summary-${TIMESTAMP}.json guest-create-session-spike-test.js && node generate-core-report.js ../../reports/guest-create-session-spike-300users-summary-${TIMESTAMP}.json
TIMESTAMP=$(date +%Y%m%d-%H%M%S) && k6 run -e VUS_COUNT=400 --summary-export=../../reports/guest-create-session-spike-400users-summary-${TIMESTAMP}.json guest-create-session-spike-test.js && node generate-core-report.js ../../reports/guest-create-session-spike-400users-summary-${TIMESTAMP}.json
TIMESTAMP=$(date +%Y%m%d-%H%M%S) && k6 run -e VUS_COUNT=500 --summary-export=../../reports/guest-create-session-spike-500users-summary-${TIMESTAMP}.json guest-create-session-spike-test.js && node generate-core-report.js ../../reports/guest-create-session-spike-500users-summary-${TIMESTAMP}.json
TIMESTAMP=$(date +%Y%m%d-%H%M%S) && k6 run -e VUS_COUNT=1000 --summary-export=../../reports/guest-create-session-spike-1000users-summary-${TIMESTAMP}.json guest-create-session-spike-test.js && node generate-core-report.js ../../reports/guest-create-session-spike-1000users-summary-${TIMESTAMP}.json

# 创建会话阶梯式压力测试
./run-complete-test.sh guest-create-session-ramp-test.js ramp-stress





