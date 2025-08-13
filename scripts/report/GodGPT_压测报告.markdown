# GodGPT 压测报告

## 1. 执行摘要
本报告总结了GodGPT项目的压力测试结果，测试覆盖核心功能接口，包括聊天、会话管理、命理、音频、图片、认证、用户信息、支付和邀请系统。测试目标包括识别性能恶化阈值、测量最大每秒查询数（QPS）以及验证真实AI模型下的系统性能。结果显示，关键接口（P0）在约100 QPS下表现稳定，部分P1接口可处理高达700 QPS。通过优化（如调整sleep时间、添加索引、资源扩展），已解决大部分瓶颈问题，包括高CPU/内存使用率、响应时间恶化和超时问题。当前仍需解决的包括内存泄漏和高QPS下的超时问题。

## 2. 测试目标
- **性能恶化阈值**：确定系统在何种负载下性能显著下降。
- **最大QPS**：在1分钟内逐步增加到N个并发请求，持续5分钟；针对新用户重复该过程。
- **真实AI模型验证**：使用真实AI模型（当前chat为mock）进行压测，参考mineai的AI耗时，确认chat请求是否严重恶化。
- **关键指标**：响应时间、错误率、CPU/内存使用率。

## 3. 测试环境
- **环境配置**：测试分支和版本记录于测试结果（代码分支、commit）。
- **发压机**：配置包括12c/16GB、2c/4GB和4c/8GB。
- **测试设置**：部分测试引入sleep（例如1秒、2秒）模拟真实场景延迟。新老用户分阶段测试（老用户使用token或sessionId）。

## 4. 测试范围
测试覆盖接口按优先级分类：P0（4个，已完成一轮压测，待优化）、P1（13个）、P2（19个）、P3（3个，无需压测）。P3接口（如版本检查、提示词管理）因低影响或将废弃未纳入测试。

### 主要测试接口
| **功能模块** | **接口路径** | **HTTP方法** | **优先级** | **进展** | **新老用户分阶段压测** |
|--------------|--------------|--------------|------------|----------|------------------------|
| 聊天功能-未登录 | /api/godgpt/guest/create-session | POST | P0 | 一轮完成，待优化 | 否 |
| 聊天功能-未登录 | /api/godgpt/guest/chat | POST | P0 | 一轮完成，待优化 | 否 |
| 聊天功能-登录 | /api/godgpt/create-session | POST | P0 | 一轮完成，待优化 | 是（老用户token） |
| 聊天功能-登录 | /api/gotgpt/chat | POST | P0 | 一轮完成，待优化 | 是（sessionId） |
| 会话管理 | /api/godgpt/session-list | GET | P1 | 压测脚本准备中 | 否 |
| 命理功能 | /api/godgpt/account (更新) | PUT | P1 | 压测脚本准备中 | 是 |
| 音频功能 | /api/godgpt/voice/chat | POST | P1 | 压测脚本准备中 | 是（sessionId） |
| 图片功能 | /api/godgpt/blob (上传) | POST | P2 | 脚本完成 | 是（sessionId） |
| 认证页面 | /connect/token (谷歌/邮箱登录) | - | P1 | 压测脚本准备中（改邮箱） | 否 |
| 用户信息管理 | /api/godgpt/account (获取) | GET | P1 | 压测脚本准备中 | 否 |
| 支付系统 | /api/godgpt/payment/list | GET | P1 | 压测脚本准备中 | 否 |
| 邀请系统 | /api/godgpt/invitation/redeem | POST | P1 | 压测脚本准备中 | 否 |

## 5. 测试结果
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

## 6. 发现的问题
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

## 7. 结论与建议
GodGPT系统在P0接口上可稳定支持约100 QPS，P1接口更高（150-700 QPS），但语音和登录接口在70-80 QPS出现瓶颈。优化措施（如sleep、索引、资源扩展）显著提升性能，但内存泄漏和超时问题需进一步解决。

**建议**：
1. 使用真实AI模型进行第二轮压测，验证chat性能。
2. 优化高CPU接口的资源分配，增加服务器容量。
3. 在生产环境中监控超时问题，添加重试机制。
4. 完成P1/P2接口脚本，执行全覆盖压测。

## 8. 附录
- **测试数据**：详细测试结果（QPS、响应时间、错误率等）记录于原始文档。
- **环境详情**：分支、commit信息见原始记录。
- **未完成测试**：部分P1/P2接口脚本待完成，需后续补充。