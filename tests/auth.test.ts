import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getExpiredToken, getValidToken } from './helpers/auth';

const app = createTestApp();

describe('Auth Module - Login & Session Flow', () => {
  describe('POST /api/auth/login', () => {
    it('should authenticate successfully with correct credentials (sahi password)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'rathorehemant114@gmail.com',
          password: 'Admin@2026',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe('string');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('rathorehemant114@gmail.com');
      expect(res.body.user.role).toBe('Super Admin');
    });

    it('should reject login with wrong password (galat password)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'rathorehemant114@gmail.com',
          password: 'IncorrectPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.token).toBeUndefined();
      expect(res.body.error).toMatch(/invalid.*password|authentication failed/i);
    });

    it('should reject login with empty credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: '',
          password: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject login for non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent.user@randomdomain.org',
          password: 'AnyPassword@123',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Session Token & Expiry Verification', () => {
    it('should allow access to /api/auth/me with a valid session token', async () => {
      const validToken = getValidToken();
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('rathorehemant114@gmail.com');
    });

    it('should return 401 when token is expired (token expiry test)', async () => {
      const expiredToken = getExpiredToken();
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/invalid or expired/i);
    });

    it('should return 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/no authentication token provided/i);
    });
  });
});
