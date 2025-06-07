import { group } from 'k6';
import http from 'k6/http';
import { Auth } from '../../libs/auth.js';
import { validateResponse, sleepWithJitter } from '../../libs/utils.js';

// Load environment config
const environments = {
  dev: JSON.parse(open('../../config/env.dev.json')),
  prod: JSON.parse(open('../../config/env.prod.json'))
};

const env = environments[__ENV.ENVIRONMENT || 'dev'];

// Test configuration
export const options = {
  stages: env.stages.smoke,
  thresholds: env.thresholds
};

// Initialize auth
const auth = new Auth();

export function setup() {
  return { token: auth.login() };
}

export default function(data) {
  const headers = auth.getAuthHeaders();

  group('Health Check', function() {
    const response = http.get(`${env.baseUrl}/health`, { headers });
    validateResponse(response);
    sleepWithJitter(1, 2);
  });

  group('Basic API Test', function() {
    const response = http.get(`${env.baseUrl}/api/test`, { headers });
    validateResponse(response);
    sleepWithJitter(1, 2);
  });
} 