# QPS测试运行命令

## 核心功能（P0优先级）

### 访客聊天功能
```bash
# 访客创建会话测试（默认50 QPS）
k6 run guest-create-session-qps-test.js

# 访客创建会话测试（自定义QPS）
k6 run -e TARGET_QPS=60 guest-create-session-qps-test.js

# 访客聊天测试（默认30 QPS）
k6 run guest-chat-qps-test.js

# 访客聊天测试（自定义QPS）
k6 run -e TARGET_QPS=40 guest-chat-qps-test.js
```

### 登录用户聊天功能
```bash
# 用户创建会话测试（默认40 QPS）
k6 run user-create-session-qps-test.js

# 用户创建会话测试（自定义QPS）
k6 run -e TARGET_QPS=50 user-create-session-qps-test.js

# 用户聊天测试（默认20 QPS）
k6 run user-chat-qps-test.js

# 用户聊天测试（自定义QPS）
k6 run -e TARGET_QPS=30 user-chat-qps-test.js

# 语音聊天测试（默认20 QPS）
k6 run godgpt-voice-chat-qps-test.js

# 语音聊天测试（自定义QPS）
k6 run -e TARGET_QPS=30 godgpt-voice-chat-qps-test.js

# 语音聊天测试（启用性能阈值验证）
k6 run -e TARGET_QPS=25 -e ENABLE_THRESHOLDS=true godgpt-voice-chat-qps-test.js
```

## 重要功能（P1优先级）

### 会话管理功能
```bash
# 获取会话信息测试（默认30 QPS）
k6 run user-session-info-qps-test.js

# 获取会话信息测试（自定义QPS）
k6 run -e TARGET_QPS=40 user-session-info-qps-test.js

# 会话列表测试（默认35 QPS）
k6 run user-session-list-qps-test.js

# 会话列表测试（自定义QPS）
k6 run -e TARGET_QPS=45 user-session-list-qps-test.js
```

### 用户信息管理功能
```bash
# 获取用户账户信息测试（默认30 QPS）
k6 run user-account-qps-test.js

# 获取用户账户信息测试（自定义QPS）
k6 run -e TARGET_QPS=40 user-account-qps-test.js

# 获取GodGPT账户信息测试（默认30 QPS）
k6 run godgpt-account-qps-test.js

# 获取GodGPT账户信息测试（自定义QPS）
k6 run -e TARGET_QPS=40 godgpt-account-qps-test.js

# 更新GodGPT账户信息测试（默认50 QPS）
k6 run godgpt-account-put-qps-test.js

# 更新GodGPT账户信息测试（自定义QPS）
k6 run -e TARGET_QPS=60 godgpt-account-put-qps-test.js

# 获取用户档案信息测试（默认25 QPS）
k6 run user-profile-qps-test.js

# 获取用户档案信息测试（自定义QPS）
k6 run -e TARGET_QPS=35 user-profile-qps-test.js

# 获取Profile用户信息测试（默认35 QPS）
k6 run profile-user-info-qps-test.js

# 获取Profile用户信息测试（自定义QPS）
k6 run -e TARGET_QPS=45 profile-user-info-qps-test.js

# 获取用户ID测试（默认40 QPS）
k6 run user-id-qps-test.js

# 获取用户ID测试（自定义QPS）
k6 run -e TARGET_QPS=50 user-id-qps-test.js

# 查询用户ID测试（默认40 QPS）
k6 run query-user-id-qps-test.js

# 查询用户ID测试（自定义QPS）
k6 run -e TARGET_QPS=50 query-user-id-qps-test.js
```

### 支付系统功能
```bash
# 获取支付记录测试（默认25 QPS）
k6 run payment-list-qps-test.js

# 获取支付记录测试（自定义QPS）
k6 run -e TARGET_QPS=35 payment-list-qps-test.js

# 检查Apple订阅测试（默认30 QPS）
k6 run payment-apple-subscription-qps-test.js

# 检查Apple订阅测试（自定义QPS）
k6 run -e TARGET_QPS=40 payment-apple-subscription-qps-test.js

# 获取产品列表测试（默认35 QPS）
k6 run payment-products-qps-test.js

# 获取产品列表测试（自定义QPS）
k6 run -e TARGET_QPS=45 payment-products-qps-test.js
```

### 认证系统功能
```bash
# GodGPT用户注册测试（默认5 QPS）
k6 run godgpt-register-qps-test.js

# GodGPT用户注册测试（自定义QPS）
k6 run -e TARGET_QPS=10 godgpt-register-qps-test.js

# GodGPT用户注册测试（启用DEBUG模式，查看详细请求响应）
k6 run -e TARGET_QPS=3 -e DEBUG=true godgpt-register-qps-test.js

# Token获取测试（默认40 QPS）
k6 run connect-token-qps-test.js

# Token获取测试（自定义QPS）
k6 run -e TARGET_QPS=60 connect-token-qps-test.js
```

### 邀请系统功能
```bash
# 兑换邀请码测试（默认20 QPS）
k6 run invitation-redeem-qps-test.js

# 兑换邀请码测试（自定义QPS）
k6 run -e TARGET_QPS=30 invitation-redeem-qps-test.js
```

## 辅助功能（P2优先级）

### 会话管理功能
```bash
# 删除会话测试（默认15 QPS）
k6 run session-delete-qps-test.js

# 删除会话测试（自定义QPS）
k6 run -e TARGET_QPS=25 session-delete-qps-test.js

# 会话重命名测试（默认15 QPS）
k6 run session-rename-qps-test.js

# 会话重命名测试（自定义QPS）
k6 run -e TARGET_QPS=25 session-rename-qps-test.js
```

## 批量运行命令

### 运行所有P0核心功能测试
```bash
# 依次运行所有P0优先级测试
k6 run guest-create-session-qps-test.js && \
k6 run guest-chat-qps-test.js && \
k6 run user-create-session-qps-test.js && \
k6 run user-chat-qps-test.js && \
k6 run godgpt-voice-chat-qps-test.js
```

### 运行所有P1重要功能测试
```bash
# 依次运行所有P1优先级测试
k6 run user-session-info-qps-test.js && \
k6 run user-session-list-qps-test.js && \
k6 run user-account-qps-test.js && \
k6 run godgpt-account-qps-test.js && \
k6 run godgpt-account-put-qps-test.js && \
k6 run user-profile-qps-test.js && \
k6 run profile-user-info-qps-test.js && \
k6 run user-id-qps-test.js && \
k6 run query-user-id-qps-test.js && \
k6 run connect-token-qps-test.js && \
k6 run payment-list-qps-test.js && \
k6 run payment-apple-subscription-qps-test.js && \
k6 run payment-products-qps-test.js && \
k6 run invitation-redeem-qps-test.js
```

### 运行所有P2辅助功能测试
```bash
# 依次运行所有P2优先级测试
k6 run session-delete-qps-test.js && \
k6 run session-rename-qps-test.js
```

## 注意事项

1. **QPS设置**：根据服务器性能调整TARGET_QPS参数
2. **测试时长**：所有测试默认运行5分钟
3. **认证配置**：确保tokens.json文件配置正确
4. **环境切换**：通过修改config/env.dev.json切换测试环境
5. **并发控制**：避免同时运行过多高QPS测试导致服务器过载

## 推荐测试顺序

1. 先运行P0核心功能测试，验证基础功能性能
2. 再运行P1重要功能测试，评估业务功能性能
3. 最后运行P2辅助功能测试，完善性能画像
4. 根据结果调整QPS参数，找到性能瓶颈点 


P0:
k6 run -e TARGET_QPS=1 scripts/stress/qps/guest-create-session-qps-test.js
k6 run -e TARGET_QPS=1 scripts/stress/qps/guest-chat-qps-test.js
k6 run -e TARGET_QPS=1 scripts/stress/qps/guest-chat-qps-test-2s.js


k6 run -e TARGET_QPS=10 scripts/stress/qps/user-create-session-qps-test.js
k6 run -e TARGET_QPS=1 scripts/stress/qps/user-chat-qps-test.js
k6 run -e TARGET_QPS=1 scripts/stress/qps/user-chat-qps-test-2s.js


k6 run --duration 10m -e TARGET_QPS=60 guest-create-session-qps-test.js



P1:
k6 run -e TARGET_QPS=1 scripts/stress/qps/user-session-list-qps-test.js
k6 run -e TARGET_QPS=1 scripts/stress/qps/godgpt-account-qps-test.js
k6 run -e TARGET_QPS=1 scripts/stress/qps/profile-user-info-qps-test.js
k6 run -e TARGET_QPS=1 scripts/stress/qps/query-user-id-qps-test.js
k6 run -e TARGET_QPS=1 scripts/stress/qps/payment-products-qps-test.js
k6 run -e TARGET_QPS=1 scripts/stress/qps/godgpt-account-show-toast-qps-test.js


k6 run -e TARGET_QPS=1 scripts/stress/qps/user-session-info-qps-test.js
k6 run -e TARGET_QPS=1 scripts/stress/qps/payment-list-qps-test.js
k6 run -e TARGET_QPS=1 scripts/stress/qps/payment-apple-subscription-qps-test.js
k6 run -e TARGET_QPS=10 -e EMAIL_PREFIX=loadtestc scripts/stress/qps/connect-token-qps-test.js

k6 run -e TARGET_QPS=1 scripts/stress/qps/godgpt-account-put-qps-test.js
k6 run -e TARGET_QPS=1 scripts/stress/qps/godgpt-voice-chat-qps-test.js
k6 run -e TARGET_QPS=1 scripts/stress/qps/invitation-redeem-qps-test.js








