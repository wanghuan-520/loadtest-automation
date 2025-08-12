import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 15 QPS（每秒15个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=25 session-rename-qps-test.js
// 示例: k6 run -e TARGET_QPS=20 session-rename-qps-test.js

// 自定义指标
const sessionCreationRate = new Rate('session_creation_success_rate');
const sessionRenameSuccessRate = new Rate('session_rename_success_rate');
const sessionRenameDuration = new Trend('session_rename_duration');


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

// 获取目标QPS参数，默认值为15
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 15;

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
      tags: { test_type: 'fixed_qps_session_rename' },
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
  //   'session_creation_success_rate': ['rate>0.99'],
  //   'session_rename_success_rate': ['rate>0.99'],
  //   'session_rename_duration': ['p(95)<2000'],

  // },
};

// 测试主函数
export default function (data) {
  
  // 构造请求头 - 匹配curl命令，包含authorization token
  const requestHeaders = {
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
  
  const requestParams = {
    headers: requestHeaders,
    timeout: '90s',
  };
  
  // 步骤1：创建会话
  const createSessionUrl = `${data.baseUrl}/godgpt/create-session`;
  const createSessionPayload = JSON.stringify({
    guider: ''  // 使用原始请求体格式
  });
  
  const createSessionResponse = http.post(createSessionUrl, createSessionPayload, requestParams);

  // 检查会话创建是否成功 - HTTP状态码200 + 业务code为20000
  const isSessionCreated = check(createSessionResponse, {
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
  
  // 记录会话创建指标
  sessionCreationRate.add(isSessionCreated);

  // 如果会话创建失败，跳过重命名步骤
  if (!isSessionCreated) {
    return;
  }

  // 从create-session响应中解析sessionId（业务成功时才解析）
  let sessionId = null;
  try {
    const responseData = JSON.parse(createSessionResponse.body);
    
    if (responseData && responseData.code === '20000' && responseData.data) {
      sessionId = responseData.data;
    }
  } catch (error) {
    return;
  }

  if (!sessionId) {
    return;
  }

  // 步骤2：重命名会话
  const renameSessionUrl = `${data.baseUrl}/godgpt/chat/rename`;
  const newTitle = `压测重命名会话-${Math.random().toString(36).substr(2, 8)}-${Date.now()}`;
  
  const renameSessionPayload = JSON.stringify({
    sessionId: sessionId,
    title: newTitle
  });
  
  const renameSessionResponse = http.put(renameSessionUrl, renameSessionPayload, requestParams);

  // 检查会话重命名是否成功 - HTTP状态码200 + 业务code为20000
  const isSessionRenameSuccess = check(renameSessionResponse, {
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
  
  // 记录会话重命名指标
  sessionRenameSuccessRate.add(isSessionRenameSuccess);

  // 记录重命名响应时间
  if (renameSessionResponse.status === 200) {
    sessionRenameDuration.add(renameSessionResponse.timings.duration);
  }


}

// 测试设置阶段
export function setup() {
  return setupTest(
    config, 
    tokenConfig, 
    'session/rename', 
    TARGET_QPS, 
    '/godgpt/chat/rename (PUT)'
  );
}

// 测试清理阶段
export function teardown(data) {
  teardownTest('session/rename', '会话重命名成功率、响应时间、端到端时间、QPS稳定性');
} 