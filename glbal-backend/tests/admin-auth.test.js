const test = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

test('admin login accepts valid credentials and rejects invalid ones', async () => {
  const validResponse = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'globalmovement05@gmail.com', password: 'Global100' })
  });

  assert.equal(validResponse.status, 200);
  const validBody = await validResponse.json();
  assert.equal(validBody.success, true);
  assert.equal(validBody.data.email, 'globalmovement05@gmail.com');
  assert.ok(validBody.token, 'expected a session token in the login response');

  const invalidResponse = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'globalmovement05@gmail.com', password: 'wrong-password' })
  });

  assert.equal(invalidResponse.status, 401);
  const invalidBody = await invalidResponse.json();
  assert.equal(invalidBody.success, false);
  assert.equal(invalidBody.message, 'Invalid credentials');
});

test('protected admin route authorizes a valid session token', async () => {
  const loginResponse = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'globalmovement05@gmail.com', password: 'Global100' })
  });
  const loginBody = await loginResponse.json();

  const checkResponse = await fetch(`${BASE_URL}/api/admin/check`, {
    headers: { Authorization: `Bearer ${loginBody.token}` }
  });

  assert.equal(checkResponse.status, 200);
  const checkBody = await checkResponse.json();
  assert.equal(checkBody.success, true);
  assert.equal(checkBody.data.email, 'globalmovement05@gmail.com');
});
