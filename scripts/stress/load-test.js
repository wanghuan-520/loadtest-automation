import { group, sleep } from 'k6';
import http from 'k6/http';
import { Trend, Counter } from 'k6/metrics';
import { Auth } from '../../libs/auth.js';
import { validateResponse, generateRandomString, GroupDurationTracker } from '../../libs/utils.js';

// Custom metrics
const createUserTrend = new Trend('create_user_duration');
const successfulCreations = new Counter('successful_user_creations');

// Load environment config
const environments = {
  dev: JSON.parse(open('../../config/env.dev.json')),
  prod: JSON.parse(open('../../config/env.prod.json'))
};

const env = environments[__ENV.ENVIRONMENT || 'dev'];

// Test configuration
export const options = {
  stages: env.stages.stress,
  thresholds: {
    ...env.thresholds,
    'create_user_duration': ['p(95) < 500'],
    'successful_user_creations': ['count > 100']
  }
};

// Initialize auth
const auth = new Auth();

export function setup() {
  return { token: auth.login() };
}

export default function(data) {
  const headers = auth.getAuthHeaders();
  const tracker = new GroupDurationTracker();

  group('Create User', function() {
    tracker.start();

    const payload = {
      username: `test_user_${generateRandomString()}`,
      email: `test_${generateRandomString()}@example.com`,
      password: generateRandomString(12)
    };

    const response = http.post(
      `${env.baseUrl}/api/users`,
      JSON.stringify(payload),
      { headers }
    );

    if (validateResponse(response, 201)) {
      successfulCreations.add(1);
    }

    createUserTrend.add(tracker.end());
    sleep(1);
  });

  group('Get Users', function() {
    const response = http.get(`${env.baseUrl}/api/users`, { headers });
    validateResponse(response);
    sleep(1);
  });

  group('Update User', function() {
    const userId = '123'; // In real tests, this would be dynamic
    const payload = {
      email: `updated_${generateRandomString()}@example.com`
    };

    const response = http.put(
      `${env.baseUrl}/api/users/${userId}`,
      JSON.stringify(payload),
      { headers }
    );

    validateResponse(response);
    sleep(1);
  });
} 