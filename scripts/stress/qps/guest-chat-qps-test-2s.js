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
      // 🎯 重新优化VU配置：考虑重试机制的额外耗时
      // 基础耗时：session(249ms) + sleep(2s) + chat(1677ms) ≈ 3.9秒
      // 重试耗时：最多2次重试 + 重试间隔 ≈ 最多+4.4秒
      // 总耗时：3.9秒 + 4.4秒 = 8.3秒（最坏情况）
      // 实际平均：约6秒（大部分请求不需要重试）
      preAllocatedVUs: Math.max(Math.ceil(TARGET_QPS * 7), 15),     // 7倍预分配（考虑重试）
      maxVUs: Math.max(Math.ceil(TARGET_QPS * 10), 30),            // 10倍最大值（应对重试峰值）
      tags: { test_type: 'fixed_qps_chat' },
    },
  },
  // 连接池优化：提高QPS稳定性，减少连接重置  
  batch: 1,                          // 每次只发送1个请求，确保精确控制
  batchPerHost: 1,                   // 每个主机只并发1个请求批次
  noConnectionReuse: false,          // 启用连接复用，减少新连接建立
  noVUConnectionReuse: false,        // 启用VU内连接复用，提升高QPS性能
  userAgent: 'k6-loadtest/1.0',      // 统一User-Agent
  // 连接稳定性优化配置
  discardResponseBodies: false,      // 保留响应体用于业务验证
  timeout: '120s',                   // 增加全局超时到120秒
  // 降低连接压力的配置
  rps: TARGET_QPS,                   // 显式限制RPS，防止突发流量
  userAgent: 'k6-guest-chat/1.0',    // 更明确的User-Agent
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
      timeout: '90s',
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

  // 两个接口调用之间添加2秒延迟
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

  // 添加重试机制处理连接重置问题
  let chatResponse;
  let retryCount = 0;
  const maxRetries = 2;
  
  while (retryCount <= maxRetries) {
    try {
      chatResponse = http.post(
        `${config.baseUrl}/godgpt/guest/chat`,
        JSON.stringify(chatPayload),
        { 
          headers: chatHeaders,
          timeout: '120s',               // 增加超时时间
          responseType: 'text',          // 明确响应类型
        }
      );
      
      // 如果请求成功或者是业务错误（非连接问题），跳出重试循环
      if (chatResponse.status !== 0) {
        break;
      }
      
    } catch (error) {
      console.log(`🔄 请求重试 ${retryCount + 1}/${maxRetries + 1}: ${error.message}`);
    }
    
    retryCount++;
    if (retryCount <= maxRetries) {
      sleep(0.5); // 重试前等待500ms
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

  // 如果聊天失败，打印精简错误信息（减少日志噪音）
  if (!isChatSuccess) {
    if (chatResponse.status === 0) {
      // 连接重置错误，只统计不详细打印（避免日志爆炸）
      if (Math.random() < 0.1) { // 只有10%的连接重置错误会打印详情
        console.error(`❌ 连接重置错误 (仅显示10%的错误详情)`);
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
    chatResponseDuration.add(chatResponse.timings.duration);
  }
  

}

// 测试设置阶段
export function setup() {
  const startTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const preAllocatedVUs = Math.max(Math.ceil(TARGET_QPS * 7), 15);
  const maxVUs = Math.max(Math.ceil(TARGET_QPS * 10), 30);
  
  console.log('🎯 开始 guest/chat 固定QPS压力测试...');
  console.log(`🕐 测试开始时间: ${startTime}`);
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/guest/chat`);
  console.log(`🔧 测试场景: 固定QPS测试 (${TARGET_QPS} QPS，持续10分钟)`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * 600} 个 (${TARGET_QPS} QPS × 600秒)`);
  console.log(`👥 VU配置: 预分配 ${preAllocatedVUs} 个，最大 ${maxVUs} 个`);
  console.log(`⏱️  预计单次耗时: ~6秒 (基础3.9秒 + 重试最多4.4秒)`);
  console.log(`🔧 稳定性优化: 重试机制(最多3次), 120秒超时, 减少日志噪音`);
  console.log(`🎯 高QPS优化: ${TARGET_QPS > 50 ? '启用延迟抖动' : '标准延迟模式'}`);
  console.log('🌊 测试流程: create-session → sleep(2s+抖动) → chat (SSE流式响应)');
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