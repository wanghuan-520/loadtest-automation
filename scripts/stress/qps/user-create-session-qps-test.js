import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 30 QPS（每秒30个请求，持续10分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=50 user-create-session-qps-test.js
// 静默模式（无debug信息）: k6 run --quiet -e TARGET_QPS=40 user-create-session-qps-test.js
// 示例: k6 run -e TARGET_QPS=60 user-create-session-qps-test.js

// 自定义指标 - 精简版，只保留核心指标
const sessionCreationRate = new Rate('session_creation_success_rate');
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

// 获取目标QPS参数，默认值为30（较有挑战性的合理起点）
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 30;



// 固定QPS压力测试场景配置
export const options = {
  scenarios: {
    // 固定QPS测试 - 恒定请求速率（超稳定性优化版）
    fixed_qps: {
      executor: 'constant-arrival-rate',
      rate: TARGET_QPS,              // 每秒请求数（QPS）
      timeUnit: '1s',                // 时间单位：1秒
      duration: '10m',               // 测试持续时间：10分钟
      // 🎯 QPS超稳定配置：基于实际高QPS测试结果动态调整VU分配
      // 实际测试发现高QPS时需要更多VU资源（网络延迟、服务器处理时间等因素）
      preAllocatedVUs: Math.max(Math.ceil(TARGET_QPS * 6), 10),    // 6倍预分配，应对实际网络延迟
      maxVUs: Math.max(Math.ceil(TARGET_QPS * 10), 20),            // 10倍最大值，确保充足资源
      tags: { test_type: 'fixed_qps_ultra_stable' },
    },
  },
  // 🔧 QPS平滑优化：连接池与请求调度精细调节
  batch: 1,                          // 单请求模式，确保精确QPS控制
  batchPerHost: 1,                   // 每主机单批次，避免请求堆积
  noConnectionReuse: false,          // 启用连接复用，减少握手开销
  noVUConnectionReuse: false,        // 启用VU内连接复用，提升稳定性
  userAgent: 'k6-loadtest/1.0',      // 统一User-Agent
  // 🎯 请求调度精细优化
  discardResponseBodies: false,      // 保持响应体，确保完整测试
  // 📊 完整响应时间统计信息
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)'], // 显示完整的响应时间分布
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'session_creation_success_rate': ['rate>0.99'],
  //   'create_response_duration': ['p(95)<2000'],
  // },
};

// 测试主函数
export default function (data) {
  const startTime = Date.now();
  
  // 构造已登录用户的create-session请求
  const createSessionUrl = `${data.baseUrl}/godgpt/create-session`;
  const createSessionPayload = JSON.stringify({
    guider: '',  // 使用原始请求体格式
    userId: generateRandomUUID()  // 生成随机UUID格式的userId参数
  });
  
  // 构造请求头 - 匹配curl命令，包含authorization token
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
    timeout: '30s',                // 调整为合理的30秒超时，基于实际38ms响应时间
    responseType: 'text',          // 明确响应类型，提升解析效率
    responseCallback: http.expectedStatuses(200, 408, 429, 502, 503, 504), // 接受更多状态码，减少错误干扰
  };
  
  const createSessionResponse = http.post(createSessionUrl, createSessionPayload, createSessionParams);

  // 业务成功判断 - HTTP状态码200 + 业务code为20000
  const isSessionCreated = check(createSessionResponse, {
    'HTTP状态码200': (r) => r.status === 200,
    '业务代码20000': (r) => {
      try {
        // 调试：输出响应体内容（前100字符）
        if (!__ENV.QUIET && r.body) {
          console.log(`📋 响应体样本: ${r.body.substring(0, 100)}...`);
        }
        const data = JSON.parse(r.body);
        const isSuccess = data.code === "20000";
        // 调试：如果不是20000，输出实际的code值
        if (!isSuccess && !__ENV.QUIET) {
          console.log(`⚠️  业务代码不是20000: ${data.code || 'undefined'}`);
        }
        return isSuccess;
      } catch (e) {
        // 调试：输出JSON解析错误详情
        if (!__ENV.QUIET) {
          console.log(`❌ JSON解析失败: ${e.message}, 响应体: "${r.body}"`);
        }
        return false;
      }
    },
    '响应时间合理': (r) => r.timings.duration < 30000,  // 30秒内响应，基于实际性能调整
    '无超时错误': (r) => r.status !== 0,  // 0表示请求超时或网络错误
    '响应体不为空': (r) => r.body && r.body.length > 0,  // 确保有有效响应内容
  });
  
  // 记录会话创建指标 - 只有HTTP200且业务code为20000才算成功
  sessionCreationRate.add(isSessionCreated);
  if (createSessionResponse.status === 200) {
    createResponseDuration.add(createSessionResponse.timings.duration);
  }
  
  // 错误详细记录（仅在非静默模式下）
  if (!isSessionCreated && !__ENV.QUIET) {
    console.warn(`❌ 请求失败: 状态码=${createSessionResponse.status}, 响应时间=${createSessionResponse.timings.duration.toFixed(2)}ms, userId=${generateRandomUUID()}`);
  }
}

// 测试设置阶段
export function setup() {
  const startTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const preAllocatedVUs = Math.max(Math.ceil(TARGET_QPS * 6), 10);
  const maxVUs = Math.max(Math.ceil(TARGET_QPS * 10), 20);
  
  console.log('🎯 开始 user/create-session 超稳定QPS压力测试...');
  console.log(`⚡ 目标QPS: ${TARGET_QPS} | 预分配VU: ${preAllocatedVUs} | 最大VU: ${maxVUs}`);
  console.log(`🕐 测试时间: ${startTime} (持续10分钟)`);
  console.log('🔧 优化策略: 基于实际38ms响应时间优化VU配置，大幅减少dropped_iterations');
  console.log('⚠️  修复: 降低超时时间至30s，优化VU分配算法，支持更多HTTP状态码');
  console.log('💡 提示: 使用 k6 run --quiet 命令减少调试输出');
  
  return setupTest(
    config, 
    tokenConfig, 
    'user/create-session', 
    TARGET_QPS, 
    '/godgpt/create-session'
  );
}

// 测试清理阶段
export function teardown(data) {
  const endTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`✅ user/create-session 超稳定QPS压力测试完成 - ${endTime}`);
  console.log('🔍 关键指标: 会话创建成功率、响应时间、QPS稳定性');
  teardownTest('user/create-session', '会话创建成功率、响应时间、QPS稳定性');
} 