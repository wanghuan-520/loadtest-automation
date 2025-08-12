import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 使用说明：
// 默认目标QPS: 50 QPS（每秒50个请求，持续10分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=100 guest-create-session-qps-test.js
// 静默模式（无debug信息）: k6 run -e TARGET_QPS=70 -e QUIET=true guest-create-session-qps-test.js
// 示例: k6 run -e TARGET_QPS=80 guest-create-session-qps-test.js

// 自定义指标
const apiCallSuccessRate = new Rate('api_call_success_rate');
const apiCallDuration = new Trend('api_call_duration');
const vuUtilization = new Trend('vu_utilization');  // VU使用率监控
const requestQueue = new Trend('request_queue');    // 请求队列监控

// 从配置文件加载环境配置
const config = JSON.parse(open('../../../config/env.dev.json'));

// 获取目标QPS参数，默认值为50
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 1;
// 静默模式开关，用于控制debug信息输出
const QUIET_MODE = __ENV.QUIET === 'true';

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
    // 固定QPS测试 - 恒定请求速率（超稳定性优化版）
    fixed_qps: {
      executor: 'constant-arrival-rate',
      rate: TARGET_QPS,              // 每秒请求数（QPS）
      timeUnit: '1s',                // 时间单位：1秒
      duration: '10m',               // 测试持续时间：10分钟
      // 🎯 QPS超稳定配置：精确VU分配，避免调度器过载
      preAllocatedVUs: Math.min(Math.max(TARGET_QPS * 2, 10), 200),  // 2倍预分配，上限200
      maxVUs: Math.min(Math.max(TARGET_QPS * 4, 20), 400),           // 4倍最大值，上限400
      tags: { test_type: 'fixed_qps_ultra_stable' },
    },
  },
  // 🔧 QPS平滑优化：连接池与请求调度精细调节
  batch: 1,                          // 单请求模式，确保精确QPS控制
  batchPerHost: 1,                   // 每主机单批次，避免请求堆积
  noConnectionReuse: false,          // 启用连接复用，减少握手开销
  noVUConnectionReuse: false,        // 启用VU内连接复用，提升稳定性
  userAgent: 'k6-loadtest/1.0',      // 统一User-Agent
  // 🎯 请求调度精细优化
  discardResponseBodies: false,      // 保持响应体，确保完整测试
  httpDebug: 'none',                 // 关闭HTTP调试，减少性能开销
  // 🔇 静默模式优化
  summaryTrendStats: ['avg', 'p(95)'], // 精简统计信息
  quiet: QUIET_MODE,                 // 根据环境变量控制静默模式
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
      timeout: '30s',                // 降低超时时间，避免VU长时间占用
      responseType: 'text',          // 明确响应类型，提升解析效率
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
  const preAllocatedVUs = Math.min(Math.max(TARGET_QPS * 2, 10), 200);
  const maxVUs = Math.min(Math.max(TARGET_QPS * 4, 20), 400);
  
  // 🔇 根据静默模式控制输出
  if (!QUIET_MODE) {
    console.log('🎯 开始 guest/create-session 固定QPS压力测试...');
    console.log(`🕐 测试开始时间: ${startTime}`);
    console.log(`📡 测试目标: ${config.baseUrl}/godgpt/guest/create-session`);
    console.log(`🔧 测试场景: 超稳定QPS测试 (${TARGET_QPS} QPS，持续10分钟)`);
    console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
    console.log(`🔄 预估总请求数: ${TARGET_QPS * 600} 个 (${TARGET_QPS} QPS × 600秒)`);
    console.log(`👥 VU配置优化: 预分配${preAllocatedVUs}个，最大${maxVUs}个 (精确资源分配)`);
    console.log('🎯 超稳定策略: 2-4倍VU配置，避免调度器过载，消除锯齿状波动');
    console.log('⏱️  预计测试时间: 10分钟');
    console.log('🔍 优化重点: VU资源精确控制，连接复用，调度平滑化');
    console.log('💡 提示: 使用 -e QUIET=true 启用静默模式，减少输出信息');
  } else {
    console.log(`🎯 静默模式启动: ${TARGET_QPS} QPS 超稳定测试 (10分钟)`);
  }
  
  return { baseUrl: config.baseUrl };
}

// 测试清理阶段
export function teardown(data) {
  const endTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  
  // 🔇 根据静默模式控制输出
  if (!QUIET_MODE) {
    console.log('✅ guest/create-session 固定QPS压力测试完成');
    console.log(`🕛 测试结束时间: ${endTime}`);
    console.log('🔍 关键指标：API调用成功率、API调用时间、QPS稳定性');
    console.log('📈 请分析QPS是否稳定、响应时间分布和系统资源使用情况');
  } else {
    console.log(`✅ 静默模式测试完成 - ${endTime}`);
  }
} 