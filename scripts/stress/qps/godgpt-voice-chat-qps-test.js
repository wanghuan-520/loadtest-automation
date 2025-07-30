import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 20 QPS（每秒20个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=30 godgpt-voice-chat-qps-test.js
// 示例: k6 run -e TARGET_QPS=25 godgpt-voice-chat-qps-test.js

// 自定义指标
const voiceChatRate = new Rate('voice_chat_success_rate');
const voiceChatDuration = new Trend('voice_chat_duration');

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
      preAllocatedVUs: Math.max(TARGET_QPS, 1),  // 预分配VU数量（至少为QPS数量）
      maxVUs: TARGET_QPS * 3,        // 最大VU数量（QPS的3倍，语音聊天相对耗时）
      tags: { test_type: 'fixed_qps_voice_chat' },
    },
  },
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'voice_chat_success_rate': ['rate>0.99'],
  //   'voice_chat_duration': ['p(95)<5000'],
  // },
};

// 测试主函数
export default function (data) {
  const startTime = Date.now();
  
  // 构造语音聊天请求
  const voiceChatUrl = `${data.baseUrl}/godgpt/voice/chat`;
  
  // 随机选择消息内容
  const randomMessage = testData.messages[Math.floor(Math.random() * testData.messages.length)];
  
  // 构造请求体 - 参照语音聊天API格式
  const voiceChatPayload = JSON.stringify({
    content: randomMessage.content,
    sessionId: "test-session-" + Math.random().toString(36).substr(2, 9), // 生成随机会话ID
    region: "CN"
  });
  
  // 构造请求头 - 参照API文档格式，包含authorization token
  const voiceChatHeaders = {
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
  
  const voiceChatParams = {
    headers: voiceChatHeaders,
    timeout: '60s', // 语音聊天可能需要更长的超时时间
  };
  
  const voiceChatResponse = http.post(voiceChatUrl, voiceChatPayload, voiceChatParams);

  // 检查语音聊天是否成功 - HTTP状态码200 + 业务code为20000
  const isVoiceChatSuccess = check(voiceChatResponse, {
    'HTTP状态码200': (r) => r.status === 200,
    '业务代码20000': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.code === "20000";
      } catch {
        // 如果不是JSON格式（可能是流式响应），HTTP 200即视为成功
        return r.status === 200;
      }
    },
    '响应包含内容': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.data && data.data.content;
      } catch {
        // 对于流式响应，检查是否有响应内容
        return r.body && r.body.length > 0;
      }
    }
  });

  // 记录自定义指标 - 只有业务成功才计入成功
  voiceChatRate.add(isVoiceChatSuccess);
  if (isVoiceChatSuccess) {
    voiceChatDuration.add(voiceChatResponse.timings.duration);
  }
}

// 测试设置阶段 - 使用通用的auth setup函数
export function setup() {
  console.log('🎯 开始 godgpt/voice/chat 固定QPS压力测试...');
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/voice/chat`);
  console.log(`🔧 测试场景: 固定QPS测试 (${TARGET_QPS} QPS，持续5分钟)`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * 300} 个 (${TARGET_QPS} QPS × 300秒)`);
  console.log('🎤 测试内容: 语音聊天功能');
  console.log('⏱️  预计测试时间: 5分钟');
  return setupTest(config, tokenConfig);
}

// 测试清理阶段 - 使用通用的teardown函数
export function teardown(data) {
  console.log('✅ godgpt/voice/chat 固定QPS压力测试完成');
  console.log('🔍 关键指标：语音聊天成功率、响应时间、QPS稳定性');
  console.log('📈 请分析QPS是否稳定、响应时间分布和系统资源使用情况');
  teardownTest(data);
}