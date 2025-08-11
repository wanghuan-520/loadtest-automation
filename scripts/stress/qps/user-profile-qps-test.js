import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 25 QPS（每秒25个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=40 user-profile-qps-test.js
// 示例: k6 run -e TARGET_QPS=35 user-profile-qps-test.js

// 自定义指标
const userProfileSuccessRate = new Rate('user_profile_success_rate');
const userProfileDuration = new Trend('user_profile_duration');

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

// 获取目标QPS参数，默认值为25
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 25;

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
      tags: { test_type: 'fixed_qps_user_profile' },
    },
  },
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'user_profile_success_rate': ['rate>0.99'],
  //   'user_profile_duration': ['p(95)<2000'],
  // },
};

// 测试主函数
export default function (data) {
  const startTime = Date.now();
  
  // 构造获取用户档案信息请求
  const userProfileUrl = `${data.baseUrl}/profile/user-info`;
  
  // 构造请求头 - 匹配curl命令，包含authorization token
  const userProfileHeaders = {
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
  
  const userProfileParams = {
    headers: userProfileHeaders,
    timeout: '90s',
  };
  
  const userProfileResponse = http.get(userProfileUrl, userProfileParams);

  // 检查用户档案信息获取是否成功 - HTTP状态码200 + 业务code为20000
  const isUserProfileSuccess = check(userProfileResponse, {
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
  
  // 记录用户档案信息获取指标 - 只有HTTP200且业务code为20000才算成功
  userProfileSuccessRate.add(isUserProfileSuccess);

  // 记录响应时间
  if (userProfileResponse.status === 200) {
    userProfileDuration.add(userProfileResponse.timings.duration);
  }
}

// 测试设置阶段
export function setup() {
  return setupTest(
    config, 
    tokenConfig, 
    'user/profile', 
    TARGET_QPS, 
    '/profile/user-info'
  );
}

// 测试清理阶段
export function teardown(data) {
  teardownTest('user/profile', '用户档案信息获取成功率、响应时间、QPS稳定性');
} 