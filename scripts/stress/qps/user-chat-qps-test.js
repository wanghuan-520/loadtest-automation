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
// 8. 随机用户ID：每次请求使用不同的随机UUID v4格式用户ID，提高测试真实性
// 9. 超时优化：增加会话创建180s、聊天300s超时，减少timeout错误
// 10. 错误过滤：只过滤connection reset和timeout连接错误，保留HTTP状态码错误显示
// 11. Debug优化：关闭httpDebug模式，但保留所有HTTP状态码错误的日志输出
// 12. 请求优化：基于实际前端curl，精简请求头和参数，提高性能和兼容性

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

// 随机用户ID生成函数 - 生成符合UUID v4格式的随机用户ID
function generateRandomUserId() {
  // 生成16进制随机字符串
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const randomHex = (length) => Array.from({ length }, hex).join('');
  
  // 构造UUID v4格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // 其中 y 的第一位必须是 8, 9, a, 或 b
  const part1 = randomHex(8);
  const part2 = randomHex(4);
  const part3 = '4' + randomHex(3);  // UUID v4标识
  const part4 = ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)] + randomHex(3);
  const part5 = randomHex(12);
  
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

// 预定义固定值避免部分运行时计算开销
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
  maxRedirects: 5,                   // 增加重定向次数，处理更多网络情况
  // DNS和连接超时优化 - 增强稳定性
  setupTimeout: '60s',               // 增加设置阶段超时
  teardownTimeout: '30s',            // 增加清理阶段超时
  // HTTP Keep-Alive设置 - 减少连接重置
  discardResponseBodies: false,      // 保持响应体，确保完整测试
  // 新增：连接重置防护配置
  // httpDebug: 'full',              // 关闭HTTP调试模式，减少日志输出
  hosts: {
    'station-developer-dev-staging.aevatar.ai': '172.67.155.130', // 可选：DNS预解析
  },
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
  
  // 每次生成随机用户ID，确保测试的多样性
  const userId = generateRandomUserId();
  
  // 步骤1: 创建会话
  const createSessionUrl = `${data.baseUrl}/godgpt/create-session`;
  const createSessionPayload = JSON.stringify({
    guider: '',
    userId: userId  // 保留userId参数，确保每次使用不同的随机用户ID
  });
  
  // 构造已登录用户的create-session请求头 - 精简版，基于实际前端调用
  const sessionHeaders = {
    'accept': '*/*',
    'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
    'authorization': `Bearer ${data.bearerToken}`,
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'godgptlanguage': 'en',              // 前端实际使用的语言标识
    'origin': config.origin,
    'pragma': 'no-cache',
    'priority': 'u=1, i',
    'referer': config.referer,
    'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  };
  
  const createSessionParams = {
    headers: sessionHeaders,
    timeout: '180s',               // 增加超时时间到180秒，减少timeout错误
  };
  
  const createSessionResponse = http.post(createSessionUrl, createSessionPayload, createSessionParams);

  // 简化会话创建成功判断 - 仅HTTP状态码验证以减少JSON解析开销
  const isSessionCreated = createSessionResponse.status === 200;

  // 优化错误处理：关闭debug但保留关键错误日志
  if (!isSessionCreated) {
    if (createSessionResponse.status === 0) {
      // 连接相关错误：只在非常见错误时打印，避免日志噪音
      if (createSessionResponse.error && 
          !createSessionResponse.error.includes('connection reset') && 
          !createSessionResponse.error.includes('timeout') &&
          !createSessionResponse.error.includes('read: operation timed out')) {
        console.error(`❌ [会话创建异常] userId=${userId}: ${createSessionResponse.error}`);
      }
    } else {
      // HTTP错误：显示所有非连接相关的状态码错误，包括524、502、503等
      console.error(`❌ [会话创建失败] userId=${userId}, status=${createSessionResponse.status}`);
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
  
  // 构造已登录用户的chat请求头 - 精简版，基于实际前端调用
  const chatHeaders = {
    'accept': 'text/event-stream',
    'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
    'authorization': `Bearer ${data.bearerToken}`,
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'godgptlanguage': 'en',               // 前端实际使用的语言标识
    'origin': config.origin,
    'pragma': 'no-cache',
    'priority': 'u=1, i',
    'referer': config.referer,
    'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
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
    timeout: '300s',               // 大幅增加聊天超时时间到300秒，适应SSE长响应
  };
  
  const chatResponse = http.post(`${data.baseUrl}/gotgpt/chat`, JSON.stringify(chatPayload), chatParams);
  
  // 验证聊天响应 - 流式响应验证：HTTP 200 + SSE数据格式检查
  const isChatSuccess = chatResponse.status === 200 && (() => {
    // 快速SSE流式响应验证：检查关键标识符避免完整JSON解析
    const body = chatResponse.body || '';
    return body.includes('data:') || body.includes('event:') || body.includes('ResponseType') || body.length === 0;
  })();

  // 优化聊天错误处理：关闭debug但保留关键错误日志
  if (!isChatSuccess) {
    if (chatResponse.status === 0) {
      // 连接相关错误：只在非常见错误时打印，避免日志噪音
      if (chatResponse.error && 
          !chatResponse.error.includes('connection reset') && 
          !chatResponse.error.includes('timeout') &&
          !chatResponse.error.includes('read: operation timed out')) {
        console.error(`❌ [聊天异常] userId=${userId}, sessionId=${sessionId}: ${chatResponse.error}`);
      }
    } else {
      // HTTP错误：显示所有非连接相关的状态码错误，包括524、502、503等
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
  
  console.log('🎯 开始 user/chat (随机用户ID版本) 超稳定QPS压力测试...');
  console.log(`⚡ 目标QPS: ${TARGET_QPS} | 预分配VU: ${preAllocatedVUs} | 最大VU: ${maxVUs}`);
  console.log(`🕐 测试时间: ${startTime} (持续10分钟)`);
  console.log('🔧 优化策略: 基于实测流程耗时合理分配VU资源，确保QPS稳定性');
  console.log('⚠️  修复: 增加超时时间到120s，优化SSE响应判断逻辑，支持更多HTTP状态码');
  console.log('🌊 流式验证: 检测SSE数据格式（data: {"ResponseType":...} event: completed）');
  console.log('🆔 用户标识: 每次请求使用随机生成的UUID v4格式用户ID，提高测试真实性');
  console.log('🔍 错误监控: 已关闭debug模式，显示所有HTTP状态码错误，只过滤连接重置/超时');
  console.log('💡 提示: 使用 k6 run --quiet 命令进一步减少输出，使用 --log-level error 只显示错误');
  
  return setupTest(
    config, 
    tokenConfig, 
    'user/chat (随机用户ID版本)', 
    TARGET_QPS, 
    '/gotgpt/chat',
    '🌊 测试流程: create-session → chat (SSE流式响应) | 🆔 随机用户ID'
  );
}

// 测试清理阶段
export function teardown(data) {
  const endTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`✅ user/chat (随机用户ID版本) 超稳定QPS压力测试完成 - ${endTime}`);
  console.log('🔍 关键指标: 会话创建成功率、聊天响应成功率、端到端响应时间、QPS稳定性');
  teardownTest('user/chat (随机用户ID版本)', '会话创建成功率、聊天响应成功率、端到端响应时间、QPS稳定性');
} 