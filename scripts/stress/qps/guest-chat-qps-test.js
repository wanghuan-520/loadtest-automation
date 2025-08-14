import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 使用说明：
// 默认目标QPS: 30 QPS（每秒30个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=50 guest-chat-qps-test.js
// 示例: k6 run -e TARGET_QPS=40 guest-chat-qps-test.js

// 自定义指标
const sessionCreationRate = new Rate('session_creation_success_rate');
const sessionCreationDuration = new Trend('session_creation_duration');
const chatResponseRate = new Rate('chat_response_success_rate');
const chatResponseDuration = new Trend('chat_response_duration');

// QPS统计计数器
import { Counter } from 'k6/metrics';
const sessionAttemptCounter = new Counter('session_attempt_total');
const sessionSuccessCounter = new Counter('session_success_total');
const chatAttemptCounter = new Counter('chat_attempt_total');
const chatSuccessCounter = new Counter('chat_success_total');

// 移除session池，恢复原始串行逻辑


// 从配置文件加载环境配置和测试数据
const config = JSON.parse(open('../../../config/env.dev.json'));
const testData = JSON.parse(open('../../../config/test-data.json'));

// 获取目标QPS参数，默认值为30
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 30;

// 生成随机IP地址的函数
function generateRandomIP() {
  const octet1 = Math.floor(Math.random() * 256);
  const octet2 = Math.floor(Math.random() * 256);
  const octet3 = Math.floor(Math.random() * 256);
  const octet4 = Math.floor(Math.random() * 256);
  return `${octet1}.${octet2}.${octet3}.${octet4}`;
}

// 生成随机User-Agent
function generateRandomUserAgent() {
  const chromeVersions = ['138.0.0.0', '137.0.0.0', '136.0.0.0', '135.0.0.0'];
  const webkitVersions = ['537.36', '537.35', '537.34'];
  const chromeVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
  const webkitVersion = webkitVersions[Math.floor(Math.random() * webkitVersions.length)];
  
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Chrome/${chromeVersion} Safari/${webkitVersion}`;
}



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
  batchPerHost: 2,                   // 增加到2，提高并发处理能力
  noConnectionReuse: false,          // 启用连接复用，减少新连接建立
  userAgent: 'k6-loadtest/1.0',      // 统一User-Agent
  // HTTP连接池优化
  insecureSkipTLSVerify: false,      // 保持TLS验证
  tlsAuth: [],                       // TLS认证配置
  hosts: {},                         // 主机映射
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
  
  // 生成随机信息避免聊天次数限制
  const randomIP = generateRandomIP();
  const randomUserAgent = generateRandomUserAgent();
  
  // 构造会话创建请求头 - 使用随机User-Agent
  const sessionHeaders = {
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'content-type': 'application/json',
    'origin': config.origin,
    'referer': config.referer,
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': randomUserAgent,
  };
  
  // 步骤1：创建会话 - 使用正确的请求体和随机信息
  sessionAttemptCounter.add(1); // 统计session尝试次数
  
  const createSessionResponse = http.post(
    `${config.baseUrl}/godgpt/guest/create-session`,
    JSON.stringify({
      guider: "",
      ip: randomIP
    }),
    { 
      headers: sessionHeaders,
      timeout: '60s',                      // 增加：session创建超时调整为60s，应对网络波动
    }
  );

  // 会话创建业务成功判断 - HTTP状态码200 + 业务code为20000
  const isSessionCreated = check(createSessionResponse, {
    'HTTP状态码200': (r) => r.status === 200,
    '业务代码20000': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.code === "20000";
      } catch {
        return false;
      }
    }
  });

  // 记录会话创建指标 - 只有HTTP200且业务code为20000才算成功
  sessionCreationRate.add(isSessionCreated);
  if (isSessionCreated) {
    sessionSuccessCounter.add(1); // 统计session成功次数
    sessionCreationDuration.add(createSessionResponse.timings.duration);
  }

  // 如果会话创建失败，打印错误信息并跳过后续步骤
  if (!isSessionCreated) {
    // 区分不同类型的错误
    if (createSessionResponse.status === 0) {
      // 连接重置或超时错误，简化日志输出
      if (Math.random() < 0.1) { // 只显示10%的连接错误详情
        console.error(`❌ 连接错误 (仅显示10%详情): ${createSessionResponse.error || '连接重置'}`);
      }
    } else {
      // 其他HTTP错误正常显示
      console.error(`❌ 会话创建失败 - HTTP状态码: ${createSessionResponse.status}, 响应体: ${createSessionResponse.body}`);
    }
    return;
  }

  // 解析会话ID（业务成功时才解析）
  let sessionData = null;
  try {
    const responseData = JSON.parse(createSessionResponse.body);
    if (responseData && responseData.code === '20000' && responseData.data) {
      sessionData = responseData.data;
    } else {
      return;
    }
  } catch (error) {
    return;
  }

  // 接口调用流程：直接进行聊天请求

  // 步骤2：发送聊天消息
  const randomMessage = testData.messages[Math.floor(Math.random() * testData.messages.length)];
  
  // 构造聊天请求头 - 参照成功案例格式，支持SSE流式响应
  const chatHeaders = {
    'accept': 'text/event-stream',
    'accept-language': 'zh-CN,zh;q=0.9',
    'content-type': 'application/json',
    'origin': config.origin,
    'referer': config.referer,
    'priority': 'u=1, i',
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': randomUserAgent,
  };
  
  // 使用正确的请求体格式 - 参照成功案例
  const chatPayload = {
    content: randomMessage.content,
    images: [],
    region: "",
    ip: randomIP
  };

  // 添加重试机制处理超时问题
  chatAttemptCounter.add(1); // 统计chat尝试次数
  
  let chatResponse;
  let retryCount = 0;
  const maxRetries = 1;  // 最多重试1次，避免过度重试影响QPS
  
  while (retryCount <= maxRetries) {
    try {
      chatResponse = http.post(
        `${config.baseUrl}/godgpt/guest/chat`,
        JSON.stringify(chatPayload),
        { 
          headers: chatHeaders,
          timeout: '120s',                     // 修复：chat超时调回120s，60s不足应对SSE流式响应
        }
      );
      
      // 如果请求成功或者是业务错误（非超时），跳出重试循环
      if (chatResponse.status !== 0) {
        break;
      }
      
    } catch (error) {
      if (retryCount < maxRetries) {
        console.log(`🔄 chat请求重试 ${retryCount + 1}/${maxRetries + 1}: ${error.message}`);
      }
    }
    
    retryCount++;
    if (retryCount <= maxRetries) {
      sleep(0.2); // 重试前等待200ms
    }
  }
  
  // 如果所有重试都失败，创建失败响应
  if (!chatResponse || chatResponse.status === 0) {
    chatResponse = {
      status: 0,
      body: null,
      headers: {},
      timings: { duration: 0 }
    };
  }

  // 验证聊天响应 - HTTP状态码200 + 业务code判断（聊天响应可能是流式，需兼容处理）
  const isChatSuccess = check(chatResponse, {
    'HTTP状态码200': (r) => r.status === 200,
    '业务成功判断': (r) => {
      if (r.status !== 200) return false;
      
      // 聊天API可能返回SSE流式响应，先尝试解析JSON
      try {
        const data = JSON.parse(r.body);
        return data.code === "20000";
      } catch {
        // 如果不是JSON格式（可能是SSE流），HTTP 200即视为成功
        return r.status === 200;
      }
    }
  });

  // 如果聊天失败，打印简化错误信息（减少超时噪音）
  if (!isChatSuccess) {
    if (chatResponse.status === 0) {
      // 超时错误，只统计不详细打印（避免日志爆炸）
      if (Math.random() < 0.1) { // 只有10%的超时错误会打印详情
        console.error(`❌ 超时错误 (仅显示10%的超时详情)`);
      }
    } else {
      // 其他类型错误正常打印
      console.error(`❌ 聊天响应失败 - HTTP状态码: ${chatResponse.status}`);
      if (chatResponse.status >= 500) {
        console.error(`服务器错误: ${chatResponse.body}`);
      }
    }
  }

  // 记录自定义指标 - 只有业务成功才计入成功
  chatResponseRate.add(isChatSuccess);
  if (isChatSuccess) {
    chatSuccessCounter.add(1); // 统计chat成功次数
    chatResponseDuration.add(chatResponse.timings.duration);
  }
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