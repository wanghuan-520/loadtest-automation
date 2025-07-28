import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 使用说明：
// 默认目标QPS: 20 QPS（每秒20个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=30 user-chat-qps-test.js
// 示例: k6 run -e TARGET_QPS=25 user-chat-qps-test.js

// 自定义指标
const sessionCreationRate = new Rate('session_creation_success_rate');
const chatResponseRate = new Rate('chat_response_success_rate');
const chatResponseDuration = new Trend('chat_response_duration');
const createResponseDuration = new Trend('create_response_duration');
const endToEndDuration = new Trend('end_to_end_duration');

// 从配置文件加载环境配置和测试数据
const config = JSON.parse(open('../../../config/env.dev.json'));
const testData = JSON.parse(open('../../../config/test-data.json'));

// 获取目标QPS参数，默认值为20
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 20;

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
      maxVUs: TARGET_QPS * 3,        // 最大VU数量（QPS的3倍，认证用户聊天需要更多VU）
      tags: { test_type: 'fixed_qps_user_chat' },
    },
  },
  // 阈值设置
  thresholds: {
    // HTTP请求失败率应低于1%
    http_req_failed: ['rate<0.01'],
    // 会话创建成功率应高于99%
    'session_creation_success_rate': ['rate>0.99'],
    // 聊天响应成功率应高于99%
    'chat_response_success_rate': ['rate>0.99'],
    // 95%的聊天响应时间应低于5000ms（用户聊天可能较慢）
    'chat_response_duration': ['p(95)<5000'],
    // 端到端时间稍宽松
    'end_to_end_duration': ['p(95)<8000'],
  },
};

// 测试主函数
export default function () {
  const startTime = Date.now();
  
  // 步骤1: 创建会话
  const createSessionUrl = `${config.baseUrl}/godgpt/create-session`;
  const createSessionPayload = JSON.stringify({
    guider: ''
  });
  
  // 构造已登录用户的create-session请求头
  const sessionHeaders = {
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'authorization': 'Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjVEQzMyOTBDQzUyRTU2OEM0MEQ0ODA1NDc0REQ5NjMzOEM5MTAzMkMiLCJ4NXQiOiJYY01wRE1VdVZveEExSUJVZE4yV000eVJBeXciLCJ0eXAiOiJhdCtqd3QifQ.eyJpc3MiOiJodHRwczovL2F1dGgtc3RhdGlvbi1zdGFnaW5nLmFldmF0YXIuYWkvIiwiZXhwIjoxNzUzNTE5Nzc3LCJpYXQiOjE3NTMzNDY5NzgsImF1ZCI6IkFldmF0YXIiLCJzY29wZSI6IkFldmF0YXIgb2ZmbGluZV9hY2Nlc3MiLCJqdGkiOiJhZWQwNDI5Ni1mMWZkLTQxNGUtODhjNS02ZmMwNmVlZWFjNWYiLCJzdWIiOiJhZjQ4N2NkNy00YzkzLTRmZjctYTA1NS02MDNiNmE2Mzg3NjciLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJoYWhhbmljZWNhdEBnbWFpbC5jb21AZ29vZ2xlIiwiZW1haWwiOiJhMzg4MDNkMDY0ZGU0NWY0OTY5OWRhZTJkYjU4ZWZlOUBBQlAuSU8iLCJyb2xlIjoiYmFzaWNVc2VyIiwicGhvbmVfbnVtYmVyX3ZlcmlmaWVkIjoiRmFsc2UiLCJlbWFpbF92ZXJpZmllZCI6IkZhbHNlIiwidW5pcXVlX25hbWUiOiJoYWhhbmljZWNhdEBnbWFpbC5jb21AZ29vZ2xlIiwic2VjdXJpdHlfc3RhbXAiOiI3UEZZV1NZTFFDUjI2NEWER0EzM05WRUxISFdSRlhLUCIsIm9pX3Byc3QiOiJBZXZhdGFyQXV0aFNlcnZlciIsIm9pX2F1X2lkIjoiMWE2NWRjZDQtZTM4ZC0wNzM4LTMyMTUtM2ExYjRkY2M4OWQ3IiwiY2xpZW50X2lkIjoiQWV2YXRhckF1dGhTZXJ2ZXIiLCJvaV90a25faWQiOiJhM2M5MzNkOC0yZmZiLWRjOWEtNjljNi0zYTFiNGRjYzg5ZGMifQ.RYQ8izYLQiyW3cu9s77tII0bUDwULpJZkfcY_OWsKgxonGdjPDX0-nSCkKQ3xTxr7Kw-xyWZbd3nnWEh_9_rNcPkOVr2Pgvs1WQsrFPOND-ohkJciuKQVMqosQrL8R3_nUyEMH3WfiDqgRg9q0isR6xtKGA9es2sef9JLGcpwCm-bximgjrnNms7MQoIhka8QE0x_mxCi0ryAFDL74k09PcB03fG2WW7EX-spFoV6z16_qz3eY2h7_ov82ceWhX_J7xkRnoqVSwzNlBnw4uMrBTrOHnMGeKKgufO0PmuY_M_UAXQ7hGNWCiVyj_DCRc_cPTF4gD7rftOOjbw64691g',
    'content-type': 'application/json',
    'origin': config.origin,
    'priority': 'u=1, i',
    'referer': config.referer,
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  };
  
  const createSessionParams = {
    headers: sessionHeaders,
    timeout: '30s',
  };
  
  const createSessionResponse = http.post(createSessionUrl, createSessionPayload, createSessionParams);

  // 检查会话创建是否成功 - 只检查HTTP状态码200
  const isSessionCreated = check(createSessionResponse, {
    'session creation status is 200': (r) => r.status === 200,
  });
  
  // 记录会话创建指标
  sessionCreationRate.add(isSessionCreated);
  
  // 记录create-session响应时间
  if (createSessionResponse.status === 200) {
    createResponseDuration.add(createSessionResponse.timings.duration);
  }

  // 如果会话创建失败，跳过后续步骤
  if (!isSessionCreated) {
    return;
  }
  
  // 从create-session响应中解析sessionId
  let sessionId = null;
  try {
    const responseData = JSON.parse(createSessionResponse.body);
    if (responseData && responseData.code === '20000' && responseData.data) {
      sessionId = responseData.data;
    } else {
      return;
    }
  } catch (error) {
    return;
  }
  
  // 步骤2: 发送聊天消息
  const randomMessage = testData.messages[Math.floor(Math.random() * testData.messages.length)];
  
  // 构造已登录用户的chat请求头 - 支持SSE流式响应
  const chatHeaders = {
    'accept': 'text/event-stream',
    'accept-language': 'zh-CN,zh;q=0.9',
    'authorization': 'Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjVEQzMyOTBDQzUyRTU2OEM0MEQ0ODA1NDc0REQ5NjMzOEM5MTAzMkMiLCJ4NXQiOiJYY01wRE1VdVZveEExSUJVZE4yV000eVJBeXciLCJ0eXAiOiJhdCtqd3QifQ.eyJpc3MiOiJodHRwczovL2F1dGgtc3RhdGlvbi1zdGFnaW5nLmFldmF0YXIuYWkvIiwiZXhwIjoxNzUzNTE5Nzc3LCJpYXQiOjE3NTMzNDY5NzgsImF1ZCI6IkFldmF0YXIiLCJzY29wZSI6IkFldmF0YXIgb2ZmbGluZV9hY2Nlc3MiLCJqdGkiOiJhZWQwNDI5Ni1mMWZkLTQxNGUtODhjNS02ZmMwNmVlZWFjNWYiLCJzdWIiOiJhZjQ4N2NkNy00YzkzLTRmZjctYTA1NS02MDNiNmE2Mzg3NjciLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJoYWhhbmljZWNhdEBnbWFpbC5jb21AZ29vZ2xlIiwiZW1haWwiOiJhMzg4MDNkMDY0ZGU0NWY0OTY5OWRhZTJkYjU4ZWZlOUBBQlAuSU8iLCJyb2xlIjoiYmFzaWNVc2VyIiwicGhvbmVfbnVtYmVyX3ZlcmlmaWVkIjoiRmFsc2UiLCJlbWFpbF92ZXJpZmllZCI6IkZhbHNlIiwidW5pcXVlX25hbWUiOiJoYWhhbmljZWNhdEBnbWFpbC5jb21AZ29vZ2xlIiwic2VjdXJpdHlfc3RhbXAiOiI3UEZZV1NZTFFDUjI2ROZWT0EzM05WRUxISFdSRlhLUCIsIm9pX3Byc3QiOiJBZXZhdGFyQXV0aFNlcnZlciIsIm9pX2F1X2lkIjoiMWE2NWRjZDQtZTM4ZC0wNzM4LTMyMTUtM2ExYjRkY2M4OWQ3IiwiY2xpZW50X2lkIjoiQWV2YXRhckF1dGhTZXJ2ZXIiLCJvaV90a25faWQiOiJhM2M5MzNkOC0yZmZiLWRjOWEtNjljNi0zYTFiNGRjYzg5ZGMifQ.RYQ8izYLQiyW3cu9s77tII0bUDwULpJZkfcY_OWsKgxonGdjPDX0-nSCkKQ3xTxr7Kw-xyWZbd3nnWEh_9_rNcPkOVr2Pgvs1WQsrFPOND-ohkJciuKQVMqosQrL8R3_nUyEMH3WfiDqgRg9q0isR6xtKGA9es2sef9JLGcpwCm-bximgjrnNms7MQoIhka8QE0x_mxCi0ryAFDL74k09PcB03fG2WW7EX-spFoV6z16_qz3eY2h7_ov82ceWhX_J7xkRnoqVSwzNlBnw4uMrBTrOHnMGeKKgufO0PmuY_M_UAXQ7hGNWCiVyj_DCRc_cPTF4gD7rftOOjbw64691g',
    'content-type': 'application/json',
    'origin': config.origin,
    'priority': 'u=1, i',
    'referer': config.referer,
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  };
  
  // 使用已登录用户的chat请求体格式 - 包含sessionId
  const chatPayload = {
    content: randomMessage.content,
    images: [],
    region: "",
    sessionId: sessionId
  };
  
  const chatParams = {
    headers: chatHeaders,
    timeout: '30s',
  };
  
  const chatResponse = http.post(`${config.baseUrl}/gotgpt/chat`, JSON.stringify(chatPayload), chatParams);
  
  // 验证聊天响应 - 只检查HTTP状态码200
  const isChatSuccess = chatResponse.status === 200;
  
  check(chatResponse, {
    'chat response status is 200': (r) => r.status === 200,
  });

  // 记录自定义指标 - 只有200状态码才计入成功
  chatResponseRate.add(isChatSuccess);
  if (chatResponse.status === 200) {
    chatResponseDuration.add(chatResponse.timings.duration);
  }
  
  // 计算端到端响应时间
  const endTime = Date.now();
  const endToEndTime = endTime - startTime;
  endToEndDuration.add(endToEndTime);
}

// 测试设置阶段
export function setup() {
  console.log('🎯 开始 user/chat 固定QPS压力测试...');
  console.log(`📡 测试目标: ${config.baseUrl}/gotgpt/chat`);
  console.log(`🔧 测试场景: 固定QPS测试 (${TARGET_QPS} QPS，持续5分钟)`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * 300} 个 (${TARGET_QPS} QPS × 300秒)`);
  console.log('🔐 认证方式: Bearer Token');
  console.log('🌊 测试流程: create-session → chat (SSE流式响应)');
  console.log('⏱️  预计测试时间: 5分钟');
  return { baseUrl: config.baseUrl };
}

// 测试清理阶段
export function teardown(data) {
  console.log('✅ user/chat 固定QPS压力测试完成');
  console.log('🔍 关键指标：会话创建成功率、聊天响应成功率、端到端响应时间、QPS稳定性');
  console.log('📈 请分析QPS是否稳定、响应时间分布和系统资源使用情况');
} 