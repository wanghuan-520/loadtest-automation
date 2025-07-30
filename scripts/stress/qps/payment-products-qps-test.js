import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 35 QPS（每秒35个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=50 payment-products-qps-test.js
// 示例: k6 run -e TARGET_QPS=45 payment-products-qps-test.js

// 自定义指标
const paymentProductsSuccessRate = new Rate('payment_products_success_rate');
const paymentProductsDuration = new Trend('payment_products_duration');

// 从配置文件加载环境配置和测试数据
const config = JSON.parse(open('../../../config/env.dev.json'));
const testData = JSON.parse(open('../../../config/test-data.json'));

// 尝试从tokens.json文件加载token配置
let tokenConfig = {};
try {
  tokenConfig = JSON.parse(open('../../../config/tokens.json'));
} catch (error) {
  console.log('⚠️  未找到tokens.json配置文件，将使用环境变量或默认token');
}

// 获取目标QPS参数，默认值为35
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 35;

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
      tags: { test_type: 'fixed_qps_payment_products' },
    },
  },
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
  
  // 构造获取产品列表请求
  const paymentProductsUrl = `${data.baseUrl}/godgpt/payment/products`;
  
  // 构造请求头 - 匹配curl命令，包含authorization token
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
    timeout: '30s',
  };
  
  const paymentProductsResponse = http.get(paymentProductsUrl, paymentProductsParams);

  // 检查产品列表获取是否成功 - HTTP状态码200 + 业务code为20000
  const isPaymentProductsSuccess = check(paymentProductsResponse, {
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
  
  // 记录产品列表获取指标 - 只有HTTP200且业务code为20000才算成功
  paymentProductsSuccessRate.add(isPaymentProductsSuccess);

  // 记录响应时间
  if (paymentProductsResponse.status === 200) {
    paymentProductsDuration.add(paymentProductsResponse.timings.duration);
  }
}

// 测试设置阶段
export function setup() {
  return setupTest(
    config, 
    tokenConfig, 
    'payment/products', 
    TARGET_QPS, 
    '/godgpt/payment/products'
  );
}

// 测试清理阶段
export function teardown(data) {
  teardownTest('payment/products', '产品列表获取成功率、响应时间、QPS稳定性');
} 