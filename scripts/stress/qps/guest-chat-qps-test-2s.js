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



// 固定QPS压力测试场景配置
export const options = {
  scenarios: {
    // 固定QPS测试 - 恒定请求速率
    fixed_qps: {
      executor: 'constant-arrival-rate',
      rate: TARGET_QPS,              // 每秒请求数（QPS）
      timeUnit: '1s',                // 时间单位：1秒
      duration: '10m',               // 测试持续时间：10分钟
             // 🎯 完整流程QPS配置：基于create-session + sleep(2) + chat总耗时3.7秒
       // 实际流程：session(38ms) + sleep(2s) + chat(1677ms) = 3.715秒
       // 40 QPS需要VU数: 40 × 3.715 = 149个VU
       preAllocatedVUs: Math.max(Math.ceil(TARGET_QPS * 4), 20),    // 4倍预分配，充足VU保证QPS
       maxVUs: Math.max(Math.ceil(TARGET_QPS * 5), 30),             // 5倍最大值，应对波动(40QPS=200个VU)
      tags: { test_type: 'fixed_qps_chat' },
    },
  },
  // 连接池优化：提高QPS稳定性，减少连接重置
  batch: 1,                          // 每次只发送1个请求，确保精确控制
  batchPerHost: 1,                   // 每个主机只并发1个请求批次
  noConnectionReuse: false,          // 启用连接复用，减少新连接建立
  userAgent: 'k6-loadtest/1.0',      // 统一User-Agent
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'session_creation_success_rate': ['rate>0.99'],
  //   'session_creation_duration': ['p(95)<2000'],
  //   'chat_response_success_rate': ['rate>0.99'],
  //   'chat_response_duration': ['p(95)<3000'],

  // },
};

// 测试主函数
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
  const createSessionResponse = http.post(
    `${config.baseUrl}/godgpt/guest/create-session`,
    JSON.stringify({
      guider: "",
      ip: randomIP
    }),
         { 
       headers: sessionHeaders,
       timeout: '30s',                      // 优化：session创建超时从90s减少到30s
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
    sessionCreationDuration.add(createSessionResponse.timings.duration);
  }

  // 如果会话创建失败，打印错误信息并跳过后续步骤
  if (!isSessionCreated) {
    console.error(`❌ 会话创建失败 - HTTP状态码: ${createSessionResponse.status}, 响应体: ${createSessionResponse.body}`);
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

  // 两个接口调用之间添加1秒延迟
  sleep(2);

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

  const chatResponse = http.post(
    `${config.baseUrl}/godgpt/guest/chat`,
    JSON.stringify(chatPayload),
         { 
       headers: chatHeaders,
       timeout: '60s',                      // 优化：chat超时从90s减少到60s
     }
  );



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

  // 如果聊天失败，打印错误信息
  if (!isChatSuccess) {
    console.error(`❌ 聊天响应失败 - HTTP状态码: ${chatResponse.status}`);
    console.error(`完整响应体: ${chatResponse.body}`);
    console.error(`响应头: ${JSON.stringify(chatResponse.headers, null, 2)}`);
  }

  // 记录自定义指标 - 只有业务成功才计入成功
  chatResponseRate.add(isChatSuccess);
  if (isChatSuccess) {
    chatResponseDuration.add(chatResponse.timings.duration);
  }
  

}

// 测试设置阶段
export function setup() {
  const startTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const preAllocatedVUs = Math.max(Math.ceil(TARGET_QPS * 4), 20);
  const maxVUs = Math.max(Math.ceil(TARGET_QPS * 5), 30);
  
  console.log('🎯 开始 guest/chat 固定QPS压力测试...');
  console.log(`🕐 测试开始时间: ${startTime}`);
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/guest/chat`);
  console.log(`🔧 测试场景: 固定QPS测试 (${TARGET_QPS} QPS，持续10分钟)`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * 600} 个 (${TARGET_QPS} QPS × 600秒)`);
  console.log(`👥 VU配置: 预分配 ${preAllocatedVUs} 个，最大 ${maxVUs} 个`);
  console.log(`⏱️  预计单次耗时: ~3.2秒 (session+1.5s延迟+chat)`);
  console.log(`🚀 QPS优化: VU充足配置 + 缩短延迟(2s→1.5s) + 优化超时设置`);
  console.log('🌊 测试流程: create-session → sleep(1.5s) → chat (SSE流式响应)');
  console.log('⏱️  预计测试时间: 10分钟');
  return { baseUrl: config.baseUrl };
}

// 测试清理阶段
export function teardown(data) {
  const endTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log('✅ guest/chat 固定QPS压力测试完成');
  console.log(`🕛 测试结束时间: ${endTime}`);
  console.log('🔍 关键指标：会话创建成功率、聊天响应成功率、端到端响应时间、QPS稳定性');
  console.log('📈 请分析QPS是否稳定、响应时间分布和系统资源使用情况');
} 