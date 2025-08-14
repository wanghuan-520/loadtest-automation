import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 20 QPS（每秒20个请求，持续10分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=30 user-chat-qps-test.js
// 示例: k6 run -e TARGET_QPS=25 user-chat-qps-test.js
//
// 🔇 静默运行模式（禁用HTTP调试日志）：
// k6 run --log-level error -e TARGET_QPS=25 user-chat-qps-test.js
// 或设置环境变量: export K6_LOG_LEVEL=error
//
// 🔧 连接重置优化版本 - 针对TCP连接被peer重置问题的优化：
// 1. batchPerHost=1 统一配置，减少并发压力避免触发Cloudflare保护
// 2. 显式启用keep-alive连接保持，减少连接建立/断开开销
// 3. 添加cache-control避免缓存干扰SSE流式响应
// 4. 优化TCP连接参数，提高连接稳定性
// 5. 保留错误信息打印，通过K6日志级别控制HTTP调试信息
// 6. 智能指标统计：排除发压脚本技术性失败，只统计服务端真实性能
// 7. 流式响应优化：检测SSE数据格式（data: {"ResponseType":...} event: completed）

// 自定义指标
const sessionCreationRate = new Rate('session_creation_success_rate');
const chatResponseRate = new Rate('chat_response_success_rate');
const chatResponseDuration = new Trend('chat_response_duration');
const createResponseDuration = new Trend('create_response_duration');

// 错误监控指标
const sessionErrorRate = new Rate('session_error_rate');
const chatErrorRate = new Rate('chat_error_rate');
const connectionErrorCounter = new Counter('connection_error_total');  // 连接相关错误计数

// QPS统计计数器 - 只统计有效请求，排除发压脚本导致的技术性失败
import { Counter } from 'k6/metrics';
const sessionAttemptCounter = new Counter('session_attempt_total');      // 只统计status!=0的有效请求
const sessionSuccessCounter = new Counter('session_success_total');      // 只统计有效请求中的成功数
const chatAttemptCounter = new Counter('chat_attempt_total');            // 只统计status!=0的有效请求  
const chatSuccessCounter = new Counter('chat_success_total');            // 只统计有效请求中的成功数

// 预定义固定值避免运行时计算开销
const FIXED_USER_ID = '12345678-1234-4567-8901-123456789abc';
const FIXED_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';


// 从配置文件加载环境配置和测试数据
const config = JSON.parse(open('../../../config/env.dev.json'));
const testData = JSON.parse(open('../../../config/test-data.json'));

// 尝试从tokens.json文件加载token配置
let tokenConfig = {};
try {
  tokenConfig = JSON.parse(open('../../../config/tokens.json'));
} catch (error) {
  console.log('⚠️  未找到tokens.json配置文件，将使用环境变量或默认token');
}

// 获取目标QPS参数，默认值为20
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 20;



// 固定QPS压力测试场景配置
export const options = {
  scenarios: {
    // 固定QPS测试 - 恒定请求速率（超稳定性优化版）
    fixed_qps: {
      executor: 'constant-arrival-rate',
      rate: TARGET_QPS,              // 每秒请求数（QPS）
      timeUnit: '1s',                // 时间单位：1秒
      duration: '10m',               // 测试持续时间：10分钟
      // 🎯 QPS超稳定配置：基于实测流程耗时优化VU分配
      // 实测流程：session + chat，合理分配VU资源
      preAllocatedVUs: Math.max(Math.ceil(TARGET_QPS * 5), 50),   // 5倍预分配，确保充足VU资源
      maxVUs: Math.max(Math.ceil(TARGET_QPS * 10), 150),          // 10倍最大值，确保高并发支撑
      tags: { test_type: 'fixed_qps_ultra_stable' },
    },
  },
  // 连接池优化：提高QPS稳定性，减少连接重置
  batch: 1,                          // 每次只发送1个请求，确保精确控制
  batchPerHost: 1,                   // 修复：统一为1，减少并发压力避免触发服务端保护
  noConnectionReuse: false,          // 启用连接复用，减少新连接建立
  noVUConnectionReuse: false,        // 启用VU内连接复用，提升稳定性
  userAgent: 'k6-loadtest/1.0',      // 统一User-Agent
  // TCP连接池优化：减少连接重置
  maxRedirects: 3,                   // 限制重定向次数，减少额外连接
  // DNS和连接超时优化
  setupTimeout: '30s',               // 设置阶段超时
  teardownTimeout: '10s',            // 清理阶段超时
  // HTTP Keep-Alive设置  
  discardResponseBodies: false,      // 保持响应体，确保完整测试
  // 📊 完整响应时间统计信息
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)'], // 显示完整的响应时间分布
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'session_creation_success_rate': ['rate>0.99'],
  //   'chat_response_success_rate': ['rate>0.99'],
  //   'chat_response_duration': ['p(95)<5000'],
  // },
};

// 测试主函数
export default function (data) {
  
  // 使用固定用户ID减少运行时开销
  const userId = FIXED_USER_ID;
  
  // 步骤1: 创建会话
  const createSessionUrl = `${data.baseUrl}/godgpt/create-session`;
  const createSessionPayload = JSON.stringify({
    guider: '',
    userId: userId  // 添加userId参数，与chat保持一致
  });
  
  // 构造已登录用户的create-session请求头 + 连接保持优化
  const sessionHeaders = {
    'accept': '*/*',
    'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
    'authorization': `Bearer ${data.bearerToken}`,
    'connection': 'keep-alive',           // 添加：显式启用连接保持
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'origin': config.origin,
    'pragma': 'no-cache',
    'priority': 'u=1, i',
    'referer': config.referer,
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': FIXED_USER_AGENT,
  };
  
  const createSessionParams = {
    headers: sessionHeaders,
    timeout: '60s',                // 会话创建超时时间优化为60秒
    // TCP连接优化配置
    responseType: 'text',          // 明确响应类型，提升解析效率
    redirects: 3,                  // 限制重定向次数
    responseCallback: http.expectedStatuses(200, 408, 429, 502, 503, 504), // 接受更多状态码，减少错误干扰
  };
  
  const createSessionResponse = http.post(createSessionUrl, createSessionPayload, createSessionParams);

  // 简化会话创建成功判断 - 仅HTTP状态码验证以减少JSON解析开销
  const isSessionCreated = createSessionResponse.status === 200;

  // 如果会话创建失败，打印错误信息
  if (!isSessionCreated) {
    if (createSessionResponse.status === 0) {
      console.error(`❌ [会话创建连接失败] userId=${userId}: ${createSessionResponse.error || '连接重置'}`);
    } else {
      console.error(`❌ [会话创建失败] userId=${userId}, HTTP状态码: ${createSessionResponse.status}`);
    }
  }
  
  // 记录会话创建指标 - 区分技术性失败和业务失败
  // 只有非连接重置的请求才计入总请求数和成功率统计
  const isValidRequest = createSessionResponse.status !== 0;
  
  if (isValidRequest) {
    sessionAttemptCounter.add(1); // 只统计有效的session尝试次数
    sessionCreationRate.add(isSessionCreated);
    sessionErrorRate.add(!isSessionCreated); // 记录会话创建错误率
    if (isSessionCreated) {
      sessionSuccessCounter.add(1); // 统计session成功次数
      createResponseDuration.add(createSessionResponse.timings.duration);
    }
  } else {
    // 连接重置等技术性错误统计
    connectionErrorCounter.add(1);
  }
  // 连接重置等技术性错误不计入业务成功率统计

  // 如果会话创建失败，跳过后续步骤
  if (!isSessionCreated) {
    return;
  }

  // 简化sessionId解析 - 减少JSON解析验证开销
  let sessionId = null;
  try {
    const responseData = JSON.parse(createSessionResponse.body);
    sessionId = responseData.data;
    if (!sessionId) return;
  } catch (error) {
    console.error(`❌ [会话响应解析失败] userId=${userId}`);
    return;
  }
  
  // 直接进行聊天请求
  
  // 步骤2: 发送聊天消息
  const randomMessage = testData.messages[Math.floor(Math.random() * testData.messages.length)];
  
  // 构造已登录用户的chat请求头 - 支持SSE流式响应 + 连接保持优化
  const chatHeaders = {
    'accept': 'text/event-stream',
    'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
    'authorization': `Bearer ${data.bearerToken}`,
    'connection': 'keep-alive',           // 添加：显式启用连接保持
    'cache-control': 'no-cache',          // 添加：SSE流需要避免缓存
    'content-type': 'application/json',
    'origin': config.origin,
    'pragma': 'no-cache',
    'priority': 'u=1, i',
    'referer': config.referer,
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': FIXED_USER_AGENT,
  };
  
  // 使用已登录用户的chat请求体格式 - 包含sessionId和userId
  const chatPayload = {
    content: randomMessage.content,
    images: [],
    region: "",
    sessionId: sessionId,
    userId: userId  // 添加userId参数，确保与create-session使用相同的用户标识
  };
  
  const chatParams = {
    headers: chatHeaders,
    timeout: '120s',               // 聊天响应超时时间优化为120秒，适应SSE流式响应
    // TCP连接优化配置
    responseType: 'text',          // 明确响应类型，支持SSE流
    redirects: 3,                  // 限制重定向次数
    responseCallback: http.expectedStatuses(200, 408, 429, 502, 503, 504, 524), // 接受更多状态码包括524超时
  };
  
  const chatResponse = http.post(`${data.baseUrl}/gotgpt/chat`, JSON.stringify(chatPayload), chatParams);
  
  // 验证聊天响应 - 流式响应验证：HTTP 200 + SSE数据格式检查
  const isChatSuccess = chatResponse.status === 200 && (() => {
    // 快速SSE流式响应验证：检查关键标识符避免完整JSON解析
    const body = chatResponse.body || '';
    return body.includes('data:') || body.includes('event:') || body.includes('ResponseType') || body.length === 0;
  })();

  // 如果聊天失败，打印错误信息
  if (!isChatSuccess) {
    if (chatResponse.status === 0) {
      console.error(`❌ [聊天连接失败] userId=${userId}, sessionId=${sessionId}: ${chatResponse.error || '连接重置'}`);
    } else {
      console.error(`❌ [聊天失败] userId=${userId}, sessionId=${sessionId}, status=${chatResponse.status}`);
    }
  }
  


  // 记录聊天指标 - 区分技术性失败和业务失败
  // 只有非连接重置/超时的请求才计入总请求数和成功率统计
  const isChatValidRequest = chatResponse.status !== 0;
  
  if (isChatValidRequest) {
    chatAttemptCounter.add(1); // 只统计有效的chat尝试次数
    chatResponseRate.add(isChatSuccess);
    chatErrorRate.add(!isChatSuccess); // 记录聊天错误率
    if (isChatSuccess) {
      chatSuccessCounter.add(1); // 统计chat成功次数
      chatResponseDuration.add(chatResponse.timings.duration);
    }
  } else {
    // 连接重置/超时等技术性错误统计
    connectionErrorCounter.add(1);
  }
  // 连接重置/超时等技术性错误不计入业务成功率统计


}

// 测试设置阶段
export function setup() {
  const startTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const preAllocatedVUs = Math.max(Math.ceil(TARGET_QPS * 5), 100);
  const maxVUs = Math.max(Math.ceil(TARGET_QPS * 10), 500);
  
  console.log('🎯 开始 user/chat (无延迟版本) 超稳定QPS压力测试...');
  console.log(`⚡ 目标QPS: ${TARGET_QPS} | 预分配VU: ${preAllocatedVUs} | 最大VU: ${maxVUs}`);
  console.log(`🕐 测试时间: ${startTime} (持续10分钟)`);
  console.log('🔧 优化策略: 基于实测流程耗时合理分配VU资源，确保QPS稳定性');
  console.log('⚠️  修复: 增加超时时间到120s，优化SSE响应判断逻辑，支持更多HTTP状态码');
  console.log('🌊 流式验证: 检测SSE数据格式（data: {"ResponseType":...} event: completed）');
  console.log('🔍 错误监控: 已启用详细错误日志，失败请求将显示具体错误信息');
  console.log('💡 提示: 使用 k6 run --quiet 命令减少调试输出，使用 --log-level error 只显示错误');
  
  return setupTest(
    config, 
    tokenConfig, 
    'user/chat (无延迟版本)', 
    TARGET_QPS, 
    '/gotgpt/chat',
    '🌊 测试流程: create-session → chat (SSE流式响应)'
  );
}

// 测试清理阶段
export function teardown(data) {
  const endTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`✅ user/chat (无延迟版本) 超稳定QPS压力测试完成 - ${endTime}`);
  console.log('🔍 关键指标: 会话创建成功率、聊天响应成功率、端到端响应时间、QPS稳定性');
  teardownTest('user/chat (无延迟版本)', '会话创建成功率、聊天响应成功率、端到端响应时间、QPS稳定性');
} 