import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 自定义指标
const sessionCreationRate = new Rate('session_creation_success_rate');
const chatResponseRate = new Rate('chat_response_success_rate');
const chatResponseDuration = new Trend('chat_response_duration');
const endToEndDuration = new Trend('end_to_end_duration');

// 从配置文件加载环境配置和测试数据
const config = JSON.parse(open('../../config/env.dev.json'));
const testData = JSON.parse(open('../../config/test-data.json'));

// 压力测试场景配置 - 根据需求文档调整
export const options = {
  scenarios: {
    // 阶梯式递增测试 - 按需求文档配置
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },   // 0→50用户（30s爬坡）
        { duration: '5m', target: 50 },    // 持续5分钟
        { duration: '30s', target: 100 },  // 50→100用户（30s爬坡）
        { duration: '5m', target: 100 },   // 持续5分钟
        { duration: '30s', target: 150 },  // 100→150用户（30s爬坡）
        { duration: '5m', target: 150 },   // 持续5分钟
        { duration: '30s', target: 200 },  // 150→200用户（30s爬坡）
        { duration: '5m', target: 200 },   // 持续5分钟
        { duration: '30s', target: 0 },    // 逐步降至0
      ],
      tags: { test_type: 'ramp_up' },
    },
    
    // 瞬时压力测试 - 100用户 (在阶梯测试完成后开始)
    spike_100: {
      executor: 'constant-vus',
      vus: 100,
      duration: '5m',
      startTime: '23m',  // 阶梯测试约23分钟，之后开始
      tags: { test_type: 'spike_100' },
    },
    
    // 瞬时压力测试 - 200用户 (在100用户测试完成后开始)
    spike_200: {
      executor: 'constant-vus',
      vus: 200,
      duration: '5m',
      startTime: '28m',  // 在spike_100完成后开始
      tags: { test_type: 'spike_200' },
    },
    
    // 瞬时压力测试 - 300用户 (在200用户测试完成后开始)
    spike_300: {
      executor: 'constant-vus',
      vus: 300,
      duration: '5m',
      startTime: '33m',  // 在spike_200完成后开始
      tags: { test_type: 'spike_300' },
    },
  },
  
  // 性能阈值 - 根据需求文档严格设置（平均<200ms，错误率<0.1%）
  thresholds: {
    // 严格按照需求文档设置：平均响应时间<200ms，错误率<0.1%
    http_req_duration: ['avg<200'],                         // 平均响应时间<200ms
    http_req_failed: ['rate<0.001'],                        // 错误率<0.1%
    session_creation_success_rate: ['rate>0.999'],          // 会话创建成功率>99.9%
    chat_response_success_rate: ['rate>0.99'],              // 对话响应成功率>99%
    chat_response_duration: ['avg<200'],                    // 对话响应时间严格按需求
    end_to_end_duration: ['avg<300'],                       // 端到端时间稍宽松
  },
};

// 随机选择测试消息
function getRandomMessage() {
  const messages = testData.messages;
  const randomIndex = Math.floor(Math.random() * messages.length);
  return messages[randomIndex].content;
}

// 测试主函数
export default function () {
  const startTime = Date.now();
  
  // 构造会话创建请求头 - 匹配curl命令
  const sessionHeaders = {
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'content-type': 'application/json',
    'origin': config.origin,
    'referer': config.referer,
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  };

  // 步骤1：创建会话 - 使用正确的请求体
  const createSessionResponse = http.post(
    `${config.baseUrl}/godgpt/guest/create-session`,
    JSON.stringify({"guider": ""}),
    { headers: sessionHeaders }
  );

  // 简化会话创建验证
  let sessionId = null;
  let isSessionCreated = false;
  
  if (createSessionResponse.status === 200) {
    try {
      const body = JSON.parse(createSessionResponse.body);
      sessionId = body.sessionId;
      isSessionCreated = sessionId && sessionId.length > 0 && body.success === true;
    } catch (e) {
      isSessionCreated = false;
    }
  }

  // 简化功能验证
  check(createSessionResponse, {
    'Session-功能正常': () => isSessionCreated,
  });

  // 记录会话创建指标
  sessionCreationRate.add(isSessionCreated);

  // 如果会话创建失败，跳过后续步骤
  if (!isSessionCreated || !sessionId) {
    return;
  }

  // 步骤2：发送聊天消息
  const message = getRandomMessage();
  
  // 构造聊天请求头 - 匹配curl命令，支持SSE流式响应
  const chatHeaders = {
    'accept': 'text/event-stream',
    'accept-language': 'zh-CN,zh;q=0.9',
    'content-type': 'application/json',
    'origin': config.origin,
    'referer': config.referer,
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  };
  
  // 使用正确的请求体格式
  const chatPayload = {
    content: message,
    region: "",
  };

  const chatResponse = http.post(
    `${config.baseUrl}/godgpt/guest/chat`,
    JSON.stringify(chatPayload),
    { headers: chatHeaders }
  );

  // 验证聊天响应 - 严格检查状态码200
  const chatStatusCheck = check(chatResponse, {
    '聊天-状态码严格为200': (r) => r.status === 200,
    '聊天-响应时间小于5000ms': (r) => r.timings.duration < 5000, // SSE响应时间较长
  });

  // 只有状态码200才进行业务逻辑验证
  let isChatSuccess = false;
  
  if (chatResponse.status === 200) {
    const chatBusinessCheck = check(chatResponse, {
      '聊天-Content-Type为text/event-stream': (r) => {
        const contentType = r.headers['Content-Type'] || r.headers['content-type'];
        return contentType && contentType.includes('text/event-stream');
      },
      '聊天-返回有效SSE流数据': (r) => {
        // 检查是否包含SSE格式的数据
        const body = r.body;
        return body && body.length > 0 && (body.includes('data:') || body.includes('event:'));
      },
      '聊天-响应体不为空': (r) => {
        return r.body && r.body.length > 0;
      },
    });
    
    // 只有状态码200且业务逻辑正确才算成功
    isChatSuccess = chatBusinessCheck;
  } else {
    console.log(`❌ 聊天请求失败 - 状态码: ${chatResponse.status}, 响应体: ${chatResponse.body}`);
  }

  // 记录自定义指标 - 只有200状态码才计入成功
  chatResponseRate.add(isChatSuccess);
  if (chatResponse.status === 200) {
    chatResponseDuration.add(chatResponse.timings.duration);
  }
  
  // 计算端到端响应时间
  const endTime = Date.now();
  const endToEndTime = endTime - startTime;
  endToEndDuration.add(endToEndTime);
}

// 测试设置阶段
export function setup() {
  console.log('🚀 开始 guest/chat 接口压力测试...');
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/guest/chat`);
  console.log('🔧 测试场景: 阶梯式递增(0→200用户) + 瞬时压力(100/200/300用户)');
  console.log('🎯 性能要求: 平均响应时间<200ms, 错误率<0.1%');
  return { baseUrl: config.baseUrl };
}

// 测试清理阶段
export function teardown(data) {
  console.log('✅ guest/chat 接口压力测试完成');
  console.log('🔍 关键指标：会话创建成功率、对话响应成功率、端到端响应时间');
  console.log('📈 请分析各场景下的TPS、响应时间分布和系统资源使用情况');
} 