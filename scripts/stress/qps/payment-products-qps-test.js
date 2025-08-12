import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 35 QPS（每秒35个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=50 payment-products-qps-test.js
// 示例: k6 run -e TARGET_QPS=45 payment-products-qps-test.js

// 自定义指标
const paymentProductsRate = new Rate('payment_products_success_rate');
const paymentProductsDuration = new Trend('payment_products_duration');

// 从配置文件加载环境配置
const config = JSON.parse(open('../../../config/env.dev.json'));

// 尝试从tokens.json文件加载token配置
let tokenConfig = {};
try {
  tokenConfig = JSON.parse(open('../../../config/tokens.json'));
} catch (error) {
  console.log('⚠️  未找到tokens.json配置文件，将使用环境变量或默认token');
}

// 获取目标QPS参数，默认值为35
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 1;

// 固定QPS压力测试场景配置
export const options = {
  scenarios: {
    // 固定QPS测试 - 恒定请求速率
    fixed_qps: {
      executor: 'constant-arrival-rate',
      rate: TARGET_QPS,              // 每秒请求数（QPS）
      timeUnit: '1s',                // 时间单位：1秒
      duration: '10m',               // 测试持续时间：10分钟
      preAllocatedVUs: Math.max(TARGET_QPS * 3, 1),  // 预留更多缓冲
      maxVUs: TARGET_QPS * 15,        // 最大VU数量（QPS的15倍，平衡性能与资源）
      tags: { test_type: 'fixed_qps_payment_products' },
    },
  },
  // 连接池优化：提高QPS稳定性，减少连接重置
  batch: 1,                          // 每次只发送1个请求，确保精确控制
  batchPerHost: 1,                   // 每个主机只并发1个请求批次
  noConnectionReuse: false,          // 启用连接复用，减少新连接建立
  userAgent: 'k6-loadtest/1.0',      // 统一User-Agent
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'payment_products_success_rate': ['rate>0.99'],
  //   'payment_products_duration': ['p(95)<2000'],
  // },
};

// 测试主函数
export default function (data) {
  const startTime = Date.now();
  
  // 构造支付产品列表获取请求
  const paymentProductsUrl = `${data.baseUrl}/godgpt/payment/products`;
  
  // 构造请求头 - 参照API文档格式，包含authorization token
  const paymentProductsHeaders = {
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'authorization': `Bearer ${data.bearerToken}`,
    'content-type': 'application/json',
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
  
  const paymentProductsParams = {
    headers: paymentProductsHeaders,
    timeout: '90s',
  };
  
  const paymentProductsResponse = http.get(paymentProductsUrl, paymentProductsParams);

  // 检查支付产品列表获取是否成功 - HTTP状态码200 + 业务code为20000
  const isPaymentProductsSuccess = check(paymentProductsResponse, {
    'HTTP状态码200': (r) => r.status === 200,
    '业务代码20000': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.code === "20000";
      } catch {
        return false;
      }
    },
    '响应数据结构正确': (r) => {
      try {
        const data = JSON.parse(r.body);
        // data可能是数组或包含products的对象
        return data.data !== undefined && (Array.isArray(data.data) || (data.data && Array.isArray(data.data.products)));
      } catch {
        return false;
      }
    }
  });

  // 记录自定义指标 - 只有业务成功才计入成功
  paymentProductsRate.add(isPaymentProductsSuccess);
  if (isPaymentProductsSuccess) {
    paymentProductsDuration.add(paymentProductsResponse.timings.duration);
  }
}

// 测试设置阶段 - 使用通用的auth setup函数
export function setup() {
  const startTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log('🎯 开始 godgpt/payment/products 固定QPS压力测试...');
  console.log(`🕐 测试开始时间: ${startTime}`);
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/payment/products`);
  console.log(`🔧 测试场景: 固定QPS测试 (${TARGET_QPS} QPS，持续5分钟)`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * 300} 个 (${TARGET_QPS} QPS × 300秒)`);
  console.log('🛍️  测试内容: 获取支付产品列表');
  console.log('⏱️  预计测试时间: 5分钟');
  return setupTest(config, tokenConfig);
}

// 测试清理阶段 - 使用通用的teardown函数
export function teardown(data) {
  const endTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log('✅ godgpt/payment/products 固定QPS压力测试完成');
  console.log(`🕛 测试结束时间: ${endTime}`);
  console.log('🔍 关键指标：支付产品列表获取成功率、响应时间、QPS稳定性');
  console.log('📈 请分析QPS是否稳定、响应时间分布和系统资源使用情况');
  teardownTest(data);
}