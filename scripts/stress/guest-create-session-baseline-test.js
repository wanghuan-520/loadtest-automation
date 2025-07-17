import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 自定义指标
const apiCallSuccessRate = new Rate('api_call_success_rate');
const apiCallDuration = new Trend('api_call_duration');

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
    http_req_duration: ['avg<200'], // 平均响应时间应小于200毫秒
    api_call_success_rate: ['rate>0.99'], // API调用成功率应大于99%
  },
};

// 测试设置阶段
export function setup() {
  console.log('🎯 开始 guest/create-session 基准测试...');
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/guest/create-session`);
  console.log('🔧 测试类型: 基线性能测试 (1用户, 1分钟)');
  console.log('📊 使用K6原生监控，测试完成后查看汇总报告');
  console.log('🎯 性能要求: 平均响应时间<200ms, 错误率<1%');
  return { baseUrl: config.baseUrl };
}

// 主测试函数
export default function(data) {
  const randomIP = generateRandomIP();
  const url = `${data.baseUrl}/godgpt/guest/create-session`;
  
  const payload = JSON.stringify({
    guider: '',
    ip: randomIP
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: '30s',
  };
  
  const response = http.post(url, payload, params);
  
  // 检查响应是否成功 - 仅检查HTTP状态码200
  const isSuccess = check(response, {
    'status is 200': (r) => r.status === 200,
  });
  
  // 记录K6指标
  apiCallSuccessRate.add(isSuccess);
  apiCallDuration.add(response.timings.duration);
}

// 测试清理阶段
export function teardown(data) {
  console.log('✅ guest/create-session 基准测试完成');
  console.log('📊 性能基线数据已记录到K6报告中');
  console.log('🔍 关键指标: http_req_duration, api_call_success_rate, api_call_duration');
  console.log('🎯 性能基线: 平均响应时间<200ms, 错误率<1%');
} 