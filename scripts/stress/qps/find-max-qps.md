# 🎯 找到服务器最大QPS承载能力

## 问题分析

基于70QPS测试结果：
- ❌ 成功率: 96.72% (大量timeout)
- ❌ 服务器过载: 连续request timeout
- ✅ VU配置: 已优化，不是瓶颈
- 🔍 **结论**: 目标服务器性能瓶颈，需要找到最大承载QPS

## 🔍 逐步降压测试策略

### 步骤1: 大幅降压测试
从70QPS逐步降低，找到稳定点：

```bash
# 测试50QPS
k6 run --quiet -e TARGET_QPS=50 scripts/stress/qps/guest-create-session-qps-test.js

# 测试40QPS  
k6 run --quiet -e TARGET_QPS=40 scripts/stress/qps/guest-create-session-qps-test.js

# 测试30QPS
k6 run --quiet -e TARGET_QPS=30 scripts/stress/qps/guest-create-session-qps-test.js

# 测试20QPS
k6 run --quiet -e TARGET_QPS=20 scripts/stress/qps/guest-create-session-qps-test.js

# 测试10QPS
k6 run --quiet -e TARGET_QPS=10 scripts/stress/qps/guest-create-session-qps-test.js
```

### 步骤2: 确定稳定QPS区间
观察哪个QPS值能达到：
- ✅ 成功率 > 99%
- ✅ 无request timeout
- ✅ 平均响应时间稳定
- ✅ dropped_iterations < 100

### 步骤3: 精确定位最大QPS
假设30QPS稳定，40QPS不稳定，则在30-40之间精确测试：

```bash
k6 run --quiet -e TARGET_QPS=32 scripts/stress/qps/guest-create-session-qps-test.js
k6 run --quiet -e TARGET_QPS=35 scripts/stress/qps/guest-create-session-qps-test.js
k6 run --quiet -e TARGET_QPS=37 scripts/stress/qps/guest-create-session-qps-test.js
```

## 📊 判断标准

### 🟢 稳定QPS标准
- api_call_success_rate > 99%
- http_req_failed < 1%
- 无连续timeout警告
- dropped_iterations < 5%目标值
- 平均响应时间 < 2秒

### 🟡 边界QPS标准
- api_call_success_rate 95-99%
- 偶发timeout但不连续
- dropped_iterations < 10%目标值

### 🔴 过载QPS标准
- api_call_success_rate < 95%
- 连续timeout警告
- dropped_iterations > 10%目标值

## 🎯 推荐测试顺序

基于70QPS已过载的情况，建议：

1. **先测试20QPS**: 大概率稳定，建立基线
2. **再测试40QPS**: 检查是否在承载范围内
3. **根据结果调整**: 
   - 40QPS稳定 → 测试50, 55, 60QPS
   - 40QPS不稳定 → 测试30, 35QPS

## 💡 优化建议

找到最大QPS后：
1. **设置安全QPS**: 最大QPS的80-90%
2. **持续监控**: 长时间测试确保稳定性
3. **服务器优化**: 基于瓶颈点优化服务器性能
4. **分布式测试**: 考虑多实例分担压力

## ⚠️ 注意事项

- 测试时间至少5分钟，确保稳定性
- 观察服务器资源使用情况
- 避免在生产高峰期进行高压测试
- 记录每次测试的关键指标用于对比
