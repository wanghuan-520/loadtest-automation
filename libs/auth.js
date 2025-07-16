import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';


// Load environment config
const environments = {
  dev: JSON.parse(open('../config/env.dev.json')),
  prod: JSON.parse(open('../config/env.prod.json'))
};

const env = environments[__ENV.ENVIRONMENT || 'dev'];

export class Auth {
  constructor() {
    this.token = null;
    this.baseUrl = env.baseUrl;
    this.authEndpoint = env.auth.endpoint;
  }

  login() {
    const payload = {
      username: __ENV.USERNAME,
      password: __ENV.PASSWORD
    };

    const response = http.post(
      `${this.baseUrl}${this.authEndpoint}`,
      JSON.stringify(payload),
      { headers: { 'Content-Type': 'application/json' } }
    );

    check(response, {
      'login successful': (r) => r.status === 200,
      'token received': (r) => r.json('token') !== undefined,
    });

    if (response.status === 200) {
      this.token = response.json('token');
      return this.token;
    }

    throw new Error(`Login failed: ${response.status} ${response.body}`);
  }

  getAuthHeaders() {
    if (!this.token) {
      this.login();
    }
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  refreshToken() {
    // Implement token refresh logic here
    this.login();
  }
} 