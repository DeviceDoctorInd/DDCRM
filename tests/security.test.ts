import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getViewerToken } from './helpers/auth';

const app = createTestApp();

describe('Security & RBAC Vulnerability Tests (Expected to FAIL to prove existing bugs)', () => {
  describe('Bug 1: Bina token ke har /api route 401 de', () => {
    it('GET /api/clients without token should return 401 Unauthorized', async () => {
      const res = await request(app).get('/api/clients');
      expect(res.status).toBe(401);
    });

    it('POST /api/clients without token should return 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/clients')
        .send({ name: 'Unauthenticated Client Inc' });
      expect(res.status).toBe(401);
    });

    it('GET /api/projects without token should return 401 Unauthorized', async () => {
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(401);
    });

    it('POST /api/projects without token should return 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ clientName: 'Unauthenticated Project' });
      expect(res.status).toBe(401);
    });

    it('GET /api/payments without token should return 401 Unauthorized', async () => {
      const res = await request(app).get('/api/payments');
      expect(res.status).toBe(401);
    });

    it('POST /api/payments without token should return 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/payments')
        .send({ amountReceived: 50000 });
      expect(res.status).toBe(401);
    });

    it('GET /api/gst-invoices without token should return 401 Unauthorized', async () => {
      const res = await request(app).get('/api/gst-invoices');
      expect(res.status).toBe(401);
    });

    it('GET /api/expenses without token should return 401 Unauthorized', async () => {
      const res = await request(app).get('/api/expenses');
      expect(res.status).toBe(401);
    });

    it('GET /api/bank-accounts without token should return 401 Unauthorized', async () => {
      const res = await request(app).get('/api/bank-accounts');
      expect(res.status).toBe(401);
    });

    it('GET /api/employees without token should return 401 Unauthorized', async () => {
      const res = await request(app).get('/api/employees');
      expect(res.status).toBe(401);
    });

    it('GET /api/employee-payments without token should return 401 Unauthorized', async () => {
      const res = await request(app).get('/api/employee-payments');
      expect(res.status).toBe(401);
    });

    it('GET /api/users without token should return 401 Unauthorized', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401);
    });

    it('POST /api/users without token should return 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/users')
        .send({ name: 'Malicious Attacker', email: 'attacker@evil.com' });
      expect(res.status).toBe(401);
    });
  });

  describe('Bug 2: Normal user Super Admin create na kar sake', () => {
    it('Non-admin user (Viewer) should receive 403 Forbidden when creating a Super Admin account', async () => {
      const viewerToken = getViewerToken();
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: 'Privilege Escalation User',
          email: 'escalated.admin@securitybug.com',
          password: 'SecretPassword@2026',
          role: 'Super Admin',
          brand: 'All',
          status: 'Active',
        });

      // Security requirement: Normal user must NOT be permitted to provision Super Admin
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Bug 3: /api/db/clear-demo sirf Super Admin chala sake', () => {
    it('Unauthenticated user should be denied access to clear demo database (expect 401)', async () => {
      const res = await request(app).post('/api/db/clear-demo');

      // Security requirement: Route must require authentication
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('Non-Super Admin user (Viewer) should be forbidden from clearing demo database (expect 403)', async () => {
      const viewerToken = getViewerToken();
      const res = await request(app)
        .post('/api/db/clear-demo')
        .set('Authorization', `Bearer ${viewerToken}`);

      // Security requirement: Destructive database clear must be restricted to Super Admin
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
