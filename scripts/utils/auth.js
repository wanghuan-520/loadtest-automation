import http from 'k6/http';

/**
 * 动态获取Bearer Token的函数 (使用password模式认证)
 * 优先级：环境变量BEARER_TOKEN > 动态获取(使用用户名密码) > 配置文件回退
 * 
 * 环境变量说明：
 * - BEARER_TOKEN: 直接指定token，跳过动态获取
 * - AUTH_USERNAME: 认证用户名 (默认: loadtestloadwh1@teml.net)
 * - AUTH_PASSWORD: 认证密码 (默认: Wh520520!)
 * 
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
  
  // 从环境变量获取用户名和密码，或使用默认值
  const username = __ENV.AUTH_USERNAME || 'loadtestloadwh1@teml.net';
  const password = __ENV.AUTH_PASSWORD || 'Wh520520!';
  
  // 动态获取token - 使用password模式
  const tokenResponse = http.post('https://auth-station-dev-staging.aevatar.ai/connect/token', {
    'grant_type': 'password',
    'client_id': 'AevatarAuthServer',
    'apple_app_id': 'com.gpt.god',
    'scope': 'Aevatar offline_access',
    'username': username,
    'password': password
  }, {
    headers: {
      'accept': 'application/json',
      'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
      'content-type': 'application/x-www-form-urlencoded',
      'origin': 'https://godgpt-ui-testnet.aelf.dev',
      'referer': 'https://godgpt-ui-testnet.aelf.dev/',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
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
  const startTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`🎯 开始 ${testName} 固定QPS压力测试...`);
  console.log(`🕐 测试开始时间: ${startTime}`);
  console.log(`📡 测试目标: ${config.baseUrl}${apiEndpoint}`);
  console.log(`🔧 测试场景: 固定QPS测试 (${targetQps} QPS，持续5分钟)`);
  console.log(`⚡ 目标QPS: ${targetQps} (可通过 TARGET_QPS 环境变量配置)`);
  console.log(`🔄 预估总请求数: ${targetQps * 300} 个 (${targetQps} QPS × 300秒)`);
  console.log('🔐 认证方式: 动态获取Bearer Token (password模式)');
  console.log('   - 可通过 BEARER_TOKEN 环境变量直接指定token');
  console.log('   - 可通过 AUTH_USERNAME 和 AUTH_PASSWORD 环境变量指定认证凭据');
  console.log(`💡 使用示例: k6 run -e TARGET_QPS=${targetQps} ${testName ? testName.toLowerCase().replace(/\//g, '-') : 'test'}-qps-test.js`);
  
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
  const endTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`✅ ${testName} 固定QPS压力测试完成`);
  console.log(`🕛 测试结束时间: ${endTime}`);
  console.log(`🔍 关键指标：${keyMetrics}`);
  console.log('📈 请分析QPS是否稳定、响应时间分布和系统资源使用情况');
} 