# 邀请码压测设置指南

## 概述

此指南介绍如何获取loadtest账户的邀请码，并用于invitation-redeem-qps-test.js压力测试。

## 步骤1: 获取邀请码

### 使用get_invitation_codes.py脚本

```bash
# 基本用法 - 获取前100个账户的邀请码
python3 get_invitation_codes.py --start 1 --count 100

# 获取指定范围的账户邀请码
python3 get_invitation_codes.py --start 1 --count 1000 --workers 20

# 获取loadtestc1到loadtestc30000的邀请码（分批处理，避免超时）
python3 get_invitation_codes.py --start 1 --count 5000 --workers 15
python3 get_invitation_codes.py --start 5001 --count 5000 --workers 15
python3 get_invitation_codes.py --start 10001 --count 5000 --workers 15
# ... 继续分批处理

# 自定义密码（如果loadtest账户使用不同密码）
python3 get_invitation_codes.py --start 1 --count 100 --password "YourPassword"
```

### 输出文件

脚本会在`results/`目录下生成以下文件：

1. **邀请码映射文件**: `loadtestc_invitation_codes_TIMESTAMP.json`
   - 格式：`{"email": "invite_code"}`
   - 包含完整的邮箱到邀请码映射

2. **K6测试数据文件**: `loadtestc_invite_codes_for_k6_TIMESTAMP.json`
   - 格式：`["invite_code1", "invite_code2", ...]`
   - 专为k6测试优化的邀请码数组

3. **失败账户列表**: `loadtestc_invitation_failed_TIMESTAMP.txt`
   - 获取邀请码失败的账户列表

## 步骤2: 准备邀请码数据

### 方式1: 使用软链接（推荐）

```bash
cd results/
# 创建软链接指向最新的邀请码文件
ln -sf loadtestc_invite_codes_for_k6_20250808_123456.json loadtestc_invite_codes_for_k6_latest.json
```

### 方式2: 直接指定文件

在运行k6测试时指定具体的文件路径。

## 步骤3: 运行压力测试

### 使用默认邀请码文件

```bash
cd scripts/stress/qps/
# 脚本会自动加载 results/loadtestc_invite_codes_for_k6_latest.json
k6 run invitation-redeem-qps-test.js
```

### 指定特定的邀请码文件

```bash
cd scripts/stress/qps/
# 指定具体的邀请码文件
k6 run -e INVITE_CODES_FILE=../../../results/loadtestc_invite_codes_for_k6_20250808_123456.json invitation-redeem-qps-test.js
```

### 自定义QPS和邀请码文件

```bash
cd scripts/stress/qps/
# 同时指定QPS和邀请码文件
k6 run -e TARGET_QPS=10 -e INVITE_CODES_FILE=../../../results/loadtestc_invite_codes_for_k6_20250808_123456.json invitation-redeem-qps-test.js
```

## 验证设置

### 检查邀请码加载状态

运行测试时，查看控制台输出：

```
✅ 成功加载 1000 个邀请码
```

或者：

```
⚠️  未找到邀请码数据文件，将使用默认邀请码
```

### 检查测试行为

- 每次请求都会使用不同的随机邀请码
- 失败的请求会记录使用的邀请码便于调试
- 可以看到类似输出：`❌ 邀请码兑换失败 - 使用邀请码: ABC123, HTTP状态码: 400`

## 故障排除

### 1. 获取邀请码失败

**可能原因:**
- 账户密码不正确
- 账户未注册或被禁用
- 网络连接问题
- API端点变更

**解决方案:**
- 检查密码是否正确
- 使用check_account_status.py验证账户状态
- 检查网络连接
- 更新API端点URL

### 2. K6测试中邀请码加载失败

**可能原因:**
- 文件路径不正确
- 文件格式错误
- 权限问题

**解决方案:**
- 检查文件路径是否正确
- 验证JSON格式是否有效
- 检查文件读取权限

### 3. 邀请码兑换失败率高

**可能原因:**
- 邀请码已被使用
- 邀请码已过期
- 用户已达到兑换限制

**解决方案:**
- 获取更多新的邀请码
- 检查邀请码有效性
- 调整测试策略

## 注意事项

1. **邀请码唯一性**: 每个邀请码通常只能使用一次，确保有足够的邀请码用于测试
2. **并发控制**: 获取邀请码时注意并发数，避免对服务器造成过大压力
3. **数据安全**: 邀请码属于敏感数据，注意保护和管理
4. **定期更新**: 邀请码可能有时效性，建议定期重新获取

## 示例工作流

```bash
# 1. 获取邀请码
python3 get_invitation_codes.py --start 1 --count 1000 --workers 20

# 2. 创建软链接
cd results/
ln -sf loadtestc_invite_codes_for_k6_20250808_143022.json loadtestc_invite_codes_for_k6_latest.json

# 3. 运行压力测试
cd ../scripts/stress/qps/
k6 run -e TARGET_QPS=5 invitation-redeem-qps-test.js

# 4. 分析结果
# 查看k6输出的统计数据和日志
```
