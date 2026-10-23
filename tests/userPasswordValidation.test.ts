import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import { mockStore } from '../server/db/mockStore';

const app = createTestApp();
const superAdminToken = getValidToken();

describe('User Creation & Password Policy Validation Tests', () => {
  beforeEach(() => {
    mockStore.seedDefaultData();
  });

  it('1. should reject user creation with empty or missing password (expect 400)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Empty Pass User',
        email: 'empty.pass@devicedoctor.in',
        password: '',
        role: 'Viewer',
        brand: 'Device Doctor India',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/password.*required|at least 8/i);
  });

  it('2. should reject user creation with password shorter than 8 characters (expect 400)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Short Pass User',
        email: 'short.pass@devicedoctor.in',
        password: 'pass123', // 7 characters, less than 8
        role: 'Viewer',
        brand: 'Device Doctor India',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/at least 8.*characters|password/i);
  });

  it('3. should create a user successfully with valid password >= 8 characters (expect 200)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Valid Pass User',
        email: 'valid.pass@devicedoctor.in',
        password: 'ValidPassword@2026', // 19 chars
        role: 'Viewer',
        brand: 'Device Doctor India',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('valid.pass@devicedoctor.in');
  });

  it('4. should allow editing existing user without providing password, preserving original password', async () => {
    // 1. Create a user with known password
    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Original User',
        email: 'original.user@devicedoctor.in',
        password: 'OriginalPassword@2026',
        role: 'Viewer',
        brand: 'Device Doctor India',
      });
    expect(createRes.status).toBe(200);
    const userId = createRes.body.user.id;

    // 2. Edit user without sending password
    const updateRes = await request(app)
      .put(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Original User Renamed',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.user.name).toBe('Original User Renamed');

    // 3. Verify user can still authenticate with original password
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'original.user@devicedoctor.in',
        password: 'OriginalPassword@2026',
      });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
  });
});
