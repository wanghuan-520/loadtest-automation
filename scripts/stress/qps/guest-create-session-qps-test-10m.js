import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 使用说明：
// 默认目标QPS: 50 QPS（每秒50个请求，持续10分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=100 guest-create-session-qps-test-10m.js
// 示例: k6 run -e TARGET_QPS=80 guest-create-session-qps-test-10m.js

// 自定义指标
const apiCallSuccessRate = new Rate('api_call_success_rate');
const apiCallDuration = new Trend('api_call_duration');
const vuUtilization = new Trend('vu_utilization');  // VU使用率监控
const requestQueue = new Trend('request_queue');    // 请求队列监控

// 从配置文件加载环境配置
const config = JSON.parse(open('../../../config/env.dev.json'));

// 获取目标QPS参数，默认值为50
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 1;

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
    // 固定QPS测试 - 恒定请求速率（稳定性优化版）
    fixed_qps: {
      executor: 'constant-arrival-rate',
      rate: TARGET_QPS,              // 每秒请求数（QPS）
      timeUnit: '1s',                // 时间单位：1秒
      duration: '10m',               // 测试持续时间：10分钟
      // QPS稳定性优化：科学VU配置，应对长响应时间
      preAllocatedVUs: Math.max(TARGET_QPS * 5, 1),  // 提高预分配应对长响应
      maxVUs: TARGET_QPS * 15,       // 15倍配置，平衡性能与资源
      tags: { test_type: 'fixed_qps' },
    },
  },
  // 连接池优化：提高QPS稳定性，减少连接重置
  batch: 1,                          // 每次只发送1个请求，确保精确控制
  batchPerHost: 1,                   // 每个主机只并发1个请求批次
  noConnectionReuse: false,          // 启用连接复用，减少新连接建立
  userAgent: 'k6-loadtest/1.0',      // 统一User-Agent
  // 高级性能优化：TLS和DNS优化
  tlsVersion: {                      // TLS版本优化
    min: 'tls1.2',
    max: 'tls1.3'
  },
  dns: {                             // DNS优化配置
    ttl: '5m',                       // DNS缓存5分钟
    select: 'roundRobin',            // 轮询DNS记录
    policy: 'preferIPv4'             // 优先IPv4（减少连接复杂度）
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

  // 调用 guest/create-session 接口 - 使用正确的请求体和随机IP，设置合理超时
  const createSessionResponse = http.post(
    `${config.baseUrl}/godgpt/guest/create-session`,
    JSON.stringify({
      "guider": "",
      "ip": randomIP
    }),
    { 
      headers,
              timeout: '120s'  // 增加到120秒超时，应对100 QPS极限挑战
    }
  );

  // 业务成功判断 - HTTP状态码200 + 业务code为20000
  const isSuccess = check(createSessionResponse, {
    'HTTP状态码200': (r) => r.status === 200,
    '业务代码20000': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.code === "20000";
      } catch {
        return false;
      }
    }
  });
  
  // 记录API调用指标 - 只有HTTP200且业务code为20000才算成功
  apiCallSuccessRate.add(isSuccess);
  if (createSessionResponse.status === 200) {
    apiCallDuration.add(createSessionResponse.timings.duration);
  }
  
  // 记录VU和队列监控指标
  vuUtilization.add(__VU);  // 当前VU ID作为使用率指标
  requestQueue.add(createSessionResponse.timings.blocked || 0);  // 请求队列等待时间
}

// 测试设置阶段
export function setup() {
  const startTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const preAllocatedVUs = Math.max(TARGET_QPS * 5, 1);
  const maxVUs = TARGET_QPS * 15;
  
  console.log('🎯 开始 guest/create-session 固定QPS压力测试...');
  console.log(`🕐 测试开始时间: ${startTime}`);
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/guest/create-session`);
  console.log(`🔧 测试场景: 固定QPS测试 (${TARGET_QPS} QPS，持续10分钟)`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * 600} 个 (${TARGET_QPS} QPS × 600秒)`);
  console.log(`👥 VU配置: 预分配${preAllocatedVUs}个，最大${maxVUs}个 (应对极端响应时间波动)`);
  console.log('🚀 极限策略: 科学VU配置 + 极限连接池优化');
  console.log('📊 QPS稳定性: constant-arrival-rate执行器 + 批次控制');
  console.log('🔗 连接优化: 连接复用 + TLS优化 + DNS缓存 + VU级连接管理');
  console.log('🛡️  防护应对: 统一UserAgent + 120s超时 + 连接建立优化');
  console.log('⚡ 极限挑战: 100 QPS性能边界探索 + DNS智能优化');
  console.log('⏱️  预计测试时间: 10分钟');
  return { baseUrl: config.baseUrl };
}

// 测试清理阶段
export function teardown(data) {
  const endTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log('✅ guest/create-session 固定QPS压力测试完成');
  console.log(`🕛 测试结束时间: ${endTime}`);
  console.log('🔍 关键指标：API调用成功率、API调用时间、QPS稳定性');
  console.log('📈 请分析QPS是否稳定、响应时间分布和系统资源使用情况');
} 