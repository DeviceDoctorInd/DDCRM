import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken, getViewerToken } from './helpers/auth';

const app = createTestApp();

describe('GET /api/db/status Information Disclosure & RBAC Security Tests', () => {
  it('1. Bina token (unauthenticated): response me sirf { status, connected, isMock } mile; server, database, authType, user, error, lastChecked na ho', async () => {
    const res = await request(app).get('/api/db/status');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('connected');
    expect(res.body).toHaveProperty('isMock');

    // Sensitive infrastructure metadata must NOT be leaked
    expect(res.body.server).toBeUndefined();
    expect(res.body.database).toBeUndefined();
    expect(res.body.authType).toBeUndefined();
    expect(res.body.user).toBeUndefined();
    expect(res.body.error).toBeUndefined();
    expect(res.body.lastChecked).toBeUndefined();
    expect(res.body.tableCounts).toBeUndefined();
  });

  it('2. Non-admin token (Viewer): response me sirf { status, connected, isMock } mile; server, database, authType, user, error, lastChecked na ho', async () => {
    const viewerToken = getViewerToken();
    const res = await request(app)
      .get('/api/db/status')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('connected');
    expect(res.body).toHaveProperty('isMock');

    // Sensitive infrastructure metadata must NOT be leaked to non-superadmin roles
    expect(res.body.server).toBeUndefined();
    expect(res.body.database).toBeUndefined();
    expect(res.body.authType).toBeUndefined();
    expect(res.body.user).toBeUndefined();
    expect(res.body.error).toBeUndefined();
    expect(res.body.lastChecked).toBeUndefined();
    expect(res.body.tableCounts).toBeUndefined();
  });

  it('3. Super Admin token ke saath: full details (server, database, authType, user) mile', async () => {
    const superAdminToken = getValidToken();
    const res = await request(app)
      .get('/api/db/status')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('connected');
    expect(res.body).toHaveProperty('isMock');

    // Super Admin is authorized to inspect full database configuration details
    expect(res.body.server).toBeDefined();
    expect(typeof res.body.server).toBe('string');
    expect(res.body.database).toBeDefined();
    expect(res.body.authType).toBeDefined();
    expect(res.body.user).toBeDefined();
  });
});
