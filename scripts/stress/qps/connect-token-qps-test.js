import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 使用说明：
// 默认目标QPS: 40 QPS（每秒40个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=60 connect-token-qps-test.js
// 示例: k6 run -e TARGET_QPS=50 connect-token-qps-test.js
// 注意: 使用固定的Google ID Token进行认证测试，无需额外环境变量

// 自定义指标
const tokenRequestRate = new Rate('token_request_success_rate');
const tokenResponseDuration = new Trend('token_response_duration');

// 固定使用的Google ID Token (从OAuth 2.0 Playground获取的最新token)
const FIXED_ID_TOKEN = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImRkNTMwMTIwNGZjMWQ2YTBkNjhjNzgzYTM1Y2M5YzEwYjI1ZTFmNGEiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiIxMzA0MTIxNTExNjctZTIybnB2MmZ0OHU2ZWhhNWpna25uMTVjcXIwbTc0dmcuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiIxMzA0MTIxNTExNjctZTIybnB2MmZ0OHU2ZWhhNWpna25uMTVjcXIwbTc0dmcuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJzdWIiOiIxMTI5NjIyODM0OTM1ODA1MTU1MjEiLCJlbWFpbCI6Imh1YW4ud2FuZzUyMDUyMEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwibm9uY2UiOiI4OGE4Mzg5NzE1YzBhYjgxZDZmNjgyMWNkOWQwMjgzNDZiYTYxODc1MzA3NThiYWQ2YmM1NDJhZjZiZjM4MGEzIiwibmJmIjoxNzU0MzU1NjM0LCJuYW1lIjoi546L54SVIiwicGljdHVyZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0k5a0ZiZ2kwR0ViOVVINWFYY3pocG1KdHNIdVF5VklNRklKQlh0UGQ0Y0gyTl9iQT1zOTYtYyIsImdpdmVuX25hbWUiOiLnhJUiLCJmYW1pbHlfbmFtZSI6IueOiyIsImlhdCI6MTc1NDM1NTkzNCwiZXhwIjoxNzU0MzU5NTM0LCJqdGkiOiIyMDNiMTdlNzI3MTBiNDI0OTI4YWMwYmM4ZjVlMTU2ZDU4ZTA4OTJmIn0.tx-k5oO7adQVM-MiN2lmzPwpqxua_YEny0ELUhRyhXJkuIw8SZrjP0fKsjgEvbuImok0COh-k9Z4hfXdlVLQk_j0BEjnDvczf506j_ONp8mVzP5w1uwGyd3h4wxjr5Ajav0jOFaWwWgLfp02orEKwuyHdYab6LytOy3CzeI0c9mwKsMdoX6Nhe8MEMzGspOUQI405j6fM9Jxx5aIhoJCUf7CIpKAmGBx6UP1ZFvhoZlMuQkrYqWHwtq22WEq_zRQjff4KKLlFi7c4N0MSNhQiztlb21xAwapIrFo8xepg_RytFPxz7tSbZSx1iFL8RD1Ks1w25rIk_lxe9MtXJscRA';

// 环境配置 - 基于curl命令更新
const config = {
  baseUrl: 'https://auth-station-dev-staging.aevatar.ai',
  origin: 'https://godgpt-ui-dev.aelf.dev',
  referer: 'https://godgpt-ui-dev.aelf.dev/'
};

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
  
  // 构造请求体 - Google authentication flow (基于curl命令)
  // k6不支持URLSearchParams，手动构建form-urlencoded字符串
  const tokenPayload = [
    'grant_type=google',
    'client_id=AevatarAuthServer',
    'apple_app_id=com.gpt.god',
    'scope=Aevatar%20offline_access',
    'source=web',
    `id_token=${encodeURIComponent(FIXED_ID_TOKEN)}`
  ].join('&');
  
  // 构造请求头 - 基于curl命令优化
  const tokenHeaders = {
    'accept': 'application/json',
    'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
    'content-type': 'application/x-www-form-urlencoded',
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
  const startTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log('🎯 开始 connect/token 固定QPS压力测试...');
  console.log(`🕐 测试开始时间: ${startTime}`);
  console.log(`📡 测试目标: ${config.baseUrl}/connect/token`);
  console.log(`🔧 测试场景: 固定QPS测试 (${TARGET_QPS} QPS，持续5分钟)`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * 300} 个 (${TARGET_QPS} QPS × 300秒)`);
  console.log('🔑 测试内容: Google ID Token认证');
  console.log('⏱️  预计测试时间: 5分钟');
  console.log('🌐 认证方式: 使用固定的Google ID Token进行认证测试');
  
  return { baseUrl: config.baseUrl };
}

// 测试清理阶段
export function teardown(data) {
  const endTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log('✅ connect/token 固定QPS压力测试完成');
  console.log(`🕛 测试结束时间: ${endTime}`);
  console.log('🔍 关键指标：Google认证成功率、响应时间、QPS稳定性');
  console.log('📈 请分析QPS是否稳定、响应时间分布和系统资源使用情况');
}