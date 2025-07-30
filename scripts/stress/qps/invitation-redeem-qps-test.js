import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getAccessToken, setupTest, teardownTest } from '../../utils/auth.js';

// 使用说明：
// 默认目标QPS: 20 QPS（每秒20个请求，持续5分钟）
// 自定义目标QPS: k6 run -e TARGET_QPS=30 invitation-redeem-qps-test.js
// 示例: k6 run -e TARGET_QPS=25 invitation-redeem-qps-test.js

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

// 获取目标QPS参数，默认值为20
const TARGET_QPS = __ENV.TARGET_QPS ? parseInt(__ENV.TARGET_QPS) : 20;

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
  
  // 构造邀请码兑换请求
  const invitationRedeemUrl = `${data.baseUrl}/godgpt/invitation/redeem`;
  
  // 生成随机邀请码进行测试（实际环境中应该是有效的邀请码）
  const randomInviteCode = `TEST_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  
  const invitationRedeemPayload = JSON.stringify({
    inviteCode: randomInviteCode
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

  // 检查邀请码兑换是否成功 - HTTP状态码200（业务失败也可能返回200）
  const isInvitationRedeemSuccess = check(invitationRedeemResponse, {
    'HTTP状态码200': (r) => r.status === 200,
    '响应格式正确': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.hasOwnProperty('code') && data.hasOwnProperty('message');
      } catch {
        return false;
      }
    }
  });
  
  // 记录邀请码兑换指标 - HTTP200且响应格式正确即算成功（由于使用随机邀请码，业务失败是预期的）
  invitationRedeemSuccessRate.add(isInvitationRedeemSuccess);

  // 记录响应时间
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