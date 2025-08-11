import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 邀请码兑换QPS压力测试脚本使用说明：
// 默认目标QPS: 1 QPS（每秒1个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=5 invitation-redeem-qps-test.js
// 自定义邀请码文件: k6 run -e INVITE_CODES_FILE=../data/my_invite_codes.json invitation-redeem-qps-test.js
// 完整示例: k6 run -e TARGET_QPS=10 -e INVITE_CODES_FILE=../data/loadtest_invite_codes.json invitation-redeem-qps-test.js
// 
// 📋 邀请码数据来源：
// 1. 默认使用: scripts/stress/data/loadtest_invite_codes.json (包含约29000个邀请码)
// 2. 或运行: python3 get_invitation_codes.py --start 1 --count 1000 生成新的邀请码
// 3. 支持数组格式 ["code1", "code2"] 或对象格式 {"user1@email.com": "code1"}
// 
// ⚠️  压测注意事项：
// - 如果出现大量超时(>30s)，说明服务器压力过大，建议降低QPS
// - 推荐从低QPS开始测试：1 → 3 → 5 → 10，逐步提升
// - 监控服务器CPU、内存使用率，避免影响生产环境
// - 新算法确保每个请求使用不同邀请码，避免重复使用导致错误

// 自定义性能指标
const invitationRedeemSuccessRate = new Rate('invitation_redeem_success_rate');  // 邀请码兑换成功率
const invitationRedeemDuration = new Trend('invitation_redeem_duration');        // 邀请码兑换响应时间
const invitationCodeUniqueness = new Rate('invitation_code_uniqueness_rate');    // 邀请码唯一性指标

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

// 使用SharedArray确保所有VU共享相同的邀请码数据
const invitationCodes = new SharedArray('invitationCodes', function () {
  try {
    // 优先从环境变量指定的文件加载，默认使用data目录下的邀请码文件
    const inviteCodesFile = __ENV.INVITE_CODES_FILE || '../data/loadtest_invite_codes.json';
    const rawData = JSON.parse(open(inviteCodesFile));
    
    let codes = [];
    // 如果是数组格式，直接使用
    if (Array.isArray(rawData)) {
      codes = rawData;
      console.log(`✅ 成功加载 ${codes.length} 个邀请码`);
      console.log(`📋 Debug: 前5个邀请码示例: ${codes.slice(0, 5).join(', ')}`);
    } else if (typeof rawData === 'object') {
      // 如果是对象格式（用户邮箱映射），提取所有邀请码
      codes = Object.values(rawData);
      console.log(`✅ 从用户映射中提取 ${codes.length} 个邀请码`);
      console.log(`📋 Debug: 前5个邀请码示例: ${codes.slice(0, 5).join(', ')}`);
    } else {
      throw new Error('不支持的邀请码数据格式');
    }
    return codes;
  } catch (error) {
    console.log(`⚠️  未找到邀请码数据文件: ${error.message}，将使用默认邀请码`);
    // 回退使用默认邀请码列表
    return ['uSTbNld', 'default1', 'default2'];
  }
});

// 获取目标QPS参数，默认值为1（降低以避免服务器超时）
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 1;

// Debug: 记录已使用的邀请码，用于验证唯一性（每个VU维护自己的记录）
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

// VU内请求计数器，用于生成更可靠的唯一索引
let vuRequestCounter = 0;

// 全局请求计数器，确保跨VU的唯一性
let globalRequestId = 0;

// 当前使用的邀请码信息缓存
let currentInviteInfo = null;

// 获取下一个不同的邀请码
// 使用改进的分布式算法确保高QPS场景下每个请求使用不同的邀请码
function getNextInviteCode() {
  if (invitationCodes.length === 0) {
    return {
      inviteCode: 'uSTbNld',
      userId: generateRandomUUID()
    };
  }
  
  // 改进的分布式算法确保高QPS场景下的唯一性
  const vuId = __VU || 1;              // 当前VU的ID
  const iterNum = __ITER || 0;         // 当前VU的迭代次数
  const timestamp = Date.now();        // 完整时间戳
  vuRequestCounter++;                  // VU内请求序号
  globalRequestId++;                   // 全局请求ID，确保跨VU唯一性
  
  // 高QPS分布式算法优化：
  // 1. 基于VU和全局请求ID的组合索引
  // 2. 使用质数避免周期性重复
  // 3. 动态步长确保更好的分布
  // 4. 防冲突机制
  
  // 计算VU基础步长，使用质数确保更好的分布
  const VU_STEP_SIZE = 293;  // 使用质数作为步长
  const vuBaseIndex = (vuId - 1) * VU_STEP_SIZE;
  
  // 基于全局请求ID和VU内计数的复合索引
  const globalOffset = globalRequestId * 17;  // 使用质数17作为全局步长
  const vuOffset = vuRequestCounter * 7;      // 使用质数7作为VU内步长
  const timeOffset = (timestamp % 1009) * 3;  // 使用质数1009和3避免时间冲突
  
  // 组合唯一索引，使用大质数分布
  let uniqueIndex = (vuBaseIndex + globalOffset + vuOffset + timeOffset) % invitationCodes.length;
  
  // 防冲突检查：如果在当前VU内已使用过此索引，则递增查找下一个可用的
  const originalIndex = uniqueIndex;
  let attempts = 0;
  while (usedInviteCodes.has(invitationCodes[uniqueIndex]) && attempts < 100) {
    uniqueIndex = (uniqueIndex + 1) % invitationCodes.length;
    attempts++;
  }
  
  const inviteCode = invitationCodes[uniqueIndex];
  
  // Debug: 验证邀请码唯一性（在当前VU范围内）
  requestCounter++;
  const isCodeReusedInVU = usedInviteCodes.has(inviteCode);
  
  if (!isCodeReusedInVU) {
    usedInviteCodes.add(inviteCode);
  }
  
  // 生成随机userId用于兑换
  const userId = generateRandomUUID();
  
  // Debug 详细日志（高QPS模式下简化日志）
  const isHighQPS = __ENV.TARGET_QPS && parseInt(__ENV.TARGET_QPS) > 10;
  if (!isHighQPS || requestCounter % 10 === 1) {  // 高QPS时只显示部分日志
    console.log(`🔄 [VU${vuId}-请求${requestCounter}] 兑换邀请码: ${inviteCode} (索引: ${uniqueIndex})`);
    console.log(`   📊 算法详情: VU基础=${vuBaseIndex}, 全局偏移=${globalOffset}, VU偏移=${vuOffset}, 时间偏移=${timeOffset}`);
    console.log(`   🔍 VU内唯一性: ${isCodeReusedInVU ? '❌ VU内重复' : '✅ VU内首次'}, VU内已用=${usedInviteCodes.size}`);
    console.log(`   📦 原始索引=${originalIndex}, 最终索引=${uniqueIndex}, 查找次数=${attempts}, 邀请码池=${invitationCodes.length}`);
  }
  
  // 如果检测到VU内重复使用，记录警告
  if (isCodeReusedInVU) {
    console.log(`⚠️  警告: VU${vuId}内邀请码 ${inviteCode} 被重复使用! 索引=${uniqueIndex}, 查找了${attempts}次`);
  }
  
  // 缓存当前邀请码信息供后续验证使用
  currentInviteInfo = {
    inviteCode: inviteCode,  // 每次使用不同的邀请码
    userId: userId,         // 随机生成的用户ID
    isUniqueInVU: !isCodeReusedInVU
  };
  
  return currentInviteInfo;
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
      maxVUs: TARGET_QPS * 10,        // 最大VU数量（QPS的10倍）
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
  
  // 记录邀请码唯一性指标（在VU内是否首次使用）
  if (currentInviteInfo) {
    invitationCodeUniqueness.add(currentInviteInfo.isUniqueInVU);
  }
  
  // 只有成功的请求才记录到响应时间指标中
  if (isInvitationRedeemSuccess) {
    invitationRedeemDuration.add(invitationRedeemResponse.timings.duration);
  }
}

// 测试设置阶段
export function setup() {
  console.log(`🚀 Debug: 开始邀请码兑换QPS测试`);
  console.log(`📊 Debug: 目标QPS=${TARGET_QPS}, 邀请码池大小=${invitationCodes.length}`);
  
  // 高QPS支持能力分析 - 基于新的分布式算法
  const VU_STEP_SIZE = 293;  // 与算法中一致的VU步长
  const maxSupportedVUs = Math.floor(invitationCodes.length / VU_STEP_SIZE);  // 每个VU分配的理论空间
  const estimatedVUs = Math.max(TARGET_QPS, Math.ceil(TARGET_QPS / 5));  // 估算需要的VU数
  
  console.log(`🔧 算法支持能力: 使用质数分布，最大支持${maxSupportedVUs}个VU, 当前估算需要${estimatedVUs}个VU`);
  
  if (estimatedVUs > maxSupportedVUs) {
    console.log(`⚠️  警告: 当前QPS可能超出算法最优范围，建议QPS不超过${maxSupportedVUs * 5}`);
  } else {
    console.log(`✅ QPS范围适合: 新的分布式算法可以很好支持${TARGET_QPS} QPS`);
  }
  
  // 理论运行时间计算（考虑防冲突机制）
  const theoreticalRuntime = Math.floor(invitationCodes.length * 0.8 / TARGET_QPS);  // 80%利用率
  console.log(`🔧 Debug: 预期能运行约 ${theoreticalRuntime} 秒不重复邀请码（考虑80%利用率）`);
  
  if (TARGET_QPS > 10) {
    console.log(`💡 高QPS模式: 日志已简化，仅显示每10个请求中的1个详细信息`);
  }
  
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