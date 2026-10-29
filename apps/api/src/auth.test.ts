import test from 'node:test';
import assert from 'node:assert/strict';
import { getUser } from './auth.ts';

test('getUser recognizes admin role from Easy Auth claims', () => {
  const principal = {
    auth_typ: 'aad',
    claims: [
      { typ: 'http://schemas.microsoft.com/identity/claims/objectidentifier', val: 'user-123' },
      { typ: 'name', val: '관리자 사용자' },
      { typ: 'roles', val: 'Admin' },
    ],
  };

  const header = Buffer.from(JSON.stringify(principal)).toString('base64');
  const req = {
    headers: { get: (name: string) => (name === 'x-ms-client-principal' ? header : null) },
  } as any;

  const user = getUser(req);
  assert.ok(user);
  assert.equal(user?.userId, 'user-123');
  assert.equal(user?.isAdmin, true);
});

test('getUser denies admin flag without role claim', () => {
  const principal = {
    auth_typ: 'aad',
    claims: [
      { typ: 'http://schemas.microsoft.com/identity/claims/objectidentifier', val: 'user-456' },
      { typ: 'preferred_username', val: 'user@example.com' },
    ],
  };

  const header = Buffer.from(JSON.stringify(principal)).toString('base64');
  const req = {
    headers: { get: (name: string) => (name === 'x-ms-client-principal' ? header : null) },
  } as any;

  const user = getUser(req);
  assert.ok(user);
  assert.equal(user?.isAdmin, false);
});
