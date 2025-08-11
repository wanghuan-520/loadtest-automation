import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 50 QPS（每秒50个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=100 godgpt-account-show-toast-qps-test.js
// 示例: k6 run -e TARGET_QPS=80 godgpt-account-show-toast-qps-test.js

// 自定义指标
const apiCallSuccessRate = new Rate('api_call_success_rate');
const apiCallDuration = new Trend('api_call_duration');

// 从配置文件加载环境配置和测试数据
const config = JSON.parse(open('../../../config/env.dev.json'));
const testData = JSON.parse(open('../../../config/test-data.json'));

// 尝试从tokens.json文件加载token配置
let tokenConfig = {};
try {
  tokenConfig = JSON.parse(open('../../../config/tokens.json'));
} catch (error) {
  // 静默处理文件加载失败，使用环境变量或默认token
}

// 获取目标QPS参数，默认值为50
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 50;

// 生成随机UUID的函数
function generateRandomUUID() {
  // 生成随机UUID格式：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
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
      preAllocatedVUs: Math.max(TARGET_QPS * 3, 1),  // 预留更多缓冲
      maxVUs: TARGET_QPS * 15,        // 最大VU数量（QPS的15倍，平衡性能与资源）
      tags: { test_type: 'fixed_qps' },
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
  //   'api_call_success_rate': ['rate>0.99'],
  //   'api_call_duration': ['p(95)<2000'],
  // },
};

// 测试主函数
export default function (data) {
  // 生成随机ID
  const randomId = generateRandomUUID();
  
  // 构造请求头 - 匹配curl命令，使用动态Bearer token
  const headers = {
    'accept': '*/*',
    'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
    'authorization': `Bearer ${data.bearerToken}`,
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'godgptlanguage': 'zh-TW',
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

  // 请求体数据 - 包含随机生成的ID和UserId（使用相同的随机UUID）
  const requestBody = {
    "id": randomId,
    "UserId": randomId  // 使用相同的随机UUID作为用户ID
  };

  // 调用 godgpt/account/show-toast POST接口
  const showToastResponse = http.post(
    `${data.baseUrl}/godgpt/account/show-toast`,
    JSON.stringify(requestBody),
    { 
      headers,
      timeout: '90s',
    }
  );

  // 业务成功判断 - HTTP状态码200 + 业务code为20000
  const isSuccess = check(showToastResponse, {
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
  
  // 记录API调用指标
  apiCallSuccessRate.add(isSuccess);
  if (showToastResponse.status === 200) {
    apiCallDuration.add(showToastResponse.timings.duration);
  }
}

// 测试设置阶段
export function setup() {
  return setupTest(
    config, 
    tokenConfig, 
    'godgpt/account/show-toast POST', 
    TARGET_QPS, 
    '/godgpt/account/show-toast (POST)'
  );
}

// 测试清理阶段
export function teardown(data) {
  teardownTest('godgpt/account/show-toast POST', 'API调用成功率、API调用时间、QPS稳定性、随机ID生成');
}