import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 2 QPS（每秒2个请求，持续1分钟，用于debug）
// 自定义目标QPS: k6 run -e TARGET_QPS=40 payment-apple-subscription-qps-test.js
// Debug模式: k6 run -e DEBUG=true payment-apple-subscription-qps-test.js
// 示例: k6 run -e TARGET_QPS=35 payment-apple-subscription-qps-test.js

// 自定义指标
const appleSubscriptionRate = new Rate('apple_subscription_check_success_rate');
const appleSubscriptionDuration = new Trend('apple_subscription_check_duration');

// 从配置文件加载环境配置
const config = JSON.parse(open('../../../config/env.dev.json'));

// 尝试从tokens.json文件加载token配置
let tokenConfig = {};
try {
  tokenConfig = JSON.parse(open('../../../config/tokens.json'));
} catch (error) {
  console.log('⚠️  未找到tokens.json配置文件，将使用环境变量或默认token');
}

// 获取目标QPS参数，默认值为2（debug模式）
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 2;
// Debug模式开关
const DEBUG_MODE = __ENV.DEBUG === 'true';

// 固定QPS压力测试场景配置
export const options = {
  scenarios: {
    // 固定QPS测试 - 恒定请求速率
    fixed_qps: {
      executor: 'constant-arrival-rate',
      rate: TARGET_QPS,              // 每秒请求数（QPS）
      timeUnit: '1s',                // 时间单位：1秒
      duration: TARGET_QPS <= 5 ? '1m' : '5m',  // Debug模式1分钟，正常模式5分钟
      preAllocatedVUs: Math.max(TARGET_QPS, 1),  // 预分配VU数量（至少为QPS数量）
      maxVUs: TARGET_QPS * 2,        // 最大VU数量（QPS的2倍）
      tags: { test_type: 'fixed_qps_apple_subscription' },
    },
  },
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'apple_subscription_check_success_rate': ['rate>0.99'],
  //   'apple_subscription_check_duration': ['p(95)<2000'],
  // },
};

// 测试主函数
export default function (data) {
  const startTime = Date.now();
  
  // 构造Apple订阅状态查询请求
  const appleSubscriptionUrl = `${data.baseUrl}/godgpt/payment/has-apple-subscription`;
  
  // 构造请求头 - 参照API文档格式，包含authorization token
  const appleSubscriptionHeaders = {
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
  
  const appleSubscriptionParams = {
    headers: appleSubscriptionHeaders,
    timeout: '30s',
  };
  
  const appleSubscriptionResponse = http.get(appleSubscriptionUrl, appleSubscriptionParams);

  // Debug信息：输出API响应详情
  if (DEBUG_MODE || TARGET_QPS <= 5) {
    console.log('🔍 ===== DEBUG 模式 - API响应详情 =====');
    console.log(`📍 请求URL: ${appleSubscriptionUrl}`);
    console.log(`📊 HTTP状态码: ${appleSubscriptionResponse.status}`);
    console.log(`⏰ 响应时间: ${appleSubscriptionResponse.timings.duration}ms`);
    console.log(`📦 响应体: ${appleSubscriptionResponse.body}`);
    console.log(`📋 响应头: ${JSON.stringify(appleSubscriptionResponse.headers, null, 2)}`);
    
    // 尝试解析JSON响应
    try {
      const responseData = JSON.parse(appleSubscriptionResponse.body);
      console.log('🔍 解析后的响应数据结构:');
      console.log(`   - code: ${responseData.code}`);
      console.log(`   - message: ${responseData.message}`);
      console.log(`   - data存在: ${responseData.data !== undefined ? '是' : '否'}`);
      if (responseData.data !== undefined) {
        console.log(`   - data类型: ${typeof responseData.data}`);
        if (typeof responseData.data === 'object' && responseData.data !== null) {
          console.log(`   - hasSubscription字段: ${responseData.data.hasSubscription !== undefined ? '存在' : '不存在'}`);
          if (responseData.data.hasSubscription !== undefined) {
            console.log(`   - hasSubscription值: ${responseData.data.hasSubscription}`);
          }
          console.log(`   - data完整内容: ${JSON.stringify(responseData.data, null, 2)}`);
        } else {
          console.log(`   - data值: ${JSON.stringify(responseData.data)}`);
        }
      }
    } catch (e) {
      console.log(`❌ 响应体解析失败: ${e.message}`);
    }
    console.log('🔍 ========== DEBUG 结束 ==========');
  }

  // 检查Apple订阅状态查询是否成功 - HTTP状态码200 + 业务code为20000
  const isAppleSubscriptionSuccess = check(appleSubscriptionResponse, {
    'HTTP状态码200': (r) => r.status === 200,
    '业务代码20000': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.code === "20000";
      } catch {
        return false;
      }
    },
    '响应数据结构正确': (r) => {
      try {
        const data = JSON.parse(r.body);
        // data字段存在且包含hasSubscription字段，或者data本身就是布尔值
        return data.data !== undefined && (
          (typeof data.data === 'object' && data.data !== null && data.data.hasSubscription !== undefined) ||
          (typeof data.data === 'boolean')
        );
      } catch {
        return false;
      }
    }
  });

  // 记录自定义指标 - 只有业务成功才计入成功
  appleSubscriptionRate.add(isAppleSubscriptionSuccess);
  if (isAppleSubscriptionSuccess) {
    appleSubscriptionDuration.add(appleSubscriptionResponse.timings.duration);
  }
}

// 测试设置阶段 - 使用通用的auth setup函数
export function setup() {
  console.log('🎯 开始 godgpt/payment/has-apple-subscription 固定QPS压力测试...');
  console.log(`📡 测试目标: ${config.baseUrl}/godgpt/payment/has-apple-subscription`);
  
  const testDuration = TARGET_QPS <= 5 ? 60 : 300; // 1分钟或5分钟
  const durationText = TARGET_QPS <= 5 ? '1分钟' : '5分钟';
  
  console.log(`🔧 测试场景: 固定QPS测试 (${TARGET_QPS} QPS，持续${durationText})`);
  console.log(`⚡ 目标QPS: ${TARGET_QPS} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${TARGET_QPS * testDuration} 个 (${TARGET_QPS} QPS × ${testDuration}秒)`);
  console.log('🍎 测试内容: 检查Apple订阅状态');
  console.log(`⏱️  预计测试时间: ${durationText}`);
  
  if (DEBUG_MODE || TARGET_QPS <= 5) {
    console.log('🔍 DEBUG模式已启用 - 将显示详细的API响应信息');
  }
  
  return setupTest(config, tokenConfig);
}

// 测试清理阶段 - 使用通用的teardown函数
export function teardown(data) {
  console.log('✅ godgpt/payment/has-apple-subscription 固定QPS压力测试完成');
  console.log('🔍 关键指标：Apple订阅状态查询成功率、响应时间、QPS稳定性');
  console.log('📈 请分析QPS是否稳定、响应时间分布和系统资源使用情况');
  teardownTest(data);
}