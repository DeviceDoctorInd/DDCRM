import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('Expenses Module - CRUD & Input Validation Tests', () => {
  describe('Normal CRUD Operations', () => {
    let createdExpenseId = '';

    it('should read (GET) all expenses list successfully', async () => {
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('amount');
    });

    it('should create (POST) a new valid expense record', async () => {
      const payload = {
        brand: 'Device Doctor India',
        expenseCategoryName: 'Cloud Server Hosting & SaaS',
        vendor: 'Amazon Web Services AWS',
        description: 'Monthly production EC2, RDS and S3 cloud hosting charges',
        amount: 35000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 35000,
        expenseDate: '2026-02-01',
        paymentStatus: 'Paid',
        notes: 'Verified via AWS invoice',
      };

      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.expense).toBeDefined();
      expect(res.body.expense.amount).toBe(35000);
      expect(res.body.expense.id).toBeDefined();
      createdExpenseId = res.body.expense.id;
    });

    it('should update (PUT) an existing expense record', async () => {
      const updatePayload = {
        amount: 38000,
        amountINR: 38000,
        description: 'Monthly AWS cloud hosting charges including backup storage',
      };

      const res = await request(app)
        .put(`/api/expenses/${createdExpenseId}`)
        .set('Authorization', authHeader)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.expense.amount).toBe(38000);
    });

    it('should delete (DELETE) the expense record', async () => {
      const res = await request(app)
        .delete(`/api/expenses/${createdExpenseId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe(createdExpenseId);
    });
  });

  describe('Galat Input & Validation Handling', () => {
    it('should reject expense with negative amount (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          vendor: 'AWS',
          amount: -15000, // Invalid negative amount
          currency: 'INR',
          expenseDate: '2026-02-01',
        });

      // API should reject negative expense amounts
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject expense with invalid expense date (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          vendor: 'AWS',
          amount: 25000,
          expenseDate: 'bad-expense-date-9999', // Invalid date
        });

      // API should reject invalid date
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject expense with missing vendor or description (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          amount: 10000,
          currency: 'INR',
          // Missing vendor and description
        });

      // API should require vendor / description details
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
