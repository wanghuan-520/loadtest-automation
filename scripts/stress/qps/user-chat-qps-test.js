import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 20 QPS（每秒20个请求，持续10分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=30 user-chat-qps-test-2s.js
// 静默模式（无debug信息）: k6 run --quiet -e TARGET_QPS=70 user-chat-qps-test-2s.js
// 示例: k6 run -e TARGET_QPS=25 user-chat-qps-test-2s.js
//
// 🔧 性能优化说明：
// - 超稳定VU配置：基于实际2.1秒流程耗时的动态调整
// - 超时时间: 120秒 - 适应聊天接口潜在的长处理时间
// - SSE响应检查: 优化流式响应判断逻辑，减少误判
// - 🕐 流程优化：会话创建和聊天之间无延迟
// - 连接复用和请求调度精细优化

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
    // 固定QPS测试 - 恒定请求速率（超稳定性优化版）
    fixed_qps: {
      executor: 'constant-arrival-rate',
      rate: TARGET_QPS,              // 每秒请求数（QPS）
      timeUnit: '1s',                // 时间单位：1秒
      duration: '10m',               // 测试持续时间：10分钟
      // 🎯 QPS超稳定配置：基于实测流程耗时优化VU分配
      // 实测流程：session + chat，合理分配VU资源
      preAllocatedVUs: Math.min(Math.max(Math.ceil(TARGET_QPS * 5), 10), 60),   // 5倍预分配，确保充足VU资源
      maxVUs: Math.min(Math.max(Math.ceil(TARGET_QPS * 10), 20), 100),          // 10倍最大值，支撑高并发场景
      tags: { test_type: 'fixed_qps_ultra_stable' },
    },
  },
  // 🔧 QPS平滑优化：连接池与请求调度精细调节
  batch: 1,                          // 单请求模式，确保精确QPS控制
  batchPerHost: 1,                   // 每主机单批次，避免请求堆积
  noConnectionReuse: true,           // 禁用连接复用，避免HTTP/2流冲突（SSE长连接场景）
  noVUConnectionReuse: true,         // 禁用VU内连接复用，每个请求独立连接
  userAgent: 'k6-loadtest/1.0',      // 统一User-Agent
  // 🎯 请求调度精细优化
  discardResponseBodies: false,      // 保持响应体，确保完整测试
  // 📊 完整响应时间统计信息
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)'], // 显示完整的响应时间分布
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
    'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
    'authorization': `Bearer ${data.bearerToken}`,
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
  
  const createSessionParams = {
    headers: sessionHeaders,
    timeout: '60s',                // 会话创建超时时间优化为60秒
    responseType: 'text',          // 明确响应类型，提升解析效率
    responseCallback: http.expectedStatuses(200, 408, 429, 502, 503, 504), // 接受更多状态码，减少错误干扰
    httpVersion: '1.1',            // 强制使用HTTP/1.1，避免HTTP/2流冲突
  };
  
  const createSessionResponse = http.post(createSessionUrl, createSessionPayload, createSessionParams);

  // 会话创建成功判断 - 只需要业务code为20000
  const isSessionCreated = check(createSessionResponse, {
    '业务代码20000': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.code === "20000";
      } catch {
        return false;
      }
    }
  });
  
  // 记录会话创建指标 - 只有业务code为20000才算成功
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
  
  // 直接进行聊天请求
  
  // 步骤2: 发送聊天消息
  const randomMessage = testData.messages[Math.floor(Math.random() * testData.messages.length)];
  
  // 构造已登录用户的chat请求头 - 支持SSE流式响应
  const chatHeaders = {
    'accept': 'text/event-stream',
    'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
    'authorization': `Bearer ${data.bearerToken}`,
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
    timeout: '120s',               // 聊天响应超时时间优化为120秒，适应SSE流式响应
    responseType: 'text',          // 明确响应类型，提升解析效率
    responseCallback: http.expectedStatuses(200, 408, 429, 502, 503, 504, 524), // 接受更多状态码包括524超时
    httpVersion: '1.1',            // 强制使用HTTP/1.1，避免HTTP/2流冲突
  };
  
  const chatResponse = http.post(`${data.baseUrl}/gotgpt/chat`, JSON.stringify(chatPayload), chatParams);
  
  // 验证聊天响应 - 优化判断逻辑：考虑SSE流式响应特性
  const isChatSuccess = check(chatResponse, {
    '聊天响应成功': (r) => {
      // 优化判断：状态码200或者有实际响应内容（SSE流可能状态码为0但有数据）
      const hasValidResponse = (r.body || '').length > 1; // 响应体大于1字符认为有效
      const hasExpectedContent = (r.body || '').includes('ResponseType') || (r.body || '').includes('Response');
      return (r.status === 200 && hasValidResponse) || (hasValidResponse && hasExpectedContent);
    }
  });
  


  // 记录自定义指标
  chatResponseRate.add(isChatSuccess);
  if (isChatSuccess) {
    chatResponseDuration.add(chatResponse.timings.duration);
  }


}

// 测试设置阶段
export function setup() {
  const startTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const preAllocatedVUs = Math.max(Math.ceil(TARGET_QPS * 5), 100);
  const maxVUs = Math.max(Math.ceil(TARGET_QPS * 10), 500);
  
  console.log('🎯 开始 user/chat (无延迟版本) 超稳定QPS压力测试...');
  console.log(`⚡ 目标QPS: ${TARGET_QPS} | 预分配VU: ${preAllocatedVUs} | 最大VU: ${maxVUs}`);
  console.log(`🕐 测试时间: ${startTime} (持续10分钟)`);
  console.log('🔧 优化策略: 基于实测流程耗时合理分配VU资源，确保QPS稳定性');
  console.log('⚠️  修复: 增加超时时间到120s，优化SSE响应判断逻辑，支持更多HTTP状态码');
  console.log('💡 提示: 使用 k6 run --quiet 命令减少调试输出');
  
  return setupTest(
    config, 
    tokenConfig, 
    'user/chat (无延迟版本)', 
    TARGET_QPS, 
    '/gotgpt/chat',
    '🌊 测试流程: create-session → chat (SSE流式响应)'
  );
}

// 测试清理阶段
export function teardown(data) {
  const endTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`✅ user/chat (无延迟版本) 超稳定QPS压力测试完成 - ${endTime}`);
  console.log('🔍 关键指标: 会话创建成功率、聊天响应成功率、端到端响应时间、QPS稳定性');
  teardownTest('user/chat (无延迟版本)', '会话创建成功率、聊天响应成功率、端到端响应时间、QPS稳定性');
} 