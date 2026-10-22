import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('Clients Module - CRUD & Input Validation Tests', () => {
  describe('Normal CRUD Operations', () => {
    let createdClientId = '';

    it('should read (GET) all clients list successfully', async () => {
      const res = await request(app)
        .get('/api/clients')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('id');
    });

    it('should create (POST) a new valid client', async () => {
      const payload = {
        name: 'Automated Test Client Pvt Ltd',
        brand: 'Device Doctor India',
        contactPerson: 'Sunil Sharma',
        phone: '+91 98765 43210',
        email: 'sunil@autotestclient.com',
        city: 'Mumbai',
        country: 'India',
        gstNumber: '27AAAAA0000A1Z5',
        preferredCurrency: 'INR',
        clientSince: '2026-01-01',
        status: 'Active',
        notes: 'Created via automated Vitest suite',
      };

      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.client).toBeDefined();
      expect(res.body.client.name).toBe('Automated Test Client Pvt Ltd');
      expect(res.body.client.id).toBeDefined();
      createdClientId = res.body.client.id;
    });

    it('should update (PUT) an existing client', async () => {
      const updatePayload = {
        name: 'Automated Test Client Updated',
        contactPerson: 'Sunil Sharma Updated',
        city: 'Pune',
      };

      const res = await request(app)
        .put(`/api/clients/${createdClientId}`)
        .set('Authorization', authHeader)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.client.name).toBe('Automated Test Client Updated');
      expect(res.body.client.city).toBe('Pune');
    });

    it('should delete (DELETE) the client', async () => {
      const res = await request(app)
        .delete(`/api/clients/${createdClientId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe(createdClientId);

      // Verify client is deleted
      const checkRes = await request(app)
        .get('/api/clients')
        .set('Authorization', authHeader);
      const found = checkRes.body.find((c: any) => c.id === createdClientId);
      expect(found).toBeUndefined();
    });
  });

  describe('Galat Input & Validation Handling', () => {
    it('should reject client creation with missing required name field (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', authHeader)
        .send({
          name: '', // Empty/missing required name
          brand: 'Device Doctor India',
          preferredCurrency: 'INR',
        });

      // API should validate and reject missing required client name
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject client creation with invalid email address format (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', authHeader)
        .send({
          name: 'Invalid Email Client',
          brand: 'Device Doctor India',
          email: 'not-a-valid-email-string',
          preferredCurrency: 'INR',
        });

      // API should reject malformed email
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject client creation with invalid date for clientSince (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', authHeader)
        .send({
          name: 'Invalid Date Client',
          brand: 'Device Doctor India',
          clientSince: 'invalid-date-99-99-9999',
          preferredCurrency: 'INR',
        });

      // API should reject malformed date format
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
