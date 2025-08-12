import http from 'k6/http';
import { check, sleep } from 'k6';

// 🔍 超时问题诊断脚本
// 用于确定timeout是脚本问题还是服务器问题

const config = JSON.parse(open('../../../config/env.dev.json'));

// 测试不同QPS下的超时情况
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 5;

export const options = {
  scenarios: {
    // 低QPS测试，验证服务器基本响应能力
    timeout_debug: {
      executor: 'constant-arrival-rate',
      rate: TARGET_QPS,
      timeUnit: '1s',
      duration: '2m',  // 短时间测试
      preAllocatedVUs: Math.max(TARGET_QPS * 2, 5),
      maxVUs: Math.max(TARGET_QPS * 4, 10),
      tags: { test_type: 'timeout_debug' },
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)'],
};

function generateRandomIP() {
  const octet1 = Math.floor(Math.random() * 256);
  const octet2 = Math.floor(Math.random() * 256);
  const octet3 = Math.floor(Math.random() * 256);
  const octet4 = Math.floor(Math.random() * 256);
  return `${octet1}.${octet2}.${octet3}.${octet4}`;
}

export default function () {
  const startTime = Date.now();
  
  const headers = {
    'accept': '*/*',
    'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'origin': config.origin,
    'pragma': 'no-cache',
    'referer': config.referer,
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  };

  const randomIP = generateRandomIP();

  // 🔍 测试请求，记录详细时序信息
  const response = http.post(
    `${config.baseUrl}/godgpt/guest/create-session`,
    JSON.stringify({
      "guider": "",
      "ip": randomIP
    }),
    { 
      headers,
      timeout: '90s',  // 更长超时时间
      responseType: 'text',
    }
  );

  const endTime = Date.now();
  const totalDuration = endTime - startTime;

  // 详细检查
  const results = check(response, {
    '请求成功发送': (r) => r.status !== 0,
    'HTTP状态码正常': (r) => r.status === 200,
    '有响应体': (r) => r.body && r.body.length > 0,
    '响应时间<30秒': (r) => r.timings.duration < 30000,
    '响应时间<60秒': (r) => r.timings.duration < 60000,
    '业务逻辑正确': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.code === "20000";
      } catch {
        return false;
      }
    }
  });

  // 详细日志（低QPS下可以输出详细信息）
  if (TARGET_QPS <= 10) {
    console.log(`🔍 [VU${__VU}] 请求详情:`);
    console.log(`  状态码: ${response.status}`);
    console.log(`  响应时间: ${response.timings.duration.toFixed(2)}ms`);
    console.log(`  总耗时: ${totalDuration}ms`);
    console.log(`  连接时间: ${response.timings.connecting.toFixed(2)}ms`);
    console.log(`  等待时间: ${response.timings.waiting.toFixed(2)}ms`);
    console.log(`  接收时间: ${response.timings.receiving.toFixed(2)}ms`);
    
    if (response.status === 0) {
      console.log(`  ❌ 请求失败: 可能是超时或网络错误`);
    }
    
    if (response.timings.duration > 30000) {
      console.log(`  ⚠️  响应时间过长: ${response.timings.duration.toFixed(2)}ms`);
    }
  }
}

export function setup() {
  console.log('🔍 开始超时问题诊断测试...');
  console.log(`⚡ 测试QPS: ${TARGET_QPS} (建议从1-10开始测试)`);
  console.log(`🕐 测试时长: 2分钟`);
  console.log('📊 将输出详细的时序分析信息');
  console.log('');
  console.log('🎯 诊断目标:');
  console.log('  1. 确定服务器基本响应能力');
  console.log('  2. 分析请求各阶段耗时');
  console.log('  3. 识别超时发生的具体环节');
  console.log('');
  return { baseUrl: config.baseUrl };
}

export function teardown(data) {
  console.log('');
  console.log('✅ 超时问题诊断测试完成');
  console.log('📊 分析要点:');
  console.log('  - 如果低QPS也超时 → 服务器或网络问题');
  console.log('  - 如果只有高QPS超时 → 服务器处理能力瓶颈');
  console.log('  - 如果连接时间长 → 网络或DNS问题');
  console.log('  - 如果等待时间长 → 服务器处理慢');
}
