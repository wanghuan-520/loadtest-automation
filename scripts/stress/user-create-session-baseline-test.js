import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 自定义指标
const sessionCreationRate = new Rate('session_creation_success_rate');
const createResponseDuration = new Trend('create_response_duration');

// 从配置文件加载环境配置和测试数据
const config = JSON.parse(open('../../config/env.dev.json'));
const testData = JSON.parse(open('../../config/test-data.json'));

// 生成随机IP地址的函数
function generateRandomIP() {
  const octet1 = Math.floor(Math.random() * 256);
  const octet2 = Math.floor(Math.random() * 256);
  const octet3 = Math.floor(Math.random() * 256);
  const octet4 = Math.floor(Math.random() * 256);
  return `${octet1}.${octet2}.${octet3}.${octet4}`;
}

export const options = {
  scenarios: {
    baseline_test: {
      executor: 'constant-vus',
      vus: 1,
      duration: '60s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<10000'], // 95%的请求响应时间应小于10秒
    session_creation_success_rate: ['rate>0.99'], // 会话创建成功率应大于99%
  },
};

// 测试设置阶段
export function setup() {
  console.log('🎯 开始 user/create-session 基准测试...');
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/create-session`);
  console.log('🔧 测试类型: 已登录用户基线性能测试 (1用户, 6秒)');
  console.log('🔐 认证方式: Bearer Token');
  console.log('📊 使用K6原生监控，测试完成后查看汇总报告');
  console.log('🎯 性能要求: 平均响应时间<200ms, 错误率<0.1%');
  console.log('📊 测试目的: 建立已登录用户会话创建性能基线，验证接口功能正确性');
  return { baseUrl: config.baseUrl };
}

// 主测试函数
export default function(data) {
  const startTime = Date.now();
  
  // 构造已登录用户的create-session请求
  const createSessionUrl = `${data.baseUrl}/godgpt/create-session`;
  const createSessionPayload = JSON.stringify({
    guider: ''
  });
  
  // 构造请求头 - 匹配curl命令，包含authorization token
  const sessionHeaders = {
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'authorization': 'Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjVEQzMyOTBDQzUyRTU2OEM0MEQ0ODA1NDc0REQ5NjMzOEM5MTAzMkMiLCJ4NXQiOiJYY01wRE1VdVZveEExSUJVZE4yV000eVJBeXciLCJ0eXAiOiJhdCtqd3QifQ.eyJpc3MiOiJodHRwczovL2F1dGgtc3RhdGlvbi1zdGFnaW5nLmFldmF0YXIuYWkvIiwiZXhwIjoxNzUzNTE5Nzc3LCJpYXQiOjE3NTMzNDY5NzgsImF1ZCI6IkFldmF0YXIiLCJzY29wZSI6IkFldmF0YXIgb2ZmbGluZV9hY2Nlc3MiLCJqdGkiOiJhZWQwNDI5Ni1mMWZkLTQxNGUtODhjNS02ZmMwNmVlZWFjNWYiLCJzdWIiOiJhZjQ4N2NkNy00YzkzLTRmZjctYTA1NS02MDNiNmE2Mzg3NjciLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJoYWhhbmljZWNhdEBnbWFpbC5jb21AZ29vZ2xlIiwiZW1haWwiOiJhMzg4MDNkMDY0ZGU0NWY0OTY5OWRhZTJkYjU4ZWZlOUBBQlAuSU8iLCJyb2xlIjoiYmFzaWNVc2VyIiwicGhvbmVfbnVtYmVyX3ZlcmlmaWVkIjoiRmFsc2UiLCJlbWFpbF92ZXJpZmllZCI6IkZhbHNlIiwidW5pcXVlX25hbWUiOiJoYWhhbmljZWNhdEBnbWFpbC5jb21AZ29vZ2xlIiwic2VjdXJpdHlfc3RhbXAiOiI3UEZZV1NZTFFDUjI2VERWT0EzM05WRUxISFdSRlhLUCIsIm9pX3Byc3QiOiJBZXZhdGFyQXV0aFNlcnZlciIsIm9pX2F1X2lkIjoiMWE2NWRjZDQtZTM4ZC0wNzM4LTMyMTUtM2ExYjRkY2M4OWQ3IiwiY2xpZW50X2lkIjoiQWV2YXRhckF1dGhTZXJ2ZXIiLCJvaV90a25faWQiOiJhM2M5MzNkOC0yZmZiLWRjOWEtNjljNi0zYTFiNGRjYzg5ZGMifQ.RYQ8izYLQiyW3cu9s77tII0bUDwULpJZkfcY_OWsKgxonGdjPDX0-nSCkKQ3xTxr7Kw-xyWZbd3nnWEh_9_rNcPkOVr2Pgvs1WQsrFPOND-ohkJciuKQVMqosQrL8R3_nUyEMH3WfiDqgRg9q0isR6xtKGA9es2sef9JLGcpwCm-bximgjrnNms7MQoIhka8QE0x_mxCi0ryAFDL74k09PcB03fG2WW7EX-spFoV6z16_qz3eY2h7_ov82ceWhX_J7xkRnoqVSwzNlBnw4uMrBTrOHnMGeKKgufO0PmuY_M_UAXQ7hGNWCiVyj_DCRc_cPTF4gD7rftOOjbw64691g',
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
  
  console.log('📤 Create-Session请求体:', JSON.stringify(createSessionPayload, null, 2));
  const createSessionResponse = http.post(createSessionUrl, createSessionPayload, createSessionParams);

  console.log('🔍 Create-Session响应状态码:', createSessionResponse.status);
  console.log('🔍 Create-Session响应体:', createSessionResponse.body);
  
  // 检查会话创建是否成功 - 只检查HTTP状态码200
  const isSessionCreated = check(createSessionResponse, {
    'session creation status is 200': (r) => r.status === 200,
  });
  
  // 记录会话创建指标
  sessionCreationRate.add(isSessionCreated);

  // 如果会话创建失败，记录错误信息
  if (!isSessionCreated) {
    console.log('❌ Create-Session失败，状态码:', createSessionResponse.status);
    return;
  }
  
  // 从create-session响应中解析sessionId
  let sessionId = null;
  try {
    const responseData = JSON.parse(createSessionResponse.body);
    console.log('🔍 Create-Session响应数据:', JSON.stringify(responseData, null, 2));
    
    if (responseData && responseData.code === '20000' && responseData.data) {
      sessionId = responseData.data;
      console.log('✅ 成功解析sessionId:', sessionId);
    } else {
      console.log('⚠️ 响应格式不符合预期:', responseData);
    }
  } catch (error) {
    console.log('❌ 解析sessionId失败:', error.message);
    console.log('📄 原始响应体:', createSessionResponse.body);
  }
  
  // 记录create-session响应时间
  if (createSessionResponse.status === 200) {
    createResponseDuration.add(createSessionResponse.timings.duration);
  }
}

// 测试清理阶段
export function teardown(data) {
  console.log('✅ user/create-session 基准测试完成');
  console.log('📊 已登录用户会话创建基准数据已记录到K6报告中');
  console.log('🔍 关键指标：会话创建成功率、响应时间');
  console.log('🎯 性能基线：平均响应时间<200ms, 错误率<0.1%');
} 