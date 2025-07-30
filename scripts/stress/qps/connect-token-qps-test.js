import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 使用说明：
// 默认目标QPS: 40 QPS（每秒40个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=60 connect-token-qps-test.js
// 示例: k6 run -e TARGET_QPS=50 connect-token-qps-test.js

// 自定义指标
const tokenRequestRate = new Rate('token_request_success_rate');
const tokenResponseDuration = new Trend('token_response_duration');

// 从配置文件加载环境配置
const config = JSON.parse(open('../../../config/env.dev.json'));

// 获取目标QPS参数，默认值为40
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 40;

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
      maxVUs: TARGET_QPS * 2,        // 最大VU数量（QPS的2倍）
      tags: { test_type: 'fixed_qps_connect_token' },
    },
  },
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'token_request_success_rate': ['rate>0.99'],
  //   'token_response_duration': ['p(95)<2000'],
  // },
};

// 测试主函数
export default function () {
  const startTime = Date.now();
  
  // 构造token获取请求
  const tokenUrl = `${config.baseUrl}/connect/token`;
  
  // 构造请求体 - OAuth2 client credentials flow
  const tokenPayload = new URLSearchParams({
    'grant_type': 'client_credentials',
    'client_id': __ENV.CLIENT_ID || 'test_client',
    'client_secret': __ENV.CLIENT_SECRET || 'test_secret',
    'scope': 'api'
  }).toString();
  
  // 构造请求头 - OAuth2标准格式
  const tokenHeaders = {
    'accept': 'application/json',
    'accept-language': 'zh-CN,zh;q=0.9',
    'content-type': 'application/x-www-form-urlencoded',
    'origin': config.origin,
    'referer': config.referer,
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  };
  
  const tokenParams = {
    headers: tokenHeaders,
    timeout: '30s',
  };
  
  const tokenResponse = http.post(tokenUrl, tokenPayload, tokenParams);

  // 检查token获取是否成功 - HTTP状态码200 + 包含access_token
  const isTokenSuccess = check(tokenResponse, {
    'HTTP状态码200': (r) => r.status === 200,
    '响应包含access_token': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.access_token !== undefined;
      } catch {
        return false;
      }
    },
    '响应包含token_type': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.token_type !== undefined;
      } catch {
        return false;
      }
    }
  });

  // 记录自定义指标 - 只有业务成功才计入成功
  tokenRequestRate.add(isTokenSuccess);
  if (isTokenSuccess) {
    tokenResponseDuration.add(tokenResponse.timings.duration);
  }
}

// 测试设置阶段
export function setup() {
  console.log('🎯 开始 connect/token 固定QPS压力测试...');
  console.log(`📡 测试目标: ${config.baseUrl}/connect/token`);
  console.log(`🔧 测试场景: 固定QPS测试 (${TARGET_QPS} QPS，持续5分钟)`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * 300} 个 (${TARGET_QPS} QPS × 300秒)`);
  console.log('🔑 测试内容: OAuth2 token获取');
  console.log('⏱️  预计测试时间: 5分钟');
  console.log('⚠️  请确保设置了CLIENT_ID和CLIENT_SECRET环境变量');
  return { baseUrl: config.baseUrl };
}

// 测试清理阶段
export function teardown(data) {
  console.log('✅ connect/token 固定QPS压力测试完成');
  console.log('🔍 关键指标：token获取成功率、响应时间、QPS稳定性');
  console.log('📈 请分析QPS是否稳定、响应时间分布和系统资源使用情况');
}