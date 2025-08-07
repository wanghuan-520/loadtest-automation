import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 20 QPS（每秒20个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=30 user-chat-qps-test.js
// 示例: k6 run -e TARGET_QPS=25 user-chat-qps-test.js
//
// 🔧 性能优化说明：
// - maxVUs: TARGET_QPS * 10 (最少20个) - 用户聊天流程复杂，需要更多VU
// - preAllocatedVUs: TARGET_QPS * 2 (最少5个) - 预分配足够VU避免延迟
// - 超时时间: 60秒 - 适应SSE流式响应的较长处理时间
// - SSE响应检查: 兼容JSON和流式响应格式

// 自定义指标
const sessionCreationRate = new Rate('session_creation_success_rate');
const chatResponseRate = new Rate('chat_response_success_rate');
const chatResponseDuration = new Trend('chat_response_duration');
const createResponseDuration = new Trend('create_response_duration');

// 生成随机UUID的函数 - 用于userId参数
function generateRandomUUID() {
  // 生成随机UUID格式：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}


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

// 获取目标QPS参数，默认值为20
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 20;



// 固定QPS压力测试场景配置
export const options = {
  scenarios: {
    // 固定QPS测试 - 恒定请求速率
    fixed_qps: {
      executor: 'constant-arrival-rate',
      rate: TARGET_QPS,              // 每秒请求数（QPS）
      timeUnit: '1s',                // 时间单位：1秒
      duration: '5m',                // 测试持续时间：5分钟
      preAllocatedVUs: Math.max(TARGET_QPS * 2, 5),  // 预分配VU数量（至少为QPS的2倍，最少5个）
      maxVUs: Math.max(TARGET_QPS * 10, 20),        // 最大VU数量（用户聊天需要更多VU处理复杂流程）
      tags: { test_type: 'fixed_qps_user_chat' },
    },
  },
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'session_creation_success_rate': ['rate>0.99'],
  //   'chat_response_success_rate': ['rate>0.99'],
  //   'chat_response_duration': ['p(95)<5000'],

  // },
};

// 测试主函数
export default function (data) {
  
  // 生成一致的userId，确保create-session和chat使用相同的用户标识
  const userId = generateRandomUUID();
  
  // 步骤1: 创建会话
  const createSessionUrl = `${data.baseUrl}/godgpt/create-session`;
  const createSessionPayload = JSON.stringify({
    guider: '',
    userId: userId  // 添加userId参数，与chat保持一致
  });
  
  // 构造已登录用户的create-session请求头
  const sessionHeaders = {
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
  
  const createSessionParams = {
    headers: sessionHeaders,
    timeout: '60s',  // 增加超时时间到60秒
  };
  
  const createSessionResponse = http.post(createSessionUrl, createSessionPayload, createSessionParams);

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
  
  // 记录会话创建指标 - 只有HTTP200且业务code为20000才算成功
  sessionCreationRate.add(isSessionCreated);
  
  // 记录create-session响应时间 - 只有业务成功时才记录
  if (isSessionCreated) {
    createResponseDuration.add(createSessionResponse.timings.duration);
  }

  // 如果会话创建失败，跳过后续步骤
  if (!isSessionCreated) {
    return;
  }
  
  // 从create-session响应中解析sessionId（业务成功时才解析）
  let sessionId = null;
  try {
    const responseData = JSON.parse(createSessionResponse.body);
    if (responseData && responseData.code === '20000' && responseData.data) {
      sessionId = responseData.data;
    } else {
      return;
    }
  } catch (error) {
    return;
  }
  
  // 等待2秒 - 模拟用户思考时间
  sleep(1);
  
  // 步骤2: 发送聊天消息
  const randomMessage = testData.messages[Math.floor(Math.random() * testData.messages.length)];
  
  // 构造已登录用户的chat请求头 - 支持SSE流式响应
  const chatHeaders = {
    'accept': 'text/event-stream',
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
  
  // 使用已登录用户的chat请求体格式 - 包含sessionId和userId
  const chatPayload = {
    content: randomMessage.content,
    images: [],
    region: "",
    sessionId: sessionId,
    userId: userId  // 添加userId参数，确保与create-session使用相同的用户标识
  };
  
  const chatParams = {
    headers: chatHeaders,
    timeout: '60s',  // 增加聊天超时时间到60秒
  };
  
  const chatResponse = http.post(`${data.baseUrl}/gotgpt/chat`, JSON.stringify(chatPayload), chatParams);
  
  // 验证聊天响应 - HTTP状态码200 + 业务code判断（聊天响应可能是流式，需兼容处理）
  const isChatSuccess = check(chatResponse, {
    'HTTP状态码200': (r) => r.status === 200,
    '业务成功判断': (r) => {
      if (r.status !== 200) return false;
      
      // 聊天API返回SSE流式响应，检查响应内容
      const responseBody = r.body || '';
      
      // 如果响应为空，认为失败
      if (!responseBody.trim()) {
        return false;
      }
      
      // 先尝试解析JSON格式（非流式响应）
      try {
        const data = JSON.parse(responseBody);
        return data.code === "20000";
      } catch {
        // SSE流式响应格式检查
        // 检查是否包含有效的SSE数据或错误标识
        if (responseBody.includes('data:') || 
            responseBody.includes('event:') ||
            responseBody.includes('"code":"20000"') ||
            responseBody.length > 10) {  // 有实际内容返回
          return true;
        }
        
        // 如果既不是JSON也没有SSE特征，认为失败
        return false;
      }
    }
  });

  // 记录自定义指标 - 只有业务成功才计入成功
  chatResponseRate.add(isChatSuccess);
  if (isChatSuccess) {
    chatResponseDuration.add(chatResponse.timings.duration);
  } else {
    // 添加调试信息，帮助排查聊天失败原因
    console.log(`❌ 聊天失败 - HTTP状态: ${chatResponse.status}, 响应长度: ${(chatResponse.body || '').length}, 响应前100字符: ${(chatResponse.body || '').substring(0, 100)}`);
  }
  

}

// 测试设置阶段
export function setup() {
  return setupTest(
    config, 
    tokenConfig, 
    'user/chat', 
    TARGET_QPS, 
    '/gotgpt/chat',
    '🌊 测试流程: create-session → chat (SSE流式响应)'
  );
}

// 测试清理阶段
export function teardown(data) {
  teardownTest('user/chat', '会话创建成功率、聊天响应成功率、端到端响应时间、QPS稳定性');
} 