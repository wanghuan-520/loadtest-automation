# QPS 压力测试运行命令指南

## 📋 概述
本文档包含所有QPS（固定每秒请求数）压力测试脚本的运行命令示例。

---

## 🚀 Guest 测试脚本

### 1. Guest 会话创建测试 (guest-create-session-qps-test.js)

#### 基础命令（默认50 QPS，5分钟）
```bash
k6 run scripts/stress/qps/guest-create-session-qps-test.js
```

#### 自定义QPS
```bash
# 低负载测试
k6 run -e TARGET_QPS=1 scripts/stress/qps/guest-create-session-qps-test.js
k6 run -e TARGET_QPS=10 scripts/stress/qps/guest-create-session-qps-test.js

# 中等负载测试
k6 run -e TARGET_QPS=30 scripts/stress/qps/guest-create-session-qps-test.js
k6 run -e TARGET_QPS=50 scripts/stress/qps/guest-create-session-qps-test.js

# 高负载测试
k6 run -e TARGET_QPS=100 scripts/stress/qps/guest-create-session-qps-test.js
k6 run -e TARGET_QPS=200 scripts/stress/qps/guest-create-session-qps-test.js
```

#### 自定义时长
```bash
k6 run -e TARGET_QPS=50 --duration=1m scripts/stress/qps/guest-create-session-qps-test.js
k6 run -e TARGET_QPS=50 --duration=10m scripts/stress/qps/guest-create-session-qps-test.js
```

---

### 2. Guest 聊天测试 (guest-chat-qps-test.js)

#### 基础命令（默认30 QPS，5分钟）
```bash
k6 run scripts/stress/qps/guest-chat-qps-test.js
```

#### 自定义QPS
```bash
# 调试模式
k6 run -e TARGET_QPS=1 --duration=30s scripts/stress/qps/guest-chat-qps-test.js
k6 run -e TARGET_QPS=2 --duration=1m scripts/stress/qps/guest-chat-qps-test.js

# 常规测试
k6 run -e TARGET_QPS=1 scripts/stress/qps/guest-chat-qps-test.js
k6 run -e TARGET_QPS=10 scripts/stress/qps/guest-chat-qps-test.js
k6 run -e TARGET_QPS=20 scripts/stress/qps/guest-chat-qps-test.js
k6 run -e TARGET_QPS=30 scripts/stress/qps/guest-chat-qps-test.js

# 高负载测试
k6 run -e TARGET_QPS=50 scripts/stress/qps/guest-chat-qps-test.js
k6 run -e TARGET_QPS=100 scripts/stress/qps/guest-chat-qps-test.js
```

---

## 👤 User 测试脚本

### 3. User 会话创建测试 (user-create-session-qps-test.js)

#### 基础命令（默认40 QPS，5分钟）
```bash
k6 run scripts/stress/qps/user-create-session-qps-test.js
```

#### 自定义QPS
```bash
# 低负载测试
k6 run -e TARGET_QPS=1 scripts/stress/qps/user-create-session-qps-test.js
k6 run -e TARGET_QPS=5 scripts/stress/qps/user-create-session-qps-test.js
k6 run -e TARGET_QPS=10 scripts/stress/qps/user-create-session-qps-test.js
k6 run -e TARGET_QPS=20 scripts/stress/qps/user-create-session-qps-test.js

# 中等负载测试
k6 run -e TARGET_QPS=40 scripts/stress/qps/user-create-session-qps-test.js
k6 run -e TARGET_QPS=60 scripts/stress/qps/user-create-session-qps-test.js

# 高负载测试
k6 run -e TARGET_QPS=100 scripts/stress/qps/user-create-session-qps-test.js
k6 run -e TARGET_QPS=150 scripts/stress/qps/user-create-session-qps-test.js
```

---

### 4. User 聊天测试 (user-chat-qps-test.js)

#### 基础命令（默认20 QPS，5分钟）
```bash
k6 run scripts/stress/qps/user-chat-qps-test.js
```

#### 自定义QPS
```bash
# 低负载测试
k6 run -e TARGET_QPS=1 scripts/stress/qps/user-chat-qps-test.js
k6 run -e TARGET_QPS=10 scripts/stress/qps/user-chat-qps-test.js

# 中等负载测试
k6 run -e TARGET_QPS=20 scripts/stress/qps/user-chat-qps-test.js
k6 run -e TARGET_QPS=30 scripts/stress/qps/user-chat-qps-test.js

# 高负载测试
k6 run -e TARGET_QPS=50 scripts/stress/qps/user-chat-qps-test.js
k6 run -e TARGET_QPS=80 scripts/stress/qps/user-chat-qps-test.js
```

---

## 📊 结果输出和日志

### 保存结果到文件
```bash
# 保存完整输出
k6 run -e TARGET_QPS=30 scripts/stress/qps/guest-chat-qps-test.js > guest-chat-30qps-results.txt

# 实时查看并保存
k6 run -e TARGET_QPS=50 scripts/stress/qps/guest-create-session-qps-test.js | tee guest-session-50qps.log

# 只保存错误信息
k6 run -e TARGET_QPS=100 scripts/stress/qps/user-chat-qps-test.js 2> user-chat-errors.log
```

### JSON格式输出
```bash
k6 run -e TARGET_QPS=30 --out json=results.json scripts/stress/qps/guest-chat-qps-test.js
```

---

## 🛠️ 常用组合命令

### 快速验证测试
```bash
# 1QPS低负载验证所有脚本
k6 run -e TARGET_QPS=1 --duration=30s scripts/stress/qps/guest-create-session-qps-test.js
k6 run -e TARGET_QPS=1 --duration=30s scripts/stress/qps/guest-chat-qps-test.js  
k6 run -e TARGET_QPS=1 --duration=30s scripts/stress/qps/user-create-session-qps-test.js
k6 run -e TARGET_QPS=1 --duration=30s scripts/stress/qps/user-chat-qps-test.js
```

### 性能基准测试
```bash
# 建议的基准测试QPS
k6 run -e TARGET_QPS=50 scripts/stress/qps/guest-create-session-qps-test.js  # 会话创建
k6 run -e TARGET_QPS=30 scripts/stress/qps/guest-chat-qps-test.js           # Guest聊天
k6 run -e TARGET_QPS=40 scripts/stress/qps/user-create-session-qps-test.js  # 用户会话
k6 run -e TARGET_QPS=20 scripts/stress/qps/user-chat-qps-test.js           # 用户聊天
```

### 压力极限测试
```bash
# 高负载压力测试
k6 run -e TARGET_QPS=200 scripts/stress/qps/guest-create-session-qps-test.js
k6 run -e TARGET_QPS=100 scripts/stress/qps/guest-chat-qps-test.js
k6 run -e TARGET_QPS=150 scripts/stress/qps/user-create-session-qps-test.js
k6 run -e TARGET_QPS=80 scripts/stress/qps/user-chat-qps-test.js
```

---

## ⚙️ 参数说明

| 参数 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `TARGET_QPS` | 每秒请求数 | 各脚本不同 | `-e TARGET_QPS=50` |
| `--duration` | 测试持续时间 | 5分钟 | `--duration=10m` |
| `--out` | 输出格式 | 控制台 | `--out json=result.json` |

---

## 🚨 注意事项

1. **Guest聊天测试**：已集成随机IP功能，自动避免每日聊天限制
2. **VU数量**：系统自动调整，无需手动设置
3. **超时设置**：所有请求都有30秒超时保护
4. **SSE支持**：聊天测试支持Server-Sent Events流式响应
5. **认证令牌**：User测试使用Bearer Token认证

---

## 📈 监控指标

重点关注以下指标：
- `http_req_failed`: HTTP请求失败率
- `session_creation_success_rate`: 会话创建成功率  
- `chat_response_success_rate`: 聊天响应成功率
- `http_req_duration`: 请求响应时间
- `iterations`: 实际QPS (iters/s)

---

*更新时间: 2024年7月28日*
*版本: v1.0* 