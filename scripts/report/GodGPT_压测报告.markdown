# GodGPT 压测报告

## 1. 测试目标
- **性能恶化阈值**：确定系统在何种负载下性能显著下降。
- **最大QPS**：找到系统最大稳定QPS，保持该QPS持续5-10分钟验证稳定性。
- **关键指标**：响应时间、错误率、CPU/内存使用率。

## 2. 测试环境
- **silo-1**：12c/16GB - 核心业务服务
- **silo**：12c/16GB - 核心业务服务  
- **client**：3c/6GB - 客户端服务
- **authserver**：待补充配置 - 认证服务

## 3. 测试范围
本次压测重点覆盖核心业务接口：P0（4个核心聊天接口）和P1（13个扩展功能接口），共计17个关键接口。

### 主要测试接口
| **功能模块** | **接口路径** | **HTTP方法** | **优先级** |
|--------------|--------------|--------------|------------|
| 聊天功能-未登录 | /godgpt/guest/create-session | POST | P0 |
| 聊天功能-未登录 | /godgpt/guest/chat | POST | P0 |
| 聊天功能-登录 | /godgpt/create-session | POST | P0 |
| 聊天功能-登录 | /gotgpt/chat | POST | P0 |
| 会话管理 | /godgpt/session-list | GET | P1 |
| 命理功能 | /godgpt/account (更新) | PUT | P1 |
| 音频功能 | /godgpt/voice/chat | POST | P1 |
| 认证页面 | /connect/token (谷歌/邮箱登录) | - | P1 |
| 用户信息管理 | /godgpt/account (获取) | GET | P1 |
| 支付系统 | /godgpt/payment/list | GET | P1 |
| 邀请系统 | /godgpt/invitation/redeem | POST | P1 |
| 会话信息 | /godgpt/session-info/{sessionId} | GET | P1 |
| 积分提示 | /godgpt/account/show-toast | GET | P1 |
| 用户档案 | /profile/user-info | GET | P1 |
| 用户ID查询 | /query/user-id | GET | P1 |
| Apple订阅检查 | /godgpt/payment/has-apple-subscription | GET | P1 |
| 会话删除 | /godgpt/session/{sessionId} | DELETE | P1 |
| 会话重命名 | /godgpt/session/{sessionId}/rename | POST | P1 |
| 用户ID检索 | /user-id | GET | P1 |

## 4. 测试结果
测试通过逐步增加QPS观察性能，核心接口性能如下（基于表格数据）：

| **接口路径** | **场景** | **最大稳定QPS** | **关键观察** |
|--------------|----------|-----------------|--------------|
| /godgpt/guest/create-session | 未登录创建会话 | 100 | 100 QPS稳定；高QPS下silo-user CPU>80%，优化后正常。 |
| /godgpt/guest/chat | 未登录聊天 | 100 | 1 QPS错误率高（HTTP 500），sleep 2s后正确率>99%；100 QPS响应时间恶化。 |
| /godgpt/create-session | 登录创建会话 | 100 | 100 QPS稳定；高QPS下CPU>80%，内存1h+未释放。 |
| /gotgpt/chat | 登录聊天 | 100 | 响应时间长（待解决）；100 QPS正常，70 QPS出现524超时。 |
| /godgpt/voice/chat | 语音聊天 | 70 | 1 QPS下CPU>60%；70 QPS出现524超时（CloudFlare）。 |
| /connect/token | 谷歌/邮箱登录 | 80 | 20 QPS下authserver CPU>80%；邮箱压测10 QPS CPU>200%，加索引后正常；80 QPS出现524错误。 |
| /godgpt/session-info/{sessionId} | 获取会话信息 | 150 | 150 QPS稳定，负载3943正常。 |
| /godgpt/session-list | 会话列表 | 250 | 高QPS稳定，无明显瓶颈。 |
| /godgpt/account (PUT) | 更新用户信息 | 10 | 10 QPS下CPU/内存>80%，优化后正常。 |
| /godgpt/account/show-toast | 积分提示 | 70 | QPS增加时响应恶化，优化后正常。 |
| /godgpt/invitation/redeem | 兑换邀请码 | 70 | 5 QPS下CPU>100%，优化后正常。 |
| /godgpt/account (GET) | 获取用户信息 | 200 | 2c/4GB下CPU>200%，整体稳定。 |
| /profile/user-info | 用户档案 | 250 | 稳定，无瓶颈。 |
| /query/user-id | 用户ID | 700 | 高负载稳定。 |
| /godgpt/payment/list | 支付记录 | 450 | 稳定。 |
| /godgpt/payment/has-apple-subscription | Apple订阅检查 | 300 | 稳定。 |

**总结**：P0接口最大QPS约100，受CPU/内存限制；P1接口可达150-700 QPS，语音/登录接口在70-80 QPS出现瓶颈。Sleep优化显著降低错误率，但暴露响应时间问题。内存泄漏和高QPS超时需关注。

## 5. 发现的问题
共识别11个问题，多数已解决，少数待处理：

| **编号** | **问题描述** | **原因** | **状态** |
|----------|--------------|----------|----------|
| 1 | /api/godgpt/account (PUT) 10 QPS下silo-user CPU/内存>80% | 压测数据问题 | 已解决 |
| 2 | /api/godgpt/account/show-toast QPS增加响应时间恶化 | 压测数据问题 | 已解决 |
| 3 | /godgpt/guest/chat 1 QPS错误率高（HTTP 500） | 代码响应失败 | 已解决（sleep 2s，正确率>99%） |
| 4 | /api/godgpt/voice/chat 1 QPS下CPU>60% | 压测数据问题 | 已解决 |
| 5 | /connect/token 20 QPS下authserver CPU>80% | 压测数据问题 | 已解决（改邮箱压测） |
| 6 | /api/godgpt/invitation/redeem 5 QPS下CPU>100% | 压测数据问题 | 已解决 |
| 7 | Create session/chat 内存1h+未释放 | 未明确 | 未记录状态 |
| 8 | /godgpt/guest/create-session 20 QPS下CPU>80% | 配置不足 | 已解决（升级至12c/16GB） |
| 9 | /connect/token 邮箱压测10 QPS下CPU>200% | 缺少索引 | 已解决（加索引） |
| 10 | 语音聊天70 QPS出现524超时 | 源服务器超时 | 正在解决 |
| 11 | 登录后chat响应时间长 | 未明确 | 正在解决 |

## 6. 压测总结

### 系统承载能力分析

**核心业务接口（P0）- 系统瓶颈：**
- **最大稳定QPS：~100** 
- 核心聊天功能（创建会话、聊天对话）均在100 QPS达到稳定上限
- 受CPU/内存资源限制，是系统的关键瓶颈

**扩展功能接口（P1）- 性能分层：**
- **高性能层：** 450-700 QPS（支付记录、用户ID查询）
- **中等性能层：** 150-300 QPS（会话信息、用户档案、Apple订阅）
- **瓶颈层：** 70-80 QPS（语音聊天、登录认证）



**关键风险点：**
- ⚠️ **内存泄漏** - 会话创建后内存1小时不释放
- ⚠️ **524超时** - CloudFlare层面，70+ QPS出现
- ⚠️ **AI模型耗时** - 当前为mock，真实AI会进一步降低承载

