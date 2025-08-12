import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 1 QPS（每秒1个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=10 godgpt-account-put-qps-test.js
// 示例: k6 run -e TARGET_QPS=5 godgpt-account-put-qps-test.js

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

// 获取目标QPS参数，默认值为1
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 1;

// 生成随机UUID的函数 - 用于userId参数
function generateRandomUUID() {
  // 生成随机UUID格式：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 优化版随机全名生成函数 - 预生成常用数据
const FIRST_NAMES = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack'];
const LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas'];

function generateRandomFullName() {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * 10)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * 10)];
  const randomNum = Math.floor(Math.random() * 1000);
  
  return `${firstName}${lastName}${randomNum}`;
}

// 生成随机生日的函数
function generateRandomBirthDate() {
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  const year = 1990 + Math.floor(Math.random() * 30); // 1990-2019年之间
  return `${month}/${day}/${year}`;
}

// 固定QPS压力测试场景配置
export const options = {
  scenarios: {
    // 固定QPS测试 - 恒定请求速率
    fixed_qps: {
      executor: 'constant-arrival-rate',
      rate: TARGET_QPS,              // 每秒请求数（QPS）
      timeUnit: '1s',                // 时间单位：1秒
      duration: '10m',               // 测试持续时间：10分钟
      // 🎯 QPS超稳定配置：基于实际响应时间动态调整VU分配
      // 实际测试显示平均响应时间仅38ms，大幅降低VU需求
      preAllocatedVUs: Math.min(Math.max(TARGET_QPS * 2, 3), 50),   // 2倍预分配，38ms响应时间下足够
      maxVUs: Math.min(Math.max(TARGET_QPS * 4, 6), 100),          // 4倍最大值，应对偶发延迟波动
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
  // 生成随机数据
  const randomFullName = generateRandomFullName();
  const randomBirthDate = generateRandomBirthDate();
  const genders = ['Male', 'Female'];
  const randomGender = genders[Math.floor(Math.random() * genders.length)];
  
  // 生成随机userId
  const userId = generateRandomUUID();
  
  // 构造请求头 - 匹配curl命令，使用动态Bearer token
  const headers = {
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
    'GodgptLanguage': 'zh-TW',
  };
  
  // 请求体数据 - 使用随机fullName和userId
  const requestBody = {
    "gender": randomGender,
    "birthDate": randomBirthDate,
    "birthPlace": "China🇨🇳",
    "fullName": randomFullName,
    "userId": userId
  };

  // 调用 godgpt/account PUT接口
  const accountResponse = http.put(
    `${data.baseUrl}/godgpt/account`,
    JSON.stringify(requestBody),
    { 
      headers,
      timeout: '90s',
    }
  );

  // 业务成功判断 - HTTP状态码200 + 业务code为20000
  const isSuccess = check(accountResponse, {
    'HTTP状态码200': (r) => r.status === 200,
    '业务代码20000': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.code === "20000";
      } catch {
        return false;
      }
    },
  });
  
  // 记录API调用指标
  apiCallSuccessRate.add(isSuccess);
  if (accountResponse.status === 200) {
    apiCallDuration.add(accountResponse.timings.duration);
  }
}

// 测试设置阶段
export function setup() {
  return setupTest(
    config, 
    tokenConfig, 
    'godgpt/account PUT', 
    TARGET_QPS, 
    '/godgpt/account (PUT)'
  );
}

// 测试清理阶段
export function teardown(data) {
  teardownTest('godgpt/account PUT', 'API调用成功率、API调用时间、QPS稳定性、随机数据生成');
}