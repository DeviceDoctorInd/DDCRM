import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('Employee Payments Module - CRUD & Input Validation Tests', () => {
  describe('Normal CRUD Operations', () => {
    let createdPayoutId = '';

    it('should read (GET) all employee payouts list successfully', async () => {
      const res = await request(app)
        .get('/api/employee-payments')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('amountPaid');
    });

    it('should create (POST) a new valid employee payout record', async () => {
      const payload = {
        brand: 'Device Doctor India',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        paymentDate: '2026-02-01',
        amountPaid: 45000,
        paymentMode: 'GST Invoice',
        referenceUtr: 'NEFT-EMP-98765432',
        notes: 'Monthly salary disbursement',
      };

      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment).toBeDefined();
      expect(res.body.payment.amountPaid).toBe(45000);
      expect(res.body.payment.id).toBeDefined();
      createdPayoutId = res.body.payment.id;
    });

    it('should update (PUT) an existing employee payout record', async () => {
      const updatePayload = {
        amountPaid: 50000,
        notes: 'Monthly salary disbursement with performance bonus',
      };

      const res = await request(app)
        .put(`/api/employee-payments/${createdPayoutId}`)
        .set('Authorization', authHeader)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment.amountPaid).toBe(50000);
    });

    it('should delete (DELETE) the employee payout record', async () => {
      const res = await request(app)
        .delete(`/api/employee-payments/${createdPayoutId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe(createdPayoutId);
    });
  });

  describe('Galat Input & Validation Handling', () => {
    it('should reject employee payment with negative amount (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeName: 'Amit Trivedi',
          amountPaid: -20000, // Invalid negative payout
          paymentDate: '2026-02-01',
        });

      // API should reject negative payout values
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject employee payment with invalid date (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeName: 'Amit Trivedi',
          amountPaid: 35000,
          paymentDate: 'invalid-date-format', // Invalid date
        });

      // API should reject invalid date
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject employee payment with missing employee or amount (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          paymentMode: 'Cash',
          // Missing employeeName and amountPaid
        });

      // API should require complete employee payout details
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
