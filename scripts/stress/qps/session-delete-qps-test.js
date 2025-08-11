import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 15 QPS（每秒15个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=25 session-delete-qps-test.js
// 示例: k6 run -e TARGET_QPS=20 session-delete-qps-test.js

// 自定义指标
const sessionCreationRate = new Rate('session_creation_success_rate');
const sessionDeleteSuccessRate = new Rate('session_delete_success_rate');
const sessionDeleteDuration = new Trend('session_delete_duration');


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
      duration: '5m',                // 测试持续时间：5分钟
      preAllocatedVUs: Math.max(TARGET_QPS, 1),  // 预分配VU数量（至少为QPS数量）
      maxVUs: TARGET_QPS * 10,        // 最大VU数量（QPS的10倍）
      tags: { test_type: 'fixed_qps_session_delete' },
    },
  },
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'session_creation_success_rate': ['rate>0.99'],
  //   'session_delete_success_rate': ['rate>0.99'],
  //   'session_delete_duration': ['p(95)<2000'],

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
    timeout: '30s',
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

  // 如果会话创建失败，跳过删除步骤
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

  // 步骤2：删除会话
  const deleteSessionUrl = `${data.baseUrl}/godgpt/chat/${sessionId}`;
  const deleteSessionResponse = http.del(deleteSessionUrl, null, requestParams);

  // 检查会话删除是否成功 - HTTP状态码200 + 业务code为20000
  const isSessionDeleteSuccess = check(deleteSessionResponse, {
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
  
  // 记录会话删除指标
  sessionDeleteSuccessRate.add(isSessionDeleteSuccess);

  // 记录删除响应时间
  if (deleteSessionResponse.status === 200) {
    sessionDeleteDuration.add(deleteSessionResponse.timings.duration);
  }


}

// 测试设置阶段
export function setup() {
  return setupTest(
    config, 
    tokenConfig, 
    'session/delete', 
    TARGET_QPS, 
    '/godgpt/chat/{sessionId} (DELETE)'
  );
}

// 测试清理阶段
export function teardown(data) {
  teardownTest('session/delete', '会话删除成功率、响应时间、端到端时间、QPS稳定性');
} 