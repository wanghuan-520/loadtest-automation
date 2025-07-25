import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 使用说明：
// 默认目标并发数: 100用户（标准递增：1分钟爬坡→5分钟稳定→30秒归零）
// 自定义目标并发数: k6 run -e TARGET_VUS=200 guest-create-session-ramp-test.js
// 示例: k6 run -e TARGET_VUS=150 guest-create-session-ramp-test.js

// 自定义指标
const apiCallSuccessRate = new Rate('api_call_success_rate');
const apiCallDuration = new Trend('api_call_duration');

// 从配置文件加载环境配置
const config = JSON.parse(open('../../config/env.dev.json'));

// 获取目标并发数参数，默认值为100
const TARGET_VUS = __ENV.TARGET_VUS ? parseInt(__ENV.TARGET_VUS) : 100;

// 标准化阶梯式递增stages配置
function generateStandardRampStages(targetVus) {
  return [
    { duration: '1m', target: targetVus },   // 1分钟爬坡到目标用户数
    { duration: '5m', target: targetVus },   // 持续5分钟稳定负载
    { duration: '30s', target: 0 },          // 30秒降至0
  ];
}

// 生成随机IP地址的函数
function generateRandomIP() {
  const octet1 = Math.floor(Math.random() * 256);
  const octet2 = Math.floor(Math.random() * 256);
  const octet3 = Math.floor(Math.random() * 256);
  const octet4 = Math.floor(Math.random() * 256);
  return `${octet1}.${octet2}.${octet3}.${octet4}`;
}

// 阶梯式压力测试场景配置
export const options = {
  scenarios: {
    // 阶梯式递增测试 - 标准化配置
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: generateStandardRampStages(TARGET_VUS),  // 标准化递增配置
      tags: { test_type: 'ramp_up' },
    },
  },
  

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
  console.log('🚀 开始 guest/create-session 阶梯式压力测试...');
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/guest/create-session`);
  console.log(`🔧 测试场景: 标准递增(0→${TARGET_VUS}用户，1分钟爬坡→5分钟稳定)`);
  console.log(`🎯 目标并发数: ${TARGET_VUS} (可通过 TARGET_VUS 环境变量配置)`);
  console.log('⏱️  预计测试时间: 约6.5分钟');
  return { baseUrl: config.baseUrl };
}

// 测试清理阶段
export function teardown(data) {
  console.log('✅ guest/create-session 阶梯式压力测试完成');
  console.log('🔍 关键指标：API调用成功率、API调用时间');
  console.log('📈 请分析各阶段的TPS、响应时间分布和系统资源使用情况');
} 