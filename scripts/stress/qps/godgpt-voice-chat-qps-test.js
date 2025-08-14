import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 1 QPS（每秒1个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=5 godgpt-voice-chat-qps-test.js
// 完整示例: k6 run -e TARGET_QPS=3 -e ENABLE_THRESHOLDS=true godgpt-voice-chat-qps-test.js
//
// 🔧 性能优化说明：
// - maxVUs: TARGET_QPS * 15 - 平衡性能与资源，语音聊天处理时间较长
// - preAllocatedVUs: TARGET_QPS * 3 - 预分配足够VU避免延迟
// - 超时时间: 300秒 - 语音聊天处理时间较长，增加超时时间避免客户端提前断开连接
// - 随机化UserAgent: 避免请求被服务器限制
// - 固定会话ID: 使用固定sessionId进行稳定性测试
// - 固定语音参数: 使用统一的测试参数确保一致性

// 生成随机User-Agent函数
function generateRandomUserAgent() {
  const chromeVersions = ['138.0.0.0', '137.0.0.0', '136.0.0.0', '135.0.0.0'];
  const webkitVersions = ['537.36', '537.35', '537.34'];
  const chromeVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
  const webkitVersion = webkitVersions[Math.floor(Math.random() * webkitVersions.length)];
  
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Chrome/${chromeVersion} Safari/${webkitVersion}`;
}

// 自定义指标
const voiceChatRate = new Rate('voice_chat_success_rate');
const voiceChatDuration = new Trend('voice_chat_duration');
const voiceChatRequestDuration = new Trend('voice_chat_request_duration');

// 从配置文件加载环境配置和测试数据
const config = JSON.parse(open('../../../config/env.dev.json'));
const testData = JSON.parse(open('../../../config/test-data.json'));

// 模拟音频数据 - 使用较短的示例数据来减少网络负担
const sampleAudioData = "TGFzdCBsb2dpbjogTW9uIEp1bCAgNyAxNDoyNDo1NSBvbiB0dHlzMDAxDQovVXNlcnMveWFuZmVuZy8uenNocmM6c291cmNlOjY6IG5vIHN1Y2ggZmlsZSBvciBkaXJlY3Rvcnk6IC9vaC1teS16c2guc2gNChtbMW0bWzdtJRtbMjdtG1sxbRtbMG0gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgDSANDRtbMG0bWzI3bRtbMjRtG1tKeWFuZmVuZ0B5YW5mZW5nZGVNYWNCb29rLVBybyB+ICUgG1tLG1s/MjAwNGhyCHJlZGlzLXNlcnZlchtbPzIwMDRsDQ0KMTIxOTpDIDA3IEp1bCAyMDI1IDE0OjI1OjI4LjMxNiAqIG9PME9vTzBPb08wT28gUmVkaXMgaXMgc3RhcnRpbmcgb08wT29PME9vTzBPbw0KMTIxOTpDIDA3IEp1bCAyMDI1IDE0OjI1OjI4LjMxNiAqIFJlZGlzIHZlcnNpb249Ny4yLjYsIGJpdHM9NjQsIGNvbW1pdD0wMDAwMDAwMCwgbW9kaWZpZWQ9MCwgcGlkPTEyMTksIGp1c3Qgc3RhcnRlZA0KMTIxOTpDIDA3IEp1bCAyMDI1IDE0OjI1OjI4LjMxNiAjIFdhcm5pbmc6IG5vIGNvbmZpZyBmaWxlIHNwZWNpZmllZCwgdXNpbmcgdGhlIGRlZmF1bHQgY29uZmlnLiBJbiBvcmRlciB0byBzcGVjaWZ5IGEgY29uZmlnIGZpbGUgdXNlIHJlZGlzLXNlcnZlciAvcGF0aC90by9yZWRpcy5jb25mDQoxMjE5Ok0gMDcgSnVsIDIwMjUgMTQ6MjU6MjguMzE3ICogSW5jcmVhc2VkIG1heGltdW0gbnVtYmVyIG9mIG9wZW4gZmlsZXMgdG8gMTAwMzIgKGl0IHdhcyBvcmlnaW5hbGx5IHNldCB0byAyNTYpLg0KMTIxOTpNIDA3IEp1bCAyMDI1IDE0OjI1OjI4LjMxNyAqIG1vbm90b25pYyBjbG9jazogUE9TSVggY2xvY2tfZ2V0dGltZQ0KICAgICAgICAgICAgICAgIF8uXyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgDQogICAgICAgICAgIF8uLWBgX18gJyctLl8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICANCiAgICAgIF8uLWBgICAgIGAuICBgXy4gICcnLS5fICAgICAgICAgICBSZWRpcyA3LjIuNiAoMDAwMDAwMDAvMCkgNjQgYml0DQogIC4tYGAgLi1gYGAuICBgYGBcLyAgICBfLixfICcnLS5fICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA0KICggICAgJyAgICAgICwgICAgICAgLi1gICB8IGAsICAgICkgICAgIFJ1bm5pbmcgaW4gc3RhbmRhbG9uZSBtb2RlDQogfGAtLl9gLS4uLi1gIF9fLi4uLS5gYC0uX3wnYCBfLi0nfCAgICAgUG9ydDogNjM3OQ0KIHwgICAgYC0uXyAgIGAuXyAgICAvICAgICBfLi0nICAgIHwgICAgIFBJRDogMTIxOQ0KICBgLS5fICAgIGAtLl8gIGAtLi8gIF8uLScgICAgXy4tJyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgDQogfGAtLl9gLS5fICAgIGAtLl9fLi0nICAgIF8uLSdfLi0nfCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICANCiB8ICAgIGAtLl9gLS5fICAgICAgICBfLi0nXy4tJyAgICB8ICAgICAgICAgICBodHRwczovL3JlZGlzLmlvICAgICAgIA0KICBgLS5fICAgIGAtLl9gLS5fXy4tJ18uLScgICAgXy4tJyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgDQogfGAtLl9gLS5fICAgIGAtLl9fLi0nICAgIF8uLSdfLi0nfCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICANCiB8ICAgIGAtLl9gLS5fICAgICAgICBfLi0nXy4tJyAgICB8ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA0KICBgLS5fICAgIGAtLl9gLS5fXy4tJ18uLScgICAgXy4tJyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgDQogICAgICBgLS5fICAgIGAtLl9fLi0nICAgIF8uLScgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICANCiAgICAgICAgICBgLS5fICAgICAgICBfLi0nICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA0KICAgICAgICAgICAgICBgLS5fXy4tJyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgDQoNCjEyMTk6TSAwNyBKdWwgMjAyNSAxNDoyNToyOC4zMTcgIyBXQVJOSU5HOiBUaGUgVENQIGJhY2tsb2cgc2V0dGluZyBvZiA1MTEgY2Fubm90IGJlIGVuZm9yY2VkIGJlY2F1c2Uga2Vybi5pcGMuc29tYXhjb25uIGlzIHNldCB0byB0aGUgbG93ZXIgdmFsdWUgb2YgMTI4Lg0KMTIxOTpNIDA3IEp1bCAyMDI1IDE0OjI1OjI4LjMxNyAqIFNlcnZlciBpbml0aWFsaXplZA0KMTIxOTpNIDA3IEp1bCAyMDI1IDE0OjI1OjI4LjMxOCAqIExvYWRpbmcgUkRCIHByb2R1Y2VkIGJ5IHZlcnNpb24gNy4yLjYNCjEyMTk6TSAwNyBKdWwgMjAyNSAxNDoyNToyOC4zMTggKiBSREIgYWdlIDYxMzQxOTYgc2Vjb25kcw0KMTIxOTpNIDA3IEp1bCAyMDI1IDE0OjI1OjI4LjMxOCAqIFJEQiBtZW1vcnkgdXNhZ2Ugd2hlbiBjcmVhdGVkIDE3Mi4zMyBNYg0KMTIxOTpNIDA3IEp1bCAyMDI1IDE0OjI1OjI4Ljc0OCAqIERvbmUgbG9hZGluZyBSREIsIGtleXMgbG9hZGVkOiAxOTk0NjAsIGtleXMgZXhwaXJlZDogNjMuDQoxMjE5Ok0gMDcgSnVsIDIwMjUgMTQ6MjU6MjguNzQ4ICogREIgbG9hZGVkIGZyb20gZGlzazogMC40MzEgc2Vjb25kcw0KMTIxOTpNIDA3IEp1bCAyMDI1IDE0OjI1OjI4Ljc0OCAqIFJlYWR5IHRvIGFjY2VwdCBjb25uZWN0aW9ucyB0Y3ANCl5bWzIwMH5ldmFsICIkKHNzaC1hZ2VudCAtcykiXltbMjAxfg0KXltbMjAwfnNzaC1hZGQgfi8uc3NoL2ZvcmVzdF5bWzIwMX4NCl5bWzIwMH5ldmFsICIkKHNzaC1hZ2VudCAtcykiXltbMjAxfg0KXltbMjAwfnNzaC1hZGQgfi8uc3NoL2FlbGYgXltbMjAxfg0KXltbMjAwfnNzaCAtVCBnaXRAYWVsZl5bWzIwMX4NCmdpdCBicmFuY2g=";

// 语音聊天固定参数配置
const FIXED_VOICE_LANGUAGE = 1;
const FIXED_MESSAGE_TYPE = 1;
const FIXED_VOICE_DURATION = 3.27;

// 尝试从tokens.json文件加载token配置
let tokenConfig = {};
try {
  tokenConfig = JSON.parse(open('../../../config/tokens.json'));
} catch (error) {
  console.log('⚠️  未找到tokens.json配置文件，将使用环境变量或默认token');
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

// 移除响应详情配置，统一静默模式

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
      tags: { test_type: 'fixed_qps_voice_chat' },
    },
  },
  // 连接池优化：提高QPS稳定性，减少连接重置
  batch: 1,                          // 每次只发送1个请求，确保精确控制
  batchPerHost: 1,                   // 每个主机只并发1个请求批次
  noConnectionReuse: false,          // 启用连接复用，减少新连接建立
  userAgent: 'k6-loadtest/1.0',      // 统一User-Agent
  // 全局超时配置：防止请求长时间阻塞
  timeout: '300s',                   // 全局超时：300秒（语音处理需要更长时间）
  // httpDebug: 'full',              // 调试时可启用，压测时建议关闭以确保准确性
  // 可选的性能阈值 - 可通过环境变量 ENABLE_THRESHOLDS=true 启用
  thresholds: __ENV.ENABLE_THRESHOLDS ? {
    http_req_failed: ['rate<0.10'],                    // HTTP失败率小于10% (语音处理较重，适当放宽)
    'voice_chat_success_rate': ['rate>0.85'],          // 语音聊天成功率大于85% (考虑超时因素)
    'voice_chat_duration': ['p(95)<300000'],           // 95%的请求响应时间小于300秒
    'voice_chat_request_duration': ['p(90)<240000'],   // 90%的请求时间小于240秒
    http_req_duration: ['p(95)<300000'],               // 95%的HTTP请求时间小于300秒
  } : {},
};

// 测试主函数
export default function (data) {
  // 简化变量生成，减少性能开销
  const randomUserAgent = generateRandomUserAgent();
  const userId = generateRandomUUID();
  const sessionId = generateRandomUUID();
  
  // 步骤2: 构造语音聊天请求
  const voiceChatUrl = `${data.baseUrl}/godgpt/voice/chat`;
  
  // 使用固定的参数值，参照curl示例

  // 构造语音聊天请求
  
  // 构造请求体 - 完全匹配curl示例格式，并添加userId
  const voiceChatPayload = JSON.stringify({
    content: sampleAudioData, // 使用模拟的音频数据
    region: "", // 设置为空字符串，匹配curl示例
    sessionId: sessionId, // 使用动态生成的会话ID
    messageType: FIXED_MESSAGE_TYPE,
    voiceLanguage: 1, // 使用数字格式，匹配curl示例
    voiceDurationSeconds: FIXED_VOICE_DURATION,
    userId: userId // 添加随机生成的userId参数
  });
  
  // 构造请求头 - 参照curl示例和API文档格式
  const voiceChatHeaders = {
    'accept': 'text/event-stream', // 期望流式响应 - 去掉重复
    'accept-language': `zh-CN,zh;q=0.9,en;q=0.8`, // 修正语言设置格式
    'authorization': `Bearer ${data.bearerToken}`,
    'cache-control': 'no-cache', // 禁用缓存
    'content-type': 'application/json',
    'godgptlanguage': 'en', // 固定使用英语
    'origin': config.origin,
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
    timeout: '300s', // 设置300秒超时，避免客户端超时导致服务端OperationCanceledException
    // 响应配置：确保压测准确性
    responseType: 'text',            // 明确响应类型
    discardResponseBodies: false,    // 保留响应体用于分析和验证
    maxRedirects: 3,                 // 最大重定向次数
    // compression: 'gzip',          // 可选：如果真实环境支持gzip可启用
  };

  // 发送语音聊天请求 - 添加详细的错误处理
  let voiceChatResponse;
  try {
    voiceChatResponse = http.post(voiceChatUrl, voiceChatPayload, voiceChatParams);
    
    // 静默处理状态码0错误，避免大量日志影响性能
  } catch (error) {
    // 静默处理异常，避免日志影响性能
    voiceChatResponse = {
      status: 0,
      body: '',
      error: error.message || error.toString(),
      timings: { duration: 0 }
    };
  }

  // 简化的成功判断逻辑，减少性能开销
  const isVoiceChatSuccess = check(voiceChatResponse, {
    '语音聊天成功': (r) => r.status === 200 && r.body && r.body.length > 0
  });

  // 失败时打印错误信息，帮助定位问题
  if (!isVoiceChatSuccess) {
    if (voiceChatResponse.status === 0) {
      // 连接重置或超时错误，简化日志输出
      if (Math.random() < 0.1) { // 只显示10%的连接错误详情
        console.error(`❌ 连接错误 (仅显示10%详情): ${voiceChatResponse.error || '连接重置'}`);
      }
    } else {
      // 其他HTTP错误正常显示
      const statusCode = voiceChatResponse.status;
      const bodyLength = voiceChatResponse.body ? voiceChatResponse.body.length : 0;
      
      if (statusCode === 524) {
        console.error(`❌ 语音聊天失败 - HTTP状态码: ${statusCode} (Cloudflare超时，服务端处理时间过长), 响应体长度: ${bodyLength}`);
      } else if (statusCode === 521) {
        console.error(`❌ 语音聊天失败 - HTTP状态码: ${statusCode} (服务端拒绝连接或不可用), 响应体长度: ${bodyLength}`);
      } else {
        console.error(`❌ 语音聊天失败 - HTTP状态码: ${statusCode}, 响应体长度: ${bodyLength}`);
      }
    }
  }

  // 记录自定义指标 - 直接使用检查结果
  voiceChatRate.add(isVoiceChatSuccess);
  voiceChatRequestDuration.add(voiceChatResponse.timings.duration);
  
  // 只有成功的请求才记录到响应时间指标中
  if (isVoiceChatSuccess) {
    voiceChatDuration.add(voiceChatResponse.timings.duration);
  }
  
  // 错误统计通过metrics记录，失败信息适度打印便于问题定位
}

// 移除状态码描述函数，减少代码复杂度

// 测试设置阶段 - 使用通用的auth setup函数
export function setup() {
  // 简化的配置信息输出
  console.log(`🎤 语音聊天QPS压测 - 目标QPS: ${TARGET_QPS}`);
  console.log(`⏰ 超时设置: 300秒，性能阈值: ${__ENV.ENABLE_THRESHOLDS ? '启用' : '禁用'}`);
  
  return setupTest(config, tokenConfig, 'godgpt/voice/chat', TARGET_QPS, '/godgpt/voice/chat');
}

// 测试清理阶段 - 使用通用的teardown函数
export function teardown(data) {
  const keyMetrics = 'voice_chat_success_rate, voice_chat_duration, voice_chat_request_duration';
  teardownTest('godgpt/voice/chat', keyMetrics);
  console.log('📋 语音聊天压测完成 - 关注成功率和P95响应时间');
}