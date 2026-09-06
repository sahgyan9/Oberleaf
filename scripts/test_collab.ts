import { getLocalIpAddresses, getCollabNetworkStatus, isCloudflaredAvailable } from '../server/tunnel.js';

console.log('[Test] Running collaboration network verification...');

// Test 1: Local IP detection
const ips = getLocalIpAddresses();
console.log(`[Test] Detected local IP addresses:`, ips);
if (!Array.isArray(ips)) {
  console.error('FAIL: ips is not an array');
  process.exit(1);
}

// Test 2: Network status format
const status = getCollabNetworkStatus(5173);
console.log(`[Test] Collab network status:`, status);
if (!status.localUrl.startsWith('http://')) {
  console.error('FAIL: status.localUrl does not start with http://');
  process.exit(1);
}
if (typeof status.isCloudflaredAvailable !== 'boolean') {
  console.error('FAIL: isCloudflaredAvailable is not boolean');
  process.exit(1);
}
if (!status.tunnel || typeof status.tunnel.isActive !== 'boolean') {
  console.error('FAIL: status.tunnel is malformed');
  process.exit(1);
}

// Test 3: Origin validation regex tests
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

function testIsAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:(5173|3001))?$/.test(origin)) {
    return true;
  }
  if (/^https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com$/.test(origin)) {
    return true;
  }
  return false;
}

const testCases = [
  { origin: 'http://localhost:5173', expected: true },
  { origin: 'http://127.0.0.1:3001', expected: true },
  { origin: 'http://192.168.1.105:5173', expected: true },
  { origin: 'http://10.0.0.42:5173', expected: true },
  { origin: 'https://oberleaf-session-abc123.trycloudflare.com', expected: true },
  { origin: 'https://malicious-site.com', expected: false },
  { origin: 'http://example.com:5173', expected: false },
];

for (const tc of testCases) {
  const res = testIsAllowedOrigin(tc.origin);
  if (res !== tc.expected) {
    console.error(`FAIL: testIsAllowedOrigin("${tc.origin}") = ${res}, expected ${tc.expected}`);
    process.exit(1);
  }
}

console.log('[Test] All collaboration network and origin tests PASSED.');
