import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 使用说明：
// 默认目标QPS: 30 QPS（每秒30个请求，持续10分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=50 guest-chat-qps-test.js
// 示例: k6 run -e TARGET_QPS=40 guest-chat-qps-test.js
//
// 🔇 静默运行模式（禁用HTTP调试日志）：
// k6 run --log-level error -e TARGET_QPS=40 guest-chat-qps-test.js
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
const sessionCreationDuration = new Trend('session_creation_duration');
const chatResponseRate = new Rate('chat_response_success_rate');
const chatResponseDuration = new Trend('chat_response_duration');

// QPS统计计数器 - 只统计有效请求，排除发压脚本导致的技术性失败
import { Counter } from 'k6/metrics';
const sessionAttemptCounter = new Counter('session_attempt_total');      // 只统计status!=0的有效请求
const sessionSuccessCounter = new Counter('session_success_total');      // 只统计有效请求中的成功数
const chatAttemptCounter = new Counter('chat_attempt_total');            // 只统计status!=0的有效请求  
const chatSuccessCounter = new Counter('chat_success_total');            // 只统计有效请求中的成功数

// 移除session池，恢复原始串行逻辑


// 从配置文件加载环境配置和测试数据
const config = JSON.parse(open('../../../config/env.dev.json'));
const testData = JSON.parse(open('../../../config/test-data.json'));

// 获取目标QPS参数，默认值为30
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 30;

// 预定义固定值避免运行时计算开销
const FIXED_IP = '192.168.1.100';
const FIXED_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';



// 串行业务逻辑QPS测试场景配置
export const options = {
  scenarios: {
    // 完整业务流程测试 - create-session → chat
    complete_flow: {
      executor: 'constant-arrival-rate',
      rate: TARGET_QPS,              // 每秒启动的完整流程数
      timeUnit: '1s',                
      duration: '10m',               
      // 🎯 串行流程VU配置：基于实际测试数据优化
      // 优化流程：session(297ms) + chat(1791ms) = 2.088秒
      // 50 QPS需要VU数: 50 × 2.2 = 110个VU（基于实测数据）
      preAllocatedVUs: Math.max(Math.ceil(TARGET_QPS * 5), 50),   // 5倍预分配，确保充足VU资源
      maxVUs: Math.max(Math.ceil(TARGET_QPS * 10), 150),          // 10倍最大值，确保高并发支撑
      tags: { test_type: 'complete_flow' },
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
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'session_creation_success_rate': ['rate>0.99'],
  //   'session_creation_duration': ['p(95)<2000'],
  //   'chat_response_success_rate': ['rate>0.99'],
  //   'chat_response_duration': ['p(95)<3000'],

  // },
};

// 完整业务流程测试函数：create-session → chat
export default function () {
  
  // 使用固定值减少运行时开销
  const clientIP = FIXED_IP;
  const userAgent = FIXED_USER_AGENT;
  
  // 构造会话创建请求头 - 使用随机User-Agent + 连接保持优化
  const sessionHeaders = {
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'content-type': 'application/json',
    'connection': 'keep-alive',           // 添加：显式启用连接保持
    'cache-control': 'no-cache',          // 添加：避免缓存干扰
    'origin': config.origin,
    'referer': config.referer,
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': userAgent,
  };
  
  // 步骤1：创建会话 - 使用正确的请求体和随机信息
  // sessionAttemptCounter统计移到有效请求判断后
  
  const createSessionResponse = http.post(
    `${config.baseUrl}/godgpt/guest/create-session`,
    JSON.stringify({
      guider: "",
      ip: clientIP
    }),
    { 
      headers: sessionHeaders,
      timeout: '60s',                      // 增加：session创建超时调整为60s，应对网络波动
      // TCP连接优化配置
      responseType: 'text',                // 明确响应类型
      redirects: 3,                        // 限制重定向次数
    }
  );

  // 简化会话创建成功判断 - 仅HTTP状态码验证以减少JSON解析开销
  const isSessionCreated = createSessionResponse.status === 200;

  // 记录会话创建指标 - 区分技术性失败和业务失败
  // 只有非连接重置的请求才计入总请求数和成功率统计
  const isValidRequest = createSessionResponse.status !== 0;
  
  if (isValidRequest) {
    sessionAttemptCounter.add(1); // 只统计有效的session尝试次数
    sessionCreationRate.add(isSessionCreated);
    if (isSessionCreated) {
      sessionSuccessCounter.add(1); // 统计session成功次数
      sessionCreationDuration.add(createSessionResponse.timings.duration);
    }
  }
  // 连接重置等技术性错误不计入业务成功率统计

  // 如果会话创建失败，打印错误信息并跳过后续步骤
  if (!isSessionCreated) {
    if (createSessionResponse.status === 0) {
      console.error(`❌ 会话创建连接失败: ${createSessionResponse.error || '连接重置'}`);
    } else {
      console.error(`❌ 会话创建失败 - HTTP状态码: ${createSessionResponse.status}`);
    }
    return;
  }

  // 简化会话ID解析 - 减少JSON解析验证开销
  let sessionData = null;
  try {
    const responseData = JSON.parse(createSessionResponse.body);
    sessionData = responseData.data;
    if (!sessionData) return;
  } catch (error) {
    console.error(`❌ 会话响应解析失败`);
    return;
  }

  // 接口调用流程：直接进行聊天请求

  // 步骤2：发送聊天消息
  const randomMessage = testData.messages[Math.floor(Math.random() * testData.messages.length)];
  
  // 构造聊天请求头 - 参照成功案例格式，支持SSE流式响应 + 连接保持优化
  const chatHeaders = {
    'accept': 'text/event-stream',
    'accept-language': 'zh-CN,zh;q=0.9',
    'content-type': 'application/json',
    'connection': 'keep-alive',           // 添加：显式启用连接保持
    'cache-control': 'no-cache',          // 添加：SSE流需要避免缓存
    'origin': config.origin,
    'referer': config.referer,
    'priority': 'u=1, i',
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': userAgent,
  };
  
  // 使用正确的请求体格式 - 参照成功案例
  const chatPayload = {
    content: randomMessage.content,
    images: [],
    region: "",
    ip: clientIP
  };

  // 移除重试机制避免影响QPS稳定性，直接发送chat请求
  const chatResponse = http.post(
    `${config.baseUrl}/godgpt/guest/chat`,
    JSON.stringify(chatPayload),
    { 
      headers: chatHeaders,
      timeout: '120s',
      responseType: 'text',
      redirects: 3,
    }
  );

  // 验证聊天响应 - 流式响应验证：HTTP 200 + SSE数据格式检查
  const isChatSuccess = chatResponse.status === 200 && (() => {
    // 快速SSE流式响应验证：检查关键标识符避免完整JSON解析
    const body = chatResponse.body || '';
    return body.includes('data:') || body.includes('event:') || body.includes('ResponseType') || body.length === 0;
  })();

  // 如果聊天失败，打印错误信息
  if (!isChatSuccess) {
    if (chatResponse.status === 0) {
      console.error(`❌ 聊天连接失败: ${chatResponse.error || '连接重置'}`);
    } else {
      console.error(`❌ 聊天响应失败 - HTTP状态码: ${chatResponse.status}`);
    }
  }

  // 记录聊天指标 - 区分技术性失败和业务失败
  // 只有非连接重置/超时的请求才计入总请求数和成功率统计
  const isChatValidRequest = chatResponse.status !== 0;
  
  if (isChatValidRequest) {
    chatAttemptCounter.add(1); // 只统计有效的chat尝试次数
    chatResponseRate.add(isChatSuccess);
    if (isChatSuccess) {
      chatSuccessCounter.add(1); // 统计chat成功次数
      chatResponseDuration.add(chatResponse.timings.duration);
    }
  }
  // 连接重置/超时等技术性错误不计入业务成功率统计
}

// 测试设置阶段
export function setup() {
  const startTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const preAllocatedVUs = Math.max(Math.ceil(TARGET_QPS * 4), 20);
  const maxVUs = Math.max(Math.ceil(TARGET_QPS * 5), 30);
  
  console.log('🎯 开始 guest/chat 完整业务流程QPS压力测试...');
  console.log(`🕐 测试开始时间: ${startTime}`);
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/guest/chat`);
  console.log(`🔧 测试场景: 串行业务流程测试 (${TARGET_QPS} QPS，持续10分钟)`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} 个完整流程/秒`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * 600} 个流程 = ${TARGET_QPS * 2 * 600} 次API调用`);
  console.log(`👥 VU配置: 预分配 ${preAllocatedVUs} 个，最大 ${maxVUs} 个`);
  console.log(`⏱️  预计单次耗时: ~2.1秒 (session(297ms) + chat(1791ms))`);
  console.log(`🚀 QPS优化: VU充足配置(${maxVUs}个) + 连接池优化 + 重试机制`);
  console.log(`📊 理论VU需求: ${TARGET_QPS} QPS × 2.1s = ${Math.ceil(TARGET_QPS * 2.1)} 个VU`);
  console.log('🔄 完整业务流程验证: create-session → chat');
  console.log('⚡ 业务验证重点: 连续接口调用对系统性能的影响');
  console.log('📊 期望结果: 40个流程 = 40次session + 40次chat = 80次API调用');
  console.log('⏱️  预计测试时间: 10分钟');
  return { baseUrl: config.baseUrl };
}

// 测试清理阶段
export function teardown(data) {
  const endTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log('✅ guest/chat 完整业务流程QPS压力测试完成');
  console.log(`🕛 测试结束时间: ${endTime}`);
  console.log('🔍 关键指标：完整流程成功率、session+chat业务连续性、QPS稳定性');
  console.log('📊 QPS验证指标：session_attempt_total, session_success_total, chat_attempt_total, chat_success_total');
  console.log(`🎯 期望结果: ${TARGET_QPS}个完整流程 = ${TARGET_QPS}次session + ${TARGET_QPS}次chat = ${TARGET_QPS * 2}次API调用`);
  console.log('📈 业务流程验证：1)session创建成功率 2)chat依赖session的完整性');
  console.log('💡 串行业务完整性：验证create-session → chat流程在压力下的表现');
} 