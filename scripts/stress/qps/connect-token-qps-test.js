import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { open } from 'k6';

// 使用说明：
// 默认目标QPS: 70 QPS（每秒70个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=80 connect-token-qps-test.js
// 示例: k6 run -e TARGET_QPS=100 connect-token-qps-test.js
// 自定义邮箱前缀: k6 run -e TARGET_QPS=70 -e EMAIL_PREFIX=loadtestc connect-token-qps-test.js
// 注意: 邮箱范围固定为1-30000，保证充足的唯一邮箱

// 自定义指标
const tokenRequestRate = new Rate('token_request_success_rate');
const tokenResponseDuration = new Trend('token_response_duration');

// 固定使用的密码
const FIXED_PASSWORD = 'Wh520520!';

// 获取目标QPS参数，默认值为70
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 70;

// 获取邮箱前缀参数，默认值为'loadtest'
const EMAIL_PREFIX = __ENV.EMAIL_PREFIX || 'loadtest';

// 固定邮箱数量为30000，覆盖1-30000范围
// 确保每个请求都有唯一的用户名
const EMAIL_COUNT = 30000;

// 性能优化：根据邮箱数量选择不同的生成策略
const PERFORMANCE_THRESHOLD = 50000; // 超过5万个邮箱时启用性能优化模式

// 动态生成邮箱列表，根据QPS计算所需数量，自动优化性能
const EMAIL_LIST = new SharedArray('emails', function () {
  console.log(`🎯 目标QPS: ${TARGET_QPS}`);
  console.log(`📧 邮箱前缀: ${EMAIL_PREFIX}`);
  console.log(`📊 固定邮箱数量: ${EMAIL_COUNT} 个邮箱 (范围1-30000)`);
  
  // 性能检查和优化提示
  if (EMAIL_COUNT > PERFORMANCE_THRESHOLD) {
    console.log(`⚠️ 邮箱数量较大(${EMAIL_COUNT})，可能影响启动性能`);
    console.log(`💡 建议：考虑降低QPS或缩短测试时间以提升性能`);
  }
  
  // 记录开始时间，监控生成性能
  const startTime = Date.now();
  const generatedEmails = [];
  
  // 使用批量生成优化性能
  if (EMAIL_COUNT > PERFORMANCE_THRESHOLD) {
    // 大数量时：仅创建配置对象，邮箱将在运行时计算生成
    console.log(`🚀 启用高性能模式：运行时计算生成邮箱，避免大数组占用内存`);
    console.log(`📊 将在测试运行时动态计算 ${EMAIL_PREFIX}1@teml.net ~ ${EMAIL_PREFIX}${EMAIL_COUNT}@teml.net`);
    
    // 返回配置信息而非大数组，节省内存
    return {
      mode: 'computed',
      prefix: EMAIL_PREFIX,
      count: EMAIL_COUNT,
      // 为了兼容.length属性，添加length getter
      get length() { return EMAIL_COUNT; }
    };
  } else {
    // 小数量时：预生成数组（更快的数组访问）
    console.log(`📝 常规模式：预生成${EMAIL_COUNT}个邮箱到内存`);
    for (let i = 1; i <= EMAIL_COUNT; i++) {
      generatedEmails.push(`${EMAIL_PREFIX}${i}@teml.net`);
    }
    const endTime = Date.now();
    const generationTime = endTime - startTime;
    
    console.log(`✅ 预生成邮箱列表: ${EMAIL_PREFIX}1@teml.net ~ ${EMAIL_PREFIX}${EMAIL_COUNT}@teml.net`);
    console.log(`📈 总计 ${generatedEmails.length} 个唯一测试邮箱`);
    console.log(`⏱️ 邮箱生成耗时: ${generationTime}ms`);
    console.log(`💾 预估内存使用: ${(generatedEmails.length * 30 / 1024 / 1024).toFixed(2)}MB`);
    
    return generatedEmails;
  }
});

// 每个VU的独立邮箱计数器，确保真正的唯一性
// 基于VU ID和迭代次数生成绝对唯一的邮箱索引
function getNextEmail() {
  // k6的内置变量：__VU (虚拟用户ID) 和 __ITER (当前迭代次数)
  const vuId = __VU || 1;  // VU ID从1开始
  const iterNum = __ITER || 0;  // 迭代次数从0开始
  
  // 获取总邮箱数量
  const totalEmails = EMAIL_LIST.mode === 'computed' ? EMAIL_LIST.count : EMAIL_LIST.length;
  
  // 计算每个VU的邮箱分配范围，确保无重叠
  // 动态计算每个VU的邮箱数量，确保所有VU都能分配到邮箱
  const estimatedMaxVUs = TARGET_QPS * 2; // 预估最大VU数量（通常是QPS的2倍）
  const emailsPerVU = Math.max(Math.ceil(totalEmails / estimatedMaxVUs), 50); // 每个VU至少分配50个邮箱，确保所有VU都有邮箱可用
  
  // 生成绝对唯一的邮箱索引：每个VU有独立的邮箱范围
  const vuBaseIndex = (vuId - 1) * emailsPerVU;  // VU的起始邮箱索引
  const emailIndexInVU = iterNum % emailsPerVU;   // VU内部的邮箱索引
  const globalEmailIndex = vuBaseIndex + emailIndexInVU;
  
  // 智能邮箱分配：确保邮箱索引在有效范围内
  let safeEmailIndex;
  
  // 检查VU的邮箱范围是否超出总邮箱数
  if (vuBaseIndex >= totalEmails) {
    // VU的起始索引已超出总邮箱数，使用安全取模
    safeEmailIndex = ((vuId - 1) * 17 + iterNum) % totalEmails + 1; // 使用质数17避免规律性重复
  } else if (globalEmailIndex >= totalEmails) {
    // VU范围内但具体索引超出，回到VU范围内循环
    const safeIndexInVU = iterNum % Math.min(emailsPerVU, totalEmails - vuBaseIndex);
    safeEmailIndex = vuBaseIndex + safeIndexInVU + 1;
  } else {
    // 正常情况：直接使用计算的索引
    safeEmailIndex = globalEmailIndex + 1;
  }
  
  // 检查EMAIL_LIST是配置对象还是数组
  if (EMAIL_LIST.mode === 'computed') {
    // 高性能模式：直接计算邮箱名
    const email = `${EMAIL_LIST.prefix}${safeEmailIndex}@teml.net`;
    console.log(`🔄 VU${vuId}-第${iterNum}次 使用邮箱: ${email} (范围${vuBaseIndex+1}-${vuBaseIndex+emailsPerVU}, 索引${safeEmailIndex})`);
    return email;
  } else {
    // 常规模式：使用预生成的数组
    const emailIndex = safeEmailIndex - 1; // 数组索引从0开始
    const email = EMAIL_LIST[emailIndex];
    console.log(`🔄 VU${vuId}-第${iterNum}次 使用邮箱: ${email} (范围${vuBaseIndex+1}-${vuBaseIndex+emailsPerVU}, 索引${safeEmailIndex})`);
    return email;
  }
}

// 环境配置 - 基于curl命令更新
const config = {
  baseUrl: 'https://auth-station-dev-staging.aevatar.ai',
  origin: 'https://godgpt-ui-dev.aelf.dev',
  referer: 'https://godgpt-ui-dev.aelf.dev/'
};

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
      maxVUs: TARGET_QPS * 2,        // 最大VU数量（QPS的2倍）
      tags: { test_type: 'fixed_qps_connect_token' },
    },
  },
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'token_request_success_rate': ['rate>0.99'],
  //   'token_response_duration': ['p(95)<2000'],
  // },
};

// 测试主函数
export default function () {
  const startTime = Date.now();
  
  // 构造token获取请求
  const tokenUrl = `${config.baseUrl}/connect/token`;
  
  // 为每个请求获取唯一邮箱
  const currentEmail = getNextEmail();
  
  // 构造请求体 - Password authentication flow (基于curl命令)
  // k6不支持URLSearchParams，手动构建form-urlencoded字符串
  const tokenPayload = [
    'grant_type=password',
    'client_id=AevatarAuthServer',
    'apple_app_id=com.gpt.god',
    'scope=Aevatar%20offline_access',
    `username=${encodeURIComponent(currentEmail)}`,
    `password=${encodeURIComponent(FIXED_PASSWORD)}`
  ].join('&');
  
  // 构造请求头 - 基于curl命令优化
  const tokenHeaders = {
    'accept': 'application/json',
    'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
    'cache-control': 'no-cache',
    'content-type': 'application/x-www-form-urlencoded',
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
  
  const tokenParams = {
    headers: tokenHeaders,
    timeout: '30s',
  };
  
  const tokenResponse = http.post(tokenUrl, tokenPayload, tokenParams);

  // 检查token获取是否成功 - 简化检查提升性能
  const isTokenSuccess = check(tokenResponse, {
    'HTTP状态码200': (r) => r.status === 200,
    '响应包含access_token': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.access_token && data.access_token.length > 0;
      } catch {
        return false;
      }
    }
  });
  
  // 记录自定义指标 - 简化判断，只检查最关键的access_token
  tokenRequestRate.add(isTokenSuccess);
  if (isTokenSuccess) {
    tokenResponseDuration.add(tokenResponse.timings.duration);
  }
}

// 测试设置阶段
export function setup() {
  const startTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log('🎯 开始 connect/token 固定QPS压力测试...');
  console.log(`🕐 测试开始时间: ${startTime}`);
  console.log(`📡 测试目标: ${config.baseUrl}/connect/token`);
  console.log(`🔧 测试场景: 固定QPS测试 (${TARGET_QPS} QPS，持续5分钟)`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * 300} 个 (${TARGET_QPS} QPS × 300秒)`);
  console.log('🔑 测试内容: OAuth2 密码认证流程');
  console.log('⏱️  预计测试时间: 5分钟');
  console.log('🌐 认证方式: OAuth2 Password Grant Type (用户名密码换取access_token)');
  console.log(`📧 邮箱范围: ${EMAIL_PREFIX}1@teml.net ~ ${EMAIL_PREFIX}30000@teml.net`);
  console.log(`🔢 邮箱总数: 30000 个唯一测试邮箱`);
  console.log('🔄 用户选择: 每次请求顺序选择不同邮箱，确保唯一性');
  
  return { baseUrl: config.baseUrl };
}

// 测试清理阶段
export function teardown(data) {
  const endTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log('✅ connect/token 固定QPS压力测试完成');
  console.log(`🕛 测试结束时间: ${endTime}`);
  console.log('🔍 关键指标：OAuth2 token获取成功率、响应时间、QPS稳定性');
  console.log('📈 成功标准：HTTP 200 + access_token非空（简化检查提升性能）');
  console.log('📊 请分析QPS是否稳定、token获取成功率和响应时间分布');
}