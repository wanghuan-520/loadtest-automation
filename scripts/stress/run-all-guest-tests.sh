#!/bin/bash

# HyperEcho 负载测试快捷脚本
# 包含四个核心测试命令


./run-complete-test.sh guest-create-session-baseline-test.js stress

# 创建会话压力测试
./run-complete-test.sh guest-create-session-test.js stress

# 聊天基准测试
./run-complete-test.sh guest-chat-baseline-test.js chat

# 聊天压力测试
./run-complete-test.sh guest-chat-test.js chat-stress 