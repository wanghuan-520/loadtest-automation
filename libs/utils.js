import { check } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
export const errorRate = new Rate('errors');

// Response validation
export function validateResponse(response, expectedStatus = 200) {
  const checks = {
    'status is ok': (r) => r.status === expectedStatus,
    'response body is not empty': (r) => r.body.length > 0,
  };
  
  const checkResult = check(response, checks);
  errorRate.add(!checkResult);
  return checkResult;
}

// Random data generation
export function generateRandomString(length = 10) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

// Sleep with jitter
export function sleepWithJitter(min, max) {
  const jitter = Math.random() * (max - min) + min;
  sleep(jitter);
}

// Format timestamp
export function formatTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

// Load test data from JSON file
export function loadTestData(filePath) {
  try {
    return JSON.parse(open(filePath));
  } catch (error) {
    console.error(`Error loading test data from ${filePath}: ${error.message}`);
    return null;
  }
}

// Group duration tracker
export class GroupDurationTracker {
  constructor() {
    this.startTime = 0;
    this.endTime = 0;
  }

  start() {
    this.startTime = Date.now();
  }

  end() {
    this.endTime = Date.now();
    return this.duration;
  }

  get duration() {
    return (this.endTime - this.startTime) / 1000;
  }
} 