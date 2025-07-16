import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 自定义指标
const apiCallSuccessRate = new Rate('api_call_success_rate');
const apiCallDuration = new Trend('api_call_duration');

// 从配置文件加载环境配置
const config = JSON.parse(open('../../config/env.dev.json'));

// 生成随机IP地址的函数
function generateRandomIP() {
  const octet1 = Math.floor(Math.random() * 256);
  const octet2 = Math.floor(Math.random() * 256);
  const octet3 = Math.floor(Math.random() * 256);
  const octet4 = Math.floor(Math.random() * 256);
  return `${octet1}.${octet2}.${octet3}.${octet4}`;
}

// 压力测试场景配置 - 根据需求文档调整
export const options = {
  scenarios: {
    // 阶梯式递增测试 - 按需求文档配置
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },   // 0→50用户（30s爬坡）
        { duration: '5m', target: 50 },    // 持续5分钟
        { duration: '30s', target: 100 },  // 50→100用户（30s爬坡）
        { duration: '5m', target: 100 },   // 持续5分钟
        { duration: '30s', target: 150 },  // 100→150用户（30s爬坡）
        { duration: '5m', target: 150 },   // 持续5分钟
        { duration: '30s', target: 200 },  // 150→200用户（30s爬坡）
        { duration: '5m', target: 200 },   // 持续5分钟
        { duration: '30s', target: 0 },    // 逐步降至0
      ],
      tags: { test_type: 'ramp_up' },
    },
    
    // 瞬时压力测试 - 100用户 (在阶梯测试完成后开始)
    spike_100: {
      executor: 'constant-vus',
      vus: 100,
      duration: '5m',
      startTime: '23m',  // 阶梯测试约23分钟，之后开始
      tags: { test_type: 'spike_100' },
    },
    
    // 瞬时压力测试 - 200用户 (在100用户测试完成后开始)
    spike_200: {
      executor: 'constant-vus',
      vus: 200,
      duration: '5m',
      startTime: '28m',  // 在spike_100完成后开始
      tags: { test_type: 'spike_200' },
    },
    
    // 瞬时压力测试 - 300用户 (在200用户测试完成后开始)
    spike_300: {
      executor: 'constant-vus',
      vus: 300,
      duration: '5m',
      startTime: '33m',  // 在spike_200完成后开始
      tags: { test_type: 'spike_300' },
    },
  },
  
  // 性能阈值 - 根据需求文档严格设置（平均<200ms，错误率<0.1%）
  thresholds: {
    // 严格按照需求文档设置：平均响应时间<200ms，错误率<0.1%
    http_req_duration: ['avg<200'],                       // 平均响应时间<200ms
    http_req_failed: ['rate<0.001'],                      // 错误率<0.1%
    api_call_success_rate: ['rate>0.999'],                // API调用成功率>99.9%
    api_call_duration: ['avg<200'],                       // API调用时间<200ms
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

  // 简化响应验证
  let isSuccess = false;
  
  if (createSessionResponse.status === 200) {
    try {
      const body = JSON.parse(createSessionResponse.body);
      isSuccess = body.code === "20000" && 
                  body.data && 
                  body.data.hasOwnProperty('remainingChats');
    } catch (e) {
      isSuccess = false;
    }
  }

  // 简化功能验证
  check(createSessionResponse, {
    'API-功能正常': () => isSuccess,
  });

  // 记录自定义指标 - 只有200状态码才计入成功
  apiCallSuccessRate.add(isSuccess);
  if (createSessionResponse.status === 200) {
    apiCallDuration.add(createSessionResponse.timings.duration);
  }
}

// 测试设置阶段
export function setup() {
  console.log('🚀 开始 guest/create-session 接口压力测试...');
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/guest/create-session`);
  console.log('🔧 测试场景: 阶梯式递增(0→200用户) + 瞬时压力(100/200/300用户)');
  console.log('🎯 性能要求: 平均响应时间<200ms, 错误率<0.1%');
  return { baseUrl: config.baseUrl };
}

// 测试清理阶段
export function teardown(data) {
  console.log('✅ guest/create-session 接口压力测试完成');
  console.log('🔍 关键指标：API调用成功率、API调用时间');
  console.log('📈 请分析各场景下的TPS、响应时间分布和系统资源使用情况');
} 