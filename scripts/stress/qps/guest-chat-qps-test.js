import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 使用说明：
// 默认目标QPS: 30 QPS（每秒30个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=50 guest-chat-qps-test.js
// 示例: k6 run -e TARGET_QPS=40 guest-chat-qps-test.js

// 自定义指标
const sessionCreationRate = new Rate('session_creation_success_rate');
const chatResponseRate = new Rate('chat_response_success_rate');
const chatResponseDuration = new Trend('chat_response_duration');
const endToEndDuration = new Trend('end_to_end_duration');

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
      duration: '5m',                // 测试持续时间：5分钟
      preAllocatedVUs: Math.max(TARGET_QPS, 1),  // 预分配VU数量（至少为QPS数量）
      maxVUs: TARGET_QPS * 5,        // 最大VU数量（QPS的5倍，聊天测试需要更多VU）
      tags: { test_type: 'fixed_qps_chat' },
    },
  },
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'session_creation_success_rate': ['rate>0.99'],
  //   'chat_response_success_rate': ['rate>0.99'],
  //   'chat_response_duration': ['p(95)<3000'],
  //   'end_to_end_duration': ['p(95)<5000'],
  // },
};

// 测试主函数
export default function () {
  const startTime = Date.now();
  
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
      timeout: '30s',
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

  // 如果会话创建失败，跳过后续步骤
  if (!isSessionCreated) {
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
      timeout: '30s',
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

  // 记录自定义指标 - 只有业务成功才计入成功
  chatResponseRate.add(isChatSuccess);
  if (isChatSuccess) {
    chatResponseDuration.add(chatResponse.timings.duration);
  }
  
  // 计算端到端响应时间
  const endTime = Date.now();
  const endToEndTime = endTime - startTime;
  endToEndDuration.add(endToEndTime);
}

// 测试设置阶段
export function setup() {
  console.log('🎯 开始 guest/chat 固定QPS压力测试...');
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/guest/chat`);
  console.log(`🔧 测试场景: 固定QPS测试 (${TARGET_QPS} QPS，持续5分钟)`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * 300} 个 (${TARGET_QPS} QPS × 300秒)`);
  console.log('🌊 测试流程: create-session → chat (SSE流式响应)');
  console.log('⏱️  预计测试时间: 5分钟');
  return { baseUrl: config.baseUrl };
}

// 测试清理阶段
export function teardown(data) {
  console.log('✅ guest/chat 固定QPS压力测试完成');
  console.log('🔍 关键指标：会话创建成功率、聊天响应成功率、端到端响应时间、QPS稳定性');
  console.log('📈 请分析QPS是否稳定、响应时间分布和系统资源使用情况');
} 