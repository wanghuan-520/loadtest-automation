import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 20 QPS（每秒20个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=30 godgpt-voice-chat-qps-test.js
// 启用DEBUG模式: k6 run -e TARGET_QPS=5 -e DEBUG=true godgpt-voice-chat-qps-test.js
// 完整示例: k6 run -e TARGET_QPS=25 -e ENABLE_THRESHOLDS=true -e DEBUG=true godgpt-voice-chat-qps-test.js
//
// 🔧 性能优化说明：
// - maxVUs: TARGET_QPS * 5 (最少10个) - 语音聊天需要较长处理时间
// - preAllocatedVUs: TARGET_QPS (最少5个) - 预分配足够VU避免延迟
// - 超时时间: 60秒 - 语音聊天处理时间较长
// - 随机化UserAgent: 避免请求被服务器限制
// - 智能会话ID生成: 模拟真实用户行为

// 生成随机User-Agent函数
function generateRandomUserAgent() {
  const chromeVersions = ['138.0.0.0', '137.0.0.0', '136.0.0.0', '135.0.0.0'];
  const webkitVersions = ['537.36', '537.35', '537.34'];
  const chromeVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
  const webkitVersion = webkitVersions[Math.floor(Math.random() * webkitVersions.length)];
  
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Chrome/${chromeVersion} Safari/${webkitVersion}`;
}

// 为不同用户生成随机会话ID池 - 在测试期间动态创建有效会话
const sessionPool = [];

// 创建会话的函数
function createSession(data, randomUserAgent) {
  const createSessionUrl = `${data.baseUrl}/godgpt/create-session`;
  const createSessionPayload = JSON.stringify({
    guider: ''
  });
  
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
    'user-agent': randomUserAgent,
  };
  
  const sessionParams = {
    headers: sessionHeaders,
    timeout: '30s',
  };
  
  const createSessionResponse = http.post(createSessionUrl, createSessionPayload, sessionParams);
  
  // 检查会话创建是否成功
  if (createSessionResponse.status === 200) {
    try {
      const responseData = JSON.parse(createSessionResponse.body);
      if (responseData && responseData.code === '20000' && responseData.data) {
        return responseData.data; // 返回新创建的sessionId
      }
    } catch (error) {
      debugLog('会话创建响应解析失败', error);
    }
  }
  
  debugLog('会话创建失败', {
    status: createSessionResponse.status,
    body: createSessionResponse.body.substring(0, 200)
  });
  return null;
}

// 自定义指标
const voiceChatRate = new Rate('voice_chat_success_rate');
const voiceChatDuration = new Trend('voice_chat_duration');
const voiceChatRequestDuration = new Trend('voice_chat_request_duration');

// 从配置文件加载环境配置和测试数据
const config = JSON.parse(open('../../../config/env.dev.json'));
const testData = JSON.parse(open('../../../config/test-data.json'));

// 模拟音频数据 - 使用较短的示例数据来减少网络负担
const sampleAudioData = "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";

// 支持的语音语言类型
const voiceLanguages = ['en', 'zh-CN', 'zh'];
const messageTypes = [1, 2]; // 1: 新消息, 2: 继续对话

// 尝试从tokens.json文件加载token配置
let tokenConfig = {};
try {
  tokenConfig = JSON.parse(open('../../../config/tokens.json'));
} catch (error) {
  console.log('⚠️  未找到tokens.json配置文件，将使用环境变量或默认token');
}

// 获取目标QPS参数，默认值为20
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 20;

// DEBUG模式开关 - 可通过环境变量 DEBUG=true 启用
const DEBUG_MODE = __ENV.DEBUG === 'true';

// Debug日志函数
function debugLog(message, data = null) {
  if (DEBUG_MODE) {
    console.log(`🐛 [DEBUG] ${message}`);
    if (data) {
      console.log(`    ${JSON.stringify(data, null, 2)}`);
    }
  }
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
      preAllocatedVUs: Math.max(TARGET_QPS, 5),     // 预分配VU数量（至少5个）
      maxVUs: Math.max(TARGET_QPS * 5, 10),        // 最大VU数量（语音聊天需要更长处理时间）
      tags: { test_type: 'fixed_qps_voice_chat' },
    },
  },
  // 可选的性能阈值 - 可通过环境变量 ENABLE_THRESHOLDS=true 启用
  thresholds: __ENV.ENABLE_THRESHOLDS ? {
    http_req_failed: ['rate<0.05'],                    // HTTP失败率小于5%
    'voice_chat_success_rate': ['rate>0.95'],          // 语音聊天成功率大于95%
    'voice_chat_duration': ['p(95)<10000'],            // 95%的请求响应时间小于10秒
    'voice_chat_request_duration': ['p(90)<8000'],     // 90%的请求时间小于8秒
  } : {},
};

// 测试主函数
export default function (data) {
  const startTime = Date.now();
  
  // 生成随机信息，模拟真实用户
  const randomUserAgent = generateRandomUserAgent();
  
  // 步骤1: 创建会话 - 确保使用有效的会话ID
  debugLog('=== 开始创建会话 ===');
  const sessionId = createSession(data, randomUserAgent);
  
  if (!sessionId) {
    debugLog('❌ 会话创建失败，跳过语音聊天测试');
    return; // 如果会话创建失败，直接返回
  }
  
  debugLog('✅ 会话创建成功', { sessionId });
  
  // 步骤2: 构造语音聊天请求
  const voiceChatUrl = `${data.baseUrl}/godgpt/voice/chat`;
  
  // 随机选择语音语言和消息类型
  const randomVoiceLanguage = voiceLanguages[Math.floor(Math.random() * voiceLanguages.length)];
  const randomMessageType = messageTypes[Math.floor(Math.random() * messageTypes.length)];
  const randomVoiceDuration = (Math.random() * 5 + 1).toFixed(2); // 1-6秒随机时长

  // Debug: 显示请求参数
  debugLog('=== 开始语音聊天请求 ===');
  debugLog('请求URL', voiceChatUrl);
  debugLog('请求参数', {
    sessionId: sessionId,
    voiceLanguage: randomVoiceLanguage,
    messageType: randomMessageType,
    voiceDuration: randomVoiceDuration,
    userAgent: randomUserAgent.substring(0, 50) + '...'
  });
  
  // 构造请求体 - 完全匹配curl示例格式
  const voiceChatPayload = JSON.stringify({
    content: sampleAudioData, // 使用模拟的音频数据
    region: "", // 设置为空字符串，匹配curl示例
    sessionId: sessionId, // 使用UUID格式的会话ID
    messageType: randomMessageType,
    voiceLanguage: randomVoiceLanguage === 'en' ? 1 : (randomVoiceLanguage === 'zh-CN' ? 2 : 2),
    voiceDurationSeconds: parseFloat(randomVoiceDuration)
  });
  
  // 构造请求头 - 参照curl示例和API文档格式
  const voiceChatHeaders = {
    'accept': 'text/event-stream, text/event-stream', // 期望流式响应
    'accept-language': `${randomVoiceLanguage},zh-CN;q=0.9,zh;q=0.8`, // 根据随机语言设置
    'authorization': `Bearer ${data.bearerToken}`,
    'cache-control': 'no-cache', // 禁用缓存
    'content-type': 'application/json',
    'godgptlanguage': randomVoiceLanguage === 'en' ? 'en' : 'zh', // 语言设置
    'origin': config.origin,
    'priority': 'u=1, i',
    'referer': config.referer,
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': randomUserAgent, // 使用随机生成的UserAgent
    'x-requested-with': 'XMLHttpRequest', // AJAX标识
  };
  
  const voiceChatParams = {
    headers: voiceChatHeaders,
    timeout: '60s', // 语音聊天可能需要更长的超时时间
  };

  // Debug: 显示请求详情
  debugLog('请求体大小', `${voiceChatPayload.length} 字符`);
  debugLog('请求头', voiceChatHeaders);
  debugLog('音频数据前100字符', sampleAudioData.substring(0, 100) + '...');
  
  debugLog('发送POST请求中...');
  const requestStartTime = Date.now();
  const voiceChatResponse = http.post(voiceChatUrl, voiceChatPayload, voiceChatParams);
  const requestEndTime = Date.now();
  
  // Debug: 显示响应详情
  debugLog('=== 收到响应 ===');
  debugLog('响应状态码', voiceChatResponse.status);
  debugLog('响应时间', `${requestEndTime - requestStartTime}ms`);
  debugLog('响应头', voiceChatResponse.headers);
  debugLog('响应体大小', `${voiceChatResponse.body ? voiceChatResponse.body.length : 0} 字符`);
  
  // Debug: 尝试解析响应内容
  try {
    const responseData = JSON.parse(voiceChatResponse.body);
    debugLog('解析的JSON响应', responseData);
  } catch (e) {
    debugLog('响应体前500字符 (非JSON)', voiceChatResponse.body.substring(0, 500));
    if (voiceChatResponse.body.length > 500) {
      debugLog('响应体总长度', voiceChatResponse.body.length);
    }
  }

  // 检查语音聊天是否成功 - 针对流式响应进行优化验证
  const checkResults = {
    'HTTP状态码200': false,
    '响应有内容': false,
    '业务逻辑成功': false,
    '响应时间合理': false
  };
  
  const isVoiceChatSuccess = check(voiceChatResponse, {
    'HTTP状态码200': (r) => {
      const result = r.status === 200;
      checkResults['HTTP状态码200'] = result;
      return result;
    },
    '响应有内容': (r) => {
      const result = r.body && r.body.length > 0;
      checkResults['响应有内容'] = result;
      return result;
    },
    '业务逻辑成功': (r) => {
      let result = false;
      try {
        // 尝试解析JSON响应
        const data = JSON.parse(r.body);
        result = data.code === "20000" || data.success === true;
        debugLog('JSON响应解析结果', { code: data.code, success: data.success, message: data.message });
      } catch {
        // 对于流式响应（text/event-stream），检查是否包含数据标识
        const bodyStr = r.body.toString();
        const hasData = bodyStr.includes('data:');
        const hasEvent = bodyStr.includes('event:');
        const isOk = r.status === 200;
        result = hasData || hasEvent || isOk;
        debugLog('流式响应检查结果', { hasData, hasEvent, isOk, bodyLength: bodyStr.length });
      }
      checkResults['业务逻辑成功'] = result;
      return result;
    },
    '响应时间合理': (r) => {
      const result = r.timings.duration < 60000;
      checkResults['响应时间合理'] = result;
      return result;
    }
  });
  
  // Debug: 显示验证结果
  debugLog('=== 验证结果 ===');
  debugLog('各项检查结果', checkResults);
  debugLog('总体成功状态', isVoiceChatSuccess);

  // 记录自定义指标 - 只有业务成功才计入成功
  voiceChatRate.add(isVoiceChatSuccess);
  voiceChatRequestDuration.add(voiceChatResponse.timings.duration);
  
  if (isVoiceChatSuccess) {
    voiceChatDuration.add(voiceChatResponse.timings.duration);
  }
  
  // Debug: 显示成功/失败的详细信息
  if (DEBUG_MODE) {
    if (isVoiceChatSuccess) {
      debugLog('=== 🎉 请求成功 ===');
      debugLog('响应时间', `${voiceChatResponse.timings.duration}ms`);
      debugLog('响应大小', `${voiceChatResponse.body.length} 字符`);
    } else {
      debugLog('=== ❌ 请求失败分析 ===');
      debugLog('失败的检查项', Object.entries(checkResults)
        .filter(([key, value]) => !value)
        .map(([key, value]) => key));
    }
    debugLog('=== 请求完成 ===\n');
  }
  
  // 如果语音聊天失败，记录详细错误信息用于调试
  if (!isVoiceChatSuccess) {
    console.error(`❌ 语音聊天失败详情:`);
    console.error(`   HTTP状态码: ${voiceChatResponse.status}`);
    console.error(`   会话ID: ${sessionId}`);
    console.error(`   语音语言: ${randomVoiceLanguage}`);
    console.error(`   消息类型: ${randomMessageType}`);
    console.error(`   音频时长: ${randomVoiceDuration}s`);
    console.error(`   响应时间: ${voiceChatResponse.timings.duration}ms`);
    console.error(`   响应头: ${JSON.stringify(voiceChatResponse.headers)}`);
    console.error(`   响应体前200字符: ${voiceChatResponse.body.substring(0, 200)}`);
    console.error(`   失败检查项: ${Object.entries(checkResults)
      .filter(([key, value]) => !value)
      .map(([key, value]) => key)
      .join(', ')}`);
  }
}

// 测试设置阶段 - 使用通用的auth setup函数
export function setup() {
  const startTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log('🎯 开始 godgpt/voice/chat 固定QPS压力测试...');
  console.log(`🕐 测试开始时间: ${startTime}`);
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/voice/chat`);
  console.log(`🔧 测试场景: 固定QPS测试 (${TARGET_QPS} QPS，持续5分钟)`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * 300} 个 (${TARGET_QPS} QPS × 300秒)`);
  console.log(`👥 VU配置: 预分配 ${Math.max(TARGET_QPS, 5)} 个，最大 ${Math.max(TARGET_QPS * 5, 10)} 个`);
  console.log(`⏰ 超时设置: 60秒 (适应语音聊天长处理时间)`);
  console.log(`🎭 随机化: UserAgent、会话ID、语音语言、消息类型 (模拟真实用户)`);
  console.log(`📊 性能阈值: ${__ENV.ENABLE_THRESHOLDS ? '已启用' : '未启用'} (可通过 ENABLE_THRESHOLDS=true 启用)`);
  console.log(`🐛 DEBUG模式: ${DEBUG_MODE ? '已启用' : '未启用'} (可通过 DEBUG=true 启用详细日志)`);
  console.log('🎤 测试内容: 语音聊天功能 (音频数据上传)');
  console.log(`🌐 支持语言: ${voiceLanguages.join(', ')}`);
  console.log('📡 响应类型: Server-Sent Events (流式)');
  console.log('⏱️  预计测试时间: 5分钟');
  
  if (DEBUG_MODE) {
    console.log('\n🐛 DEBUG模式提示:');
    console.log('   - 将显示每个请求的详细信息');
    console.log('   - 包含请求/响应头、状态码、响应内容');
    console.log('   - 显示验证步骤的详细结果');
    console.log('   - 建议仅在小QPS下使用以避免日志过多\n');
  }
  return setupTest(config, tokenConfig);
}

// 测试清理阶段 - 使用通用的teardown函数
export function teardown(data) {
  const endTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log('✅ godgpt/voice/chat 固定QPS压力测试完成');
  console.log(`🕛 测试结束时间: ${endTime}`);
  console.log('🔍 关键指标分析：');
  console.log('   📊 voice_chat_success_rate: 语音聊天业务成功率 (含流式响应验证)');
  console.log('   ⏱️  voice_chat_duration: 成功请求的响应时间分布');
  console.log('   📈 voice_chat_request_duration: 所有请求的响应时间分布');
  console.log('   🚀 http_req_rate: 实际达到的QPS稳定性');
  console.log('   🎵 音频处理性能: 语音转文本和AI回复生成时间');
  console.log('📋 语音聊天性能分析建议：');
  console.log('   1. 检查QPS是否稳定维持在目标值 (语音处理较重)');
  console.log('   2. 分析P95响应时间是否在可接受范围内(<10s)');
  console.log('   3. 监控音频上传和处理的延迟分布');
  console.log('   4. 检查不同语言设置的性能差异');
  console.log('   5. 观察流式响应的完整性和稳定性');
  console.log('   6. 对比音频时长与处理时间的关系');
  teardownTest(data);
}