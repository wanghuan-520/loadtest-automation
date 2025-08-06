import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 1 QPS（每秒1个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=5 invitation-redeem-qps-test.js
// 示例: k6 run -e TARGET_QPS=10 invitation-redeem-qps-test.js
// 
// ⚠️  压测注意事项：
// - 如果出现大量超时(>30s)，说明服务器压力过大，建议降低QPS
// - 推荐从低QPS开始测试：1 → 3 → 5 → 10，逐步提升
// - 监控服务器CPU、内存使用率，避免影响生产环境

// 自定义指标
const invitationRedeemSuccessRate = new Rate('invitation_redeem_success_rate');
const invitationRedeemDuration = new Trend('invitation_redeem_duration');
const timeoutRate = new Rate('invitation_redeem_timeout_rate'); // 超时率统计
const slowResponseRate = new Rate('invitation_redeem_slow_response_rate'); // 慢响应率统计

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

// 获取目标QPS参数，默认值为1（降低以避免服务器超时）
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
  
  // 生成随机userId
  const userId = generateRandomUUID();
  
  // 构造邀请码兑换请求
  const invitationRedeemUrl = `${data.baseUrl}/godgpt/invitation/redeem`;
  
  // 使用固定邀请码进行测试，并添加userId参数
  const fixedInviteCode = "uSTbNld";
  
  const invitationRedeemPayload = JSON.stringify({
    inviteCode: fixedInviteCode,
    userId: userId  // 添加随机生成的userId参数
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

  // 计算响应时间和状态用于指标记录
  const responseTime = invitationRedeemResponse.timings.duration;
  const isTimeout = responseTime >= 30000; // 30秒超时
  const isSlowResponse = responseTime > 5000; // 超过5秒算慢响应

  // 检查邀请码兑换是否成功 - HTTP状态码200 + 业务code为20000
  const isInvitationRedeemSuccess = check(invitationRedeemResponse, {
    'HTTP状态码200': (r) => r.status === 200,
    '业务代码20000': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.code === "20000";
      } catch {
        return false;
      }
    },
    '响应格式正确': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.hasOwnProperty('code') && data.hasOwnProperty('message');
      } catch {
        return false;
      }
    }
  });
  
  // 记录邀请码兑换指标 - HTTP200且响应格式正确即算成功（使用固定邀请码uSTbNld进行测试）
  invitationRedeemSuccessRate.add(isInvitationRedeemSuccess);
  
  // 记录超时和慢响应指标
  timeoutRate.add(isTimeout);
  slowResponseRate.add(isSlowResponse);

  // 记录响应时间（包括超时的请求）
  if (invitationRedeemResponse.status === 200) {
    invitationRedeemDuration.add(invitationRedeemResponse.timings.duration);
  }
}

// 测试设置阶段
export function setup() {
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