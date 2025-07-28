# QPS 固定测试套件

这个文件夹包含了所有固定QPS（每秒查询数）的压力测试脚本，使用`constant-arrival-rate`执行器确保恒定的请求速率。

## 📁 文件结构

```
qps/
├── README.md                                      # 本说明文档
├── run-all-qps-tests.sh                          # 运行所有QPS测试的主脚本
├── run-guest-create-session-qps-test.sh          # Guest创建会话单独运行脚本
├── guest-create-session-fixed-qps-test.js        # Guest创建会话QPS测试
├── guest-chat-fixed-qps-test.js                  # Guest聊天QPS测试
├── user-create-session-fixed-qps-test.js         # User创建会话QPS测试
└── user-chat-fixed-qps-test.js                   # User聊天QPS测试
```

## 🎯 测试脚本概览

| 脚本名称 | 默认QPS | 测试对象 | 描述 |
|---------|---------|----------|------|
| `guest-create-session-fixed-qps-test.js` | 50 | 访客创建会话 | 测试访客用户会话创建性能 |
| `guest-chat-fixed-qps-test.js` | 30 | 访客聊天 | 测试访客用户聊天响应性能 |
| `user-create-session-fixed-qps-test.js` | 40 | 已登录用户创建会话 | 测试已登录用户会话创建性能 |
| `user-chat-fixed-qps-test.js` | 20 | 已登录用户聊天 | 测试已登录用户聊天响应性能 |

## 🚀 快速开始

### 运行所有QPS测试

```bash
# 使用默认QPS运行所有测试
./run-all-qps-tests.sh

# 使用自定义QPS运行所有测试
./run-all-qps-tests.sh 25

# 查看帮助信息
./run-all-qps-tests.sh -h
```

### 运行单个QPS测试

```bash
# Guest创建会话测试（推荐使用便捷脚本）
./run-guest-create-session-qps-test.sh 50

# 直接运行其他测试
k6 run -e TARGET_QPS=30 guest-chat-fixed-qps-test.js
k6 run -e TARGET_QPS=40 user-create-session-fixed-qps-test.js
k6 run -e TARGET_QPS=20 user-chat-fixed-qps-test.js
```

## ⚙️ QPS测试特性

### 核心优势
- **精确QPS控制**: 使用`constant-arrival-rate`确保恒定请求速率
- **智能VU管理**: 根据响应时间自动调整虚拟用户数量
- **资源保护**: maxVUs限制防止资源过度消耗
- **即时清理**: 测试结束后VU自动归零

### 配置参数
- **executor**: `constant-arrival-rate`
- **duration**: 5分钟
- **rate**: 可通过`TARGET_QPS`环境变量自定义
- **preAllocatedVUs**: `Math.max(TARGET_QPS, 1)`
- **maxVUs**: `TARGET_QPS * 2` 或 `TARGET_QPS * 3`（聊天测试）

## 📊 性能阈值

### 通用阈值
- HTTP请求失败率 < 1%
- API调用成功率 > 99%

### 具体阈值
- **创建会话**: P95响应时间 < 2000ms
- **聊天响应**: P95响应时间 < 3000-5000ms

## 🔍 关键指标

运行测试后，重点关注以下指标：

1. **QPS稳定性**: 实际QPS应接近目标QPS
2. **API调用成功率**: 应保持在99%以上
3. **响应时间分布**: 重点关注P95和P99
4. **VU使用情况**: 观察VU数量的动态调整
5. **系统资源**: CPU、内存、网络IO使用情况

## 💡 使用建议

### QPS选择建议
- **低负载测试**: 5-20 QPS
- **中等负载测试**: 20-50 QPS  
- **高负载测试**: 50-100 QPS
- **极限测试**: 100+ QPS

### 测试顺序建议
1. 先运行单个接口测试确认基本功能
2. 逐步增加QPS找到性能拐点
3. 运行完整测试套件进行综合评估

### 故障排查
- 如果QPS无法达到目标，检查maxVUs设置
- 如果响应时间过长，考虑降低目标QPS
- 如果成功率低于阈值，检查服务端性能

## 🔗 相关文档

- [k6 constant-arrival-rate 文档](https://k6.io/docs/using-k6/scenarios/executors/constant-arrival-rate/)
- [../README.md](../README.md) - 压力测试主文档
- [../../config/](../../config/) - 配置文件说明 