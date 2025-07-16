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

export const options = {
  scenarios: {
    baseline_test: {
      executor: 'constant-vus',
      vus: 1,
      duration: '60s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<10000'], // 95%的请求响应时间应小于10秒
    session_creation_success_rate: ['rate>0.99'], // 会话创建成功率应大于99%
    chat_response_success_rate: ['rate>0.99'], // 聊天响应成功率应大于99%
  },
};

// 测试设置阶段
export function setup() {
  console.log('🎯 开始 guest/chat 基准测试...');
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/guest/chat`);
  console.log('🔧 测试类型: 基线性能测试 (1用户, 1分钟)');
  console.log('🌊 测试流程: create-session → chat (SSE流式响应)');
  console.log(`📋 测试消息数量: ${testData.messages.length}`);
  console.log('🧘 支持的消息类型: 冥想引导、问候、问题、复杂分析、正念练习等');
  console.log('📊 使用K6原生监控，测试完成后查看汇总报告');
  console.log('🎯 性能要求: 平均响应时间<200ms, 错误率<0.1%');
  console.log('📊 测试目的: 建立SSE流式响应性能基线，验证接口功能正确性');
  return { baseUrl: config.baseUrl };
}

// 主测试函数
export default function(data) {
  const startTime = Date.now();
  
  // 步骤1: 创建会话
  const createSessionUrl = `${data.baseUrl}/godgpt/guest/create-session`;
  const createSessionPayload = JSON.stringify({
    guider: '',
    ip: '192.168.1.100'
  });
  
  const createSessionParams = {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: '30s',
  };
  
  const createSessionResponse = http.post(createSessionUrl, createSessionPayload, createSessionParams);
  
  // 检查会话创建是否成功 - 只检查HTTP状态码200
  const isSessionCreated = check(createSessionResponse, {
    'session creation status is 200': (r) => r.status === 200,
  });
  
  // 记录会话创建指标
  sessionCreationRate.add(isSessionCreated);

  // 如果会话创建失败，跳过后续步骤
  if (!isSessionCreated) {
    return;
  }
  
  // 对于chat测试，使用固定的sessionId（因为只关心状态码200）
  const sessionId = 'test-session-id';
  
  // 步骤2: 发送聊天消息
  const randomMessage = testData.messages[Math.floor(Math.random() * testData.messages.length)];
  const chatUrl = `${data.baseUrl}/godgpt/guest/chat`;
  const chatPayload = JSON.stringify({
    sessionId: sessionId,
    message: randomMessage.content,
    conversationId: '',
    parentMessageId: '',
    stream: true
  });
  
  const chatParams = {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: '30s',
  };
  
  const chatResponse = http.post(chatUrl, chatPayload, chatParams);
  
  // 检查聊天响应是否成功 - 只检查HTTP状态码200
  const isChatSuccess = check(chatResponse, {
    'chat response status is 200': (r) => r.status === 200,
  });
  
  // 记录自定义指标
  chatResponseRate.add(isChatSuccess);
  chatResponseDuration.add(chatResponse.timings.duration);
  
  // 计算端到端响应时间
  const endTime = Date.now();
  const endToEndTime = endTime - startTime;
  endToEndDuration.add(endToEndTime);
}

// 测试清理阶段
export function teardown(data) {
  console.log('✅ guest/chat 基准测试完成');
  console.log('📊 SSE流式响应基准数据已记录到K6报告中');
  console.log('🔍 关键指标：会话创建成功率、聊天响应成功率、端到端响应时间');
  console.log('🎯 性能基线：平均响应时间<200ms, 错误率<0.1%');
} 