import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 自定义指标
const apiCallSuccessRate = new Rate('api_call_success_rate');
const apiCallDuration = new Trend('api_call_duration');

// 从配置文件加载环境配置
const config = JSON.parse(open('../../config/env.dev.json'));

// 从环境变量获取用户数量，默认100
const VUS_COUNT = parseInt(__ENV.VUS_COUNT || '100');
const TEST_DURATION = __ENV.TEST_DURATION || '1m';

// 生成随机IP地址的函数
function generateRandomIP() {
  const octet1 = Math.floor(Math.random() * 256);
  const octet2 = Math.floor(Math.random() * 256);
  const octet3 = Math.floor(Math.random() * 256);
  const octet4 = Math.floor(Math.random() * 256);
  return `${octet1}.${octet2}.${octet3}.${octet4}`;
}

// 参数化瞬时压力测试场景配置
export const options = {
  scenarios: {
    // 参数化瞬时压力测试 - 支持自定义用户数量
    spike_test: {
      executor: 'constant-vus',
      vus: VUS_COUNT,
      duration: TEST_DURATION,
      tags: { 
        test_type: 'spike_test',
        vus_count: VUS_COUNT.toString()
      },
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
  console.log('🚀 开始 guest/create-session 参数化瞬时压力测试...');
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/guest/create-session`);
  console.log(`🔧 测试场景: 瞬时压力 - ${VUS_COUNT}用户并发冲击`);
  console.log(`⏱️  测试时长: ${TEST_DURATION}`);

  console.log('💡 使用说明: VUS_COUNT=用户数 TEST_DURATION=时长 (如: VUS_COUNT=200 TEST_DURATION=3m)');
  return { baseUrl: config.baseUrl, vusCount: VUS_COUNT };
}

// 测试清理阶段
export function teardown(data) {
  console.log(`✅ guest/create-session ${data.vusCount}用户瞬时压力测试完成`);
  console.log('🔍 关键指标：API调用成功率、API调用时间');
  console.log(`📈 请分析 ${data.vusCount}用户并发下的系统表现和恢复能力`);
  console.log('🔄 建议顺序测试: 100→200→300用户，观察性能变化趋势');
} 