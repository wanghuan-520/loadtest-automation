import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 使用说明：
// 默认目标QPS: 50 QPS（每秒50个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=100 guest-create-session-qps-test.js
// 示例: k6 run -e TARGET_QPS=80 guest-create-session-qps-test.js

// 自定义指标
const apiCallSuccessRate = new Rate('api_call_success_rate');
const apiCallDuration = new Trend('api_call_duration');

// 从配置文件加载环境配置
const config = JSON.parse(open('../../../config/env.dev.json'));

// 获取目标QPS参数，默认值为50
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 50;

// 生成随机IP地址的函数
function generateRandomIP() {
  const octet1 = Math.floor(Math.random() * 256);
  const octet2 = Math.floor(Math.random() * 256);
  const octet3 = Math.floor(Math.random() * 256);
  const octet4 = Math.floor(Math.random() * 256);
  return `${octet1}.${octet2}.${octet3}.${octet4}`;
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
      preAllocatedVUs: Math.max(TARGET_QPS, 10),  // 预分配VU数量（至少为QPS数量）
      maxVUs: TARGET_QPS * 3,        // 最大VU数量（QPS的3倍以防不够用）
      tags: { test_type: 'fixed_qps' },
    },
  },
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'api_call_success_rate': ['rate>0.99'],
  //   'api_call_duration': ['p(95)<2000'],
  // },
};

// 测试主函数
export default function () {
  // 构造请求头 - 匹配curl命令
  const headers = {
    'accept': '*/*',
    'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'origin': config.origin,
    'pragma': 'no-cache',
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

  // 生成随机IP地址
  const randomIP = generateRandomIP();

  // 调用 guest/create-session 接口 - 使用正确的请求体和随机IP
  const createSessionResponse = http.post(
    `${config.baseUrl}/godgpt/guest/create-session`,
    JSON.stringify({
      "guider": "",
      "ip": randomIP
    }),
    { headers }
  );

  // 简化响应验证 - 只检查HTTP状态码200
  const isSuccess = createSessionResponse.status === 200;
  
  // 功能验证 - 只检查状态码
  check(createSessionResponse, {
    'API-状态码200': (r) => r.status === 200,
  });

  // 记录自定义指标 - 只有200状态码才计入成功
  apiCallSuccessRate.add(isSuccess);
  if (createSessionResponse.status === 200) {
    apiCallDuration.add(createSessionResponse.timings.duration);
  }
}

// 测试设置阶段
export function setup() {
  console.log('🎯 开始 guest/create-session 固定QPS压力测试...');
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/guest/create-session`);
  console.log(`🔧 测试场景: 固定QPS测试 (${TARGET_QPS} QPS，持续5分钟)`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * 300} 个 (${TARGET_QPS} QPS × 300秒)`);
  console.log('⏱️  预计测试时间: 5分钟');
  return { baseUrl: config.baseUrl };
}

// 测试清理阶段
export function teardown(data) {
  console.log('✅ guest/create-session 固定QPS压力测试完成');
  console.log('🔍 关键指标：API调用成功率、API调用时间、QPS稳定性');
  console.log('📈 请分析QPS是否稳定、响应时间分布和系统资源使用情况');
} 