import http from 'k6/http';

/**
 * 动态获取Bearer Token的函数
 * 优先级：环境变量 > 动态获取 > 配置文件回退
 * @param {Object} tokenConfig - tokens.json配置对象
 * @returns {string} Bearer Token
 */
export function getAccessToken(tokenConfig = {}) {
  // 如果环境变量提供了token，直接使用
  if (__ENV.BEARER_TOKEN) {
    console.log('🔐 使用环境变量提供的Bearer Token');
    return __ENV.BEARER_TOKEN;
  }

  console.log('🔄 正在动态获取Bearer Token...');
  
  // 动态获取token
  const tokenResponse = http.post('https://auth-station-dev-staging.aevatar.ai/connect/token', {
    'grant_type': 'client_credentials',
    'client_id': 'Test',
    'client_secret': 'Test123',
    'scope': 'Aevatar'
  }, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  if (tokenResponse.status === 200) {
    const tokenData = JSON.parse(tokenResponse.body);
    console.log('🔐 动态获取token成功，有效期: ' + Math.floor(tokenData.expires_in / 3600) + '小时');
    return tokenData.access_token;
  } else {
    console.error('❌ 动态获取token失败:', tokenResponse.status, tokenResponse.body);
    // 回退到配置文件中的token
    console.log('🔄 回退到配置文件中的token');
    return tokenConfig.user_bearer_token || '';
  }
}

/**
 * 通用的测试setup函数辅助方法
 * @param {Object} config - 环境配置
 * @param {Object} tokenConfig - token配置
 * @param {string} testName - 测试名称
 * @param {number} targetQps - 目标QPS
 * @param {string} apiEndpoint - API端点描述
 * @param {string} additionalInfo - 额外信息（可选）
 * @returns {Object} setup返回的数据对象
 */
export function setupTest(config, tokenConfig, testName, targetQps, apiEndpoint, additionalInfo = '') {
  console.log(`🎯 开始 ${testName} 固定QPS压力测试...`);
  console.log(`📡 测试目标: ${config.baseUrl}${apiEndpoint}`);
  console.log(`🔧 测试场景: 固定QPS测试 (${targetQps} QPS，持续5分钟)`);
  console.log(`⚡ 目标QPS: ${targetQps} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${targetQps * 300} 个 (${targetQps} QPS × 300秒)`);
  console.log('🔐 认证方式: 动态获取Bearer Token (可通过 BEARER_TOKEN 环境变量覆盖)');
  console.log(`💡 使用示例: k6 run -e TARGET_QPS=${targetQps} ${testName.toLowerCase().replace(/\//g, '-')}-qps-test.js`);
  
  if (additionalInfo) {
    console.log(additionalInfo);
  }
  
  console.log('⏱️  预计测试时间: 5分钟');
  
  // 动态获取Bearer Token
  const bearerToken = getAccessToken(tokenConfig);
  if (!bearerToken) {
    throw new Error('❌ 无法获取有效的Bearer Token');
  }
  
  return { 
    baseUrl: config.baseUrl,
    bearerToken: bearerToken
  };
}

/**
 * 通用的测试teardown函数辅助方法
 * @param {string} testName - 测试名称
 * @param {string} keyMetrics - 关键指标描述
 */
export function teardownTest(testName, keyMetrics) {
  console.log(`✅ ${testName} 固定QPS压力测试完成`);
  console.log(`🔍 关键指标：${keyMetrics}`);
  console.log('📈 请分析QPS是否稳定、响应时间分布和系统资源使用情况');
} 