import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken, getViewerToken } from './helpers/auth';
import { mockStore } from '../server/db/mockStore';

const app = createTestApp();

describe('Auth Module - /api/auth/update-credentials Security & Account Takeover Prevention', () => {
  beforeEach(() => {
    mockStore.seedDefaultData();
  });

  // Test 1: Bina token, jis account ka password pehle se set hai: password badalna 401 de
  it('1. Bina token, jis account ka password pehle se set hai: password badalna 401 Unauthorized de', async () => {
    const res = await request(app)
      .put('/api/auth/update-credentials')
      .send({
        email: 'rathorehemant114@gmail.com',
        newPassword: 'MaliciousTakeoverPassword@2026',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.token).toBeUndefined();
    expect(res.body.error).toMatch(/password.*already|token.*required|access denied/i);
  });

  // Test 2: Token ke saath, bina currentPassword: 400
  it('2. Token ke saath, bina currentPassword request bhejne par 400 Bad Request de', async () => {
    const adminToken = getValidToken();

    const res = await request(app)
      .put('/api/auth/update-credentials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'rathorehemant114@gmail.com',
        newPassword: 'ValidNewPassword@2026',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.token).toBeUndefined();
    expect(res.body.error).toMatch(/current password.*required/i);
  });

  // Test 3: Token ke saath, galat currentPassword: 401
  it('3. Token ke saath, galat currentPassword bhejne par 401 Unauthorized de', async () => {
    const adminToken = getValidToken();

    const res = await request(app)
      .put('/api/auth/update-credentials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'rathorehemant114@gmail.com',
        currentPassword: 'IncorrectCurrentPassword!123',
        newPassword: 'ValidNewPassword@2026',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.token).toBeUndefined();
    expect(res.body.error).toMatch(/current password verification failed|incorrect/i);
  });

  // Test 4: User A ke token se User B ka password badalna: 403
  it('4. User A (Viewer) ke token se User B (Super Admin) ka password badalna 403 Forbidden de', async () => {
    const viewerToken = getViewerToken(); // Token belongs to USR-006 (viewer@devicedoctor.in)

    const res = await request(app)
      .put('/api/auth/update-credentials')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        email: 'rathorehemant114@gmail.com', // Target is Super Admin account
        currentPassword: 'Viewer@2026',
        newPassword: 'AttackerTakeover@2026',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.token).toBeUndefined();
    expect(res.body.error).toMatch(/only update.*own account|access denied/i);
  });

  // Test 5: Request me role bhejne par role badle nahi
  it('5. Request me role (e.g. Super Admin) bhejne par role badle nahi, existing role hi rahe', async () => {
    const viewerToken = getViewerToken();

    const res = await request(app)
      .put('/api/auth/update-credentials')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        email: 'viewer@devicedoctor.in',
        currentPassword: 'Viewer@2026',
        newPassword: 'SafeViewerPassword@2026',
        role: 'Super Admin', // Attempt privilege escalation
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe('Viewer'); // Role must NOT have escalated
    expect(res.body.user.role).not.toBe('Super Admin');

    // Confirm store also preserved existing role
    const storedUser = mockStore.getUsers().find((u) => u.email === 'viewer@devicedoctor.in');
    expect(storedUser?.role).toBe('Viewer');
  });

  // Test 6: Sahi token aur sahi currentPassword se apna password badalna: success
  it('6. Sahi token aur sahi currentPassword se apna password badalna: success (200 + fresh token)', async () => {
    const adminToken = getValidToken();

    const res = await request(app)
      .put('/api/auth/update-credentials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'rathorehemant114@gmail.com',
        currentPassword: 'Admin@2026',
        newPassword: 'FreshUpdatedPassword@2026',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('rathorehemant114@gmail.com');

    // Verify user can now authenticate with the new password
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'rathorehemant114@gmail.com',
        password: 'FreshUpdatedPassword@2026',
      });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
  });

  // Test 7: Bina token, jis account ka password abhi set nahi hua (first-time setup): success
  it('7. Bina token, jis account ka password abhi set nahi hua (first-time setup): success (200 + fresh token)', async () => {
    // Provision an account without any password in the store
    (mockStore as any).users.push({
      id: 'USR-UNSET-01',
      name: 'Unset Password User',
      email: 'unset.user@devicedoctor.in',
      password: '', // Password not set yet
      role: 'Viewer',
      brand: 'All',
      status: 'Active',
      avatar: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Unauthenticated request should succeed for first-time password setup
    const res = await request(app)
      .put('/api/auth/update-credentials')
      .send({
        email: 'unset.user@devicedoctor.in',
        newPassword: 'MyInitialPassword@2026',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('unset.user@devicedoctor.in');

    // Now that password is set, a subsequent unauthenticated request MUST fail with 401
    const subsequentRes = await request(app)
      .put('/api/auth/update-credentials')
      .send({
        email: 'unset.user@devicedoctor.in',
        newPassword: 'SecondAttemptWithoutToken@2026',
      });
    expect(subsequentRes.status).toBe(401);
    expect(subsequentRes.body.success).toBe(false);
  });
});
