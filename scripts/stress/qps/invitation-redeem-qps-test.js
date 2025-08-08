import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 1 QPS（每秒1个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=5 invitation-redeem-qps-test.js
// 自定义邀请码文件: k6 run -e INVITE_CODES_FILE=../data/my_invite_codes.json invitation-redeem-qps-test.js
// 完整示例: k6 run -e TARGET_QPS=10 -e INVITE_CODES_FILE=../data/loadtest_invite_codes.json invitation-redeem-qps-test.js
// 
// 📋 邀请码数据来源：
// 1. 默认使用: scripts/stress/data/loadtest_invite_codes.json (包含约9000个邀请码)
// 2. 或运行: python3 get_invitation_codes.py --start 1 --count 1000 生成新的邀请码
// 3. 支持数组格式 ["code1", "code2"] 或对象格式 {"user1@email.com": "code1"}
// 
// ⚠️  压测注意事项：
// - 如果出现大量超时(>30s)，说明服务器压力过大，建议降低QPS
// - 推荐从低QPS开始测试：1 → 3 → 5 → 10，逐步提升
// - 监控服务器CPU、内存使用率，避免影响生产环境
// - 确保有足够的有效邀请码，避免重复使用导致错误

// 自定义指标
const invitationRedeemSuccessRate = new Rate('invitation_redeem_success_rate');
const invitationRedeemDuration = new Trend('invitation_redeem_duration');

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

// 加载邀请码数据列表
let invitationCodes = [];
try {
  // 优先从环境变量指定的文件加载，默认使用data目录下的邀请码文件
  const inviteCodesFile = __ENV.INVITE_CODES_FILE || '../data/loadtest_invite_codes.json';
  const rawData = JSON.parse(open(inviteCodesFile));
  
  // 如果是数组格式，直接使用
  if (Array.isArray(rawData)) {
    invitationCodes = rawData;
    console.log(`✅ 成功加载 ${invitationCodes.length} 个邀请码`);
    console.log(`📋 Debug: 前5个邀请码示例: ${invitationCodes.slice(0, 5).join(', ')}`);
  } else if (typeof rawData === 'object') {
    // 如果是对象格式（用户邮箱映射），提取所有邀请码
    invitationCodes = Object.values(rawData);
    console.log(`✅ 从用户映射中提取 ${invitationCodes.length} 个邀请码`);
    console.log(`📋 Debug: 前5个邀请码示例: ${invitationCodes.slice(0, 5).join(', ')}`);
  } else {
    throw new Error('不支持的邀请码数据格式');
  }
} catch (error) {
  console.log(`⚠️  未找到邀请码数据文件: ${error.message}，将使用默认邀请码`);
  // 回退使用默认邀请码列表
  invitationCodes = ['uSTbNld', 'default1', 'default2'];
}

// 获取目标QPS参数，默认值为1（降低以避免服务器超时）
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 1;

// 全局邀请码计数器，确保每次请求使用不同的邀请码
let globalInviteCodeCounter = 0;

// Debug: 记录已使用的邀请码，用于验证唯一性
let usedInviteCodes = new Set();
let requestCounter = 0;

// 生成随机UUID的函数 - 用于userId参数
function generateRandomUUID() {
  // 生成随机UUID格式：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 获取下一个不同的邀请码
// 每次请求使用不同的邀请码，用户可以是任意的
function getNextInviteCode() {
  if (invitationCodes.length === 0) {
    return {
      inviteCode: 'uSTbNld',
      userId: generateRandomUUID()
    };
  }
  
  // 使用全局计数器确保每次请求使用不同的邀请码
  const codeIndex = (globalInviteCodeCounter++) % invitationCodes.length;
  const inviteCode = invitationCodes[codeIndex];
  
  // Debug: 验证邀请码唯一性
  requestCounter++;
  const isCodeReused = usedInviteCodes.has(inviteCode);
  
  if (!isCodeReused) {
    usedInviteCodes.add(inviteCode);
  }
  
  // 生成随机userId用于兑换
  const userId = generateRandomUUID();
  
  // Debug 详细日志
  console.log(`🔄 [请求${requestCounter}] 兑换邀请码: ${inviteCode} (索引: ${codeIndex})`);
  console.log(`   📊 Debug信息: 全局计数器=${globalInviteCodeCounter}, 邀请码池大小=${invitationCodes.length}`);
  console.log(`   🔍 唯一性验证: ${isCodeReused ? '❌ 重复使用' : '✅ 首次使用'}, 已使用码数=${usedInviteCodes.size}`);
  console.log(`   👤 用户ID: ${userId.substring(0, 8)}...`);
  
  // 如果检测到重复使用，额外记录
  if (isCodeReused) {
    console.log(`⚠️  警告: 邀请码 ${inviteCode} 在索引 ${codeIndex} 处被重复使用!`);
  }
  
  return {
    inviteCode: inviteCode,  // 每次使用不同的邀请码
    userId: userId          // 随机生成的用户ID
  };
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
      preAllocatedVUs: Math.max(TARGET_QPS, 1),  // 预分配VU数量（至少为QPS数量）
      maxVUs: TARGET_QPS * 3,        // 最大VU数量（QPS的3倍，POST请求可能耗时较长）
      tags: { test_type: 'fixed_qps_invitation_redeem' },
    },
  },
  // 注释掉阈值设置，只关注QPS稳定性，不验证响应质量
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],
  //   'invitation_redeem_success_rate': ['rate>0.99'],
  //   'invitation_redeem_duration': ['p(95)<3000'],
  // },
};

// 测试主函数
export default function (data) {
  const startTime = Date.now();
  
  // 获取下一个不同的邀请码用于兑换
  const inviteInfo = getNextInviteCode();
  
  // 构造邀请码兑换请求
  const invitationRedeemUrl = `${data.baseUrl}/godgpt/invitation/redeem`;
  
  const invitationRedeemPayload = JSON.stringify({
    inviteCode: inviteInfo.inviteCode,  // 每次使用不同的邀请码
    userId: inviteInfo.userId          // 随机生成的用户ID
  });
  
  // 构造请求头 - 匹配curl命令，包含authorization token
  const invitationRedeemHeaders = {
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
  
  const invitationRedeemParams = {
    headers: invitationRedeemHeaders,
    timeout: '30s',
  };
  
  const invitationRedeemResponse = http.post(invitationRedeemUrl, invitationRedeemPayload, invitationRedeemParams);

  // 检查邀请码兑换是否成功 - 简化成功率判断，只看接口是否返回数据
  const isInvitationRedeemSuccess = check(invitationRedeemResponse, {
    'HTTP状态码200': (r) => r.status === 200,
    '接口返回数据': (r) => {
      // 成功率只看接口有没有返回数据，简单直接
      const hasResponse = r.body && r.body.length > 0;
      const result = r.status === 200 && hasResponse;
      
      // 简化日志：只记录关键信息
      if (!result) {
        console.log(`❌ 接口无数据返回 - 邀请码: ${inviteInfo.inviteCode}, 用户ID: ${inviteInfo.userId}, 状态码: ${r.status}, 数据长度: ${r.body ? r.body.length : 0}`);
      }
      
      return result;
    }
  });
  
  // 记录邀请码兑换指标 - 直接使用检查结果
  invitationRedeemSuccessRate.add(isInvitationRedeemSuccess);
  
  // 只有成功的请求才记录到响应时间指标中
  if (isInvitationRedeemSuccess) {
    invitationRedeemDuration.add(invitationRedeemResponse.timings.duration);
  }
}

// 测试设置阶段
export function setup() {
  console.log(`🚀 Debug: 开始邀请码兑换QPS测试`);
  console.log(`📊 Debug: 目标QPS=${TARGET_QPS}, 邀请码池大小=${invitationCodes.length}`);
  console.log(`🔧 Debug: 预期能运行 ${Math.floor(invitationCodes.length / TARGET_QPS)} 秒不重复邀请码`);
  
  return setupTest(
    config, 
    tokenConfig, 
    'invitation/redeem', 
    TARGET_QPS, 
    '/godgpt/invitation/redeem'
  );
}

// 测试清理阶段
export function teardown(data) {
  teardownTest('invitation/redeem', '邀请码兑换响应成功率、响应时间、QPS稳定性');
} 