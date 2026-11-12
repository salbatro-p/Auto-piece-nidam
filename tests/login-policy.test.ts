import test from 'node:test';
import assert from 'node:assert/strict';
import { localPasswordLogin } from '../apps/api/src/login-policy.js';

const local = { ip: '127.0.0.1', hostname: 'localhost' };
const enabled = {
  LOCAL_PREVIEW_PASSWORD_ONLY: 'true', NODE_ENV: 'development', DEMO_MODE: 'true',
  API_HOST: '127.0.0.1', DATABASE_URL: 'postgresql://localhost/isolated_policy_test',
};

test('Password-only preview requires explicit opt-in and a local development environment', () => {
  assert.equal(localPasswordLogin(local, enabled), true);
  for (const patch of [
    { LOCAL_PREVIEW_PASSWORD_ONLY: undefined }, { LOCAL_PREVIEW_PASSWORD_ONLY: 'false' },
    { NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { NODE_ENV: undefined },
    { DEMO_MODE: 'false' }, { API_HOST: '0.0.0.0' }, { API_HOST: '::' },
    { DATABASE_URL: 'postgresql://db.example.com/company' }, { DATABASE_URL: 'invalid' },
  ]) assert.equal(localPasswordLogin(local, { ...enabled, ...patch }), false);
});

test('Password-only preview rejects remote clients and public hostnames', () => {
  assert.equal(localPasswordLogin({ ip: '203.0.113.8', hostname: 'localhost' }, enabled), false);
  assert.equal(localPasswordLogin({ ip: '127.0.0.1', hostname: 'business.example.com' }, enabled), false);
  assert.equal(localPasswordLogin({ ip: '::ffff:127.0.0.1', hostname: '127.0.0.1' }, enabled), true);
  assert.equal(localPasswordLogin({ ip: '::1', hostname: '[::1]' }, {
    ...enabled, API_HOST: '::1', DATABASE_URL: 'postgresql://[::1]/isolated_policy_test',
  }), true);
});
