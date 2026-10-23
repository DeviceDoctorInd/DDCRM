import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken, getViewerToken } from './helpers/auth';

const app = createTestApp();

describe('DB Endpoints Security & Access Control Tests', () => {
  describe('POST /api/db/reconnect', () => {
    it('should return 401 Unauthorized when called without authentication token', async () => {
      const res = await request(app).post('/api/db/reconnect');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 403 Forbidden when called by a non-Super Admin user (Viewer)', async () => {
      const viewerToken = getViewerToken();
      const res = await request(app)
        .post('/api/db/reconnect')
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should return 200 when called by a Super Admin', async () => {
      const superAdminToken = getValidToken();
      const res = await request(app)
        .post('/api/db/reconnect')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/db/status', () => {
    it('should remain publicly accessible without leaking tableCounts', async () => {
      const res = await request(app).get('/api/db/status');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.tableCounts).toBeUndefined();
    });
  });
});
