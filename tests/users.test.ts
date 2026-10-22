import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('Users Module - CRUD & Input Validation Tests', () => {
  describe('Normal CRUD Operations', () => {
    let createdUserId = '';

    it('should read (GET) all users list successfully', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('email');
    });

    it('should create (POST) a new valid user account', async () => {
      const payload = {
        name: 'Operations Manager Test',
        email: 'ops.manager.test@devicedoctor.in',
        password: 'Password@2026',
        role: 'Project Manager',
        brand: 'Device Doctor India',
        status: 'Active',
      };

      const res = await request(app)
        .post('/api/users')
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('ops.manager.test@devicedoctor.in');
      expect(res.body.user.id).toBeDefined();
      createdUserId = res.body.user.id;
    });

    it('should update (PUT) an existing user account', async () => {
      const updatePayload = {
        name: 'Operations Manager Updated',
        status: 'Active',
      };

      const res = await request(app)
        .put(`/api/users/${createdUserId}`)
        .set('Authorization', authHeader)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.name).toBe('Operations Manager Updated');
    });

    it('should delete (DELETE) the user account', async () => {
      const res = await request(app)
        .delete(`/api/users/${createdUserId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe(createdUserId);
    });
  });

  describe('Galat Input & Validation Handling', () => {
    it('should reject user creation with invalid email format (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', authHeader)
        .send({
          name: 'Invalid Email User',
          email: 'not-an-email-address', // Invalid email
          password: 'Password@2026',
          role: 'Viewer',
        });

      // API should reject invalid email format
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject user creation with empty or missing password (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', authHeader)
        .send({
          name: 'No Password User',
          email: 'no.pass@devicedoctor.in',
          password: '', // Empty password
          role: 'Viewer',
        });

      // API should enforce mandatory password on new account
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject user creation with missing required name field (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', authHeader)
        .send({
          email: 'noname@devicedoctor.in',
          password: 'Password@2026',
          role: 'Viewer',
          // Missing name
        });

      // API should require user name
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
