import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 使用说明：
// 默认目标QPS: 40 QPS（每秒40个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=60 user-create-session-qps-test.js
// 示例: k6 run -e TARGET_QPS=50 user-create-session-qps-test.js

// 自定义指标
const sessionCreationRate = new Rate('session_creation_success_rate');
const createResponseDuration = new Trend('create_response_duration');

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

// 获取目标QPS参数，默认值为40
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 40;

// 获取Bearer Token，优先级：环境变量 > tokens.json > 默认值
const BEARER_TOKEN = __ENV.BEARER_TOKEN || 
                    tokenConfig.user_bearer_token || 
                    'eyJhbGciOiJSUzI1NiIsImtpZCI6IjVEQzMyOTBDQzUyRTU2OEM0MEQ0ODA1NDc0REQ5NjMzOEM5MTAzMkMiLCJ4NXQiOiJYY01wRE1VdVZveEExSUJVZE4yV000eVJBeXciLCJ0eXAiOiJhdCtqd3QifQ.eyJpc3MiOiJodHRwczovL2F1dGgtc3RhdGlvbi1zdGFnaW5nLmFldmF0YXIuYWkvIiwiZXhwIjoxNzUzODY2Nzg2LCJpYXQiOjE3NTM2OTM5ODcsImF1ZCI6IkFldmF0YXIiLCJzY29wZSI6IkFldmF0YXIgb2ZmbGluZV9hY2Nlc3MiLCJqdGkiOiJjMzBiMGVlMy1lMjJjLTRlZTUtYWU5Ny00ZWNiZWM5NTJkZDUiLCJzdWIiOiI3ZGQ5MTJkOS0wNTc3LWU0MDctZTdjYS0zYTFiNjI3Yjc5MzUiLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJsb2FkdGVzdHdoMSIsImVtYWlsIjoibG9hZHRlc3R3aDFAdGVtbC5uZXQiLCJyb2xlIjpbImJhc2ljVXNlciIsInN5c3RlbVByb21wdEdyb3VwIl0sInBob25lX251bWJlcl92ZXJpZmllZCI6IkZhbHNlIiwiZW1haWxfdmVyaWZpZWQiOiJGYWxzZSIsInVuaXF1ZV9uYW1lIjoibG9hZHRlc3R3aDEiLCJzZWN1cml0eV9zdGFtcCI6IkJaSlJRVElCM1Y2TjVTRjJHWVJGQldSQUVFK001TVM0Iiwib2lfcHJzdCI6IkFldmF0YXJBdXRoU2VydmVyIiwib2lfYXVfaWQiOiIzZWZkMmY2ZS0zMzAxLTk1M2QtZTk2NS0zYTFiNjI3YjdjOGYiLCJjbGllbnRfaWQiOiJBZXZhdGFyQXV0aFNlcnZlciIsIm9pX3Rrbl9pZCI6ImQ1NDFjZmJhLWJiOTgtZTYyMy02NmNjLTNhMWI2MjdiN2M5NSJ9.MDfOFgkKLvvkMNK_L66uaToRRV-hDtV05_ysb3S4Oe47bBnwJGLaA6urwa3XzsCHnHne_IEy0jMl376N4G2mEX5fXPV0TSI929ksNfvYwTOKyubXMrrBmmv82hQacIVQfcaul5gJuUNKTJY8a-5ULgHv3eQ9tv9uuL8kVmNoc2q4ji21dujrnN4z0b_9W-MC9mv8hkFLm_trf_4zI470JoQkNi6z9q9kqv8tyrcUTq055BiqgbuVyGcd_lIZ3HVhNmOWUIYXLE_tHTgG15knVdF0HZZl62Ke5qMPaieKo6aF_DVBu6yF0jHKI1WxuWentu4uVEq54fYs7PXL-9oOTA';

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
      maxVUs: TARGET_QPS * 3,        // 最大VU数量（QPS的3倍，会话创建相对简单）
      tags: { test_type: 'fixed_qps_user_create_session' },
    },
  },
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'session_creation_success_rate': ['rate>0.99'],
  //   'create_response_duration': ['p(95)<2000'],
  // },
};

// 测试主函数
export default function () {
  const startTime = Date.now();
  
  // 构造已登录用户的create-session请求
  const createSessionUrl = `${config.baseUrl}/godgpt/create-session`;
  const createSessionPayload = JSON.stringify({
    guider: ''
  });
  
  // 构造请求头 - 匹配curl命令，包含authorization token
  const sessionHeaders = {
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'authorization': `Bearer ${BEARER_TOKEN}`,
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

  // 如果会话创建失败，记录错误但继续测试其他指标
  if (!isSessionCreated) {
    return;
  }
  
  // 从create-session响应中解析sessionId（可选，用于验证响应格式）
  let sessionId = null;
  try {
    const responseData = JSON.parse(createSessionResponse.body);
    
    if (responseData && responseData.code === '20000' && responseData.data) {
      sessionId = responseData.data;
    }
  } catch (error) {
    // 忽略解析错误，只关注HTTP状态码
  }
  
  // 记录create-session响应时间
  if (createSessionResponse.status === 200) {
    createResponseDuration.add(createSessionResponse.timings.duration);
  }
}

// 测试设置阶段
export function setup() {
  console.log('🎯 开始 user/create-session 固定QPS压力测试...');
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/create-session`);
  console.log(`🔧 测试场景: 固定QPS测试 (${TARGET_QPS} QPS，持续5分钟)`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * 300} 个 (${TARGET_QPS} QPS × 300秒)`);
  console.log('🔐 认证方式: Bearer Token (可通过 BEARER_TOKEN 环境变量配置)');
  console.log('💡 使用示例: k6 run -e TARGET_QPS=1 -e BEARER_TOKEN="your_token" user-create-session-qps-test.js');
  console.log('⏱️  预计测试时间: 5分钟');
  return { baseUrl: config.baseUrl };
}

// 测试清理阶段
export function teardown(data) {
  console.log('✅ user/create-session 固定QPS压力测试完成');
  console.log('🔍 关键指标：会话创建成功率、响应时间、QPS稳定性');
  console.log('📈 请分析QPS是否稳定、响应时间分布和系统资源使用情况');
} 