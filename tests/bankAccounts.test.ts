import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('Bank Accounts Module - CRUD & Input Validation Tests', () => {
  describe('Normal CRUD Operations', () => {
    let createdAccountId = '';

    it('should read (GET) all bank accounts list successfully', async () => {
      const res = await request(app)
        .get('/api/bank-accounts')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('accountName');
    });

    it('should create (POST) a new valid bank account record', async () => {
      const payload = {
        brand: 'Device Doctor India',
        accountName: 'Device Doctor Operating Current Account',
        bankName: 'HDFC Bank Ltd',
        accountNumber: '50200012345678',
        ifscCode: 'HDFC0000123',
        branchName: 'Andheri East, Mumbai',
        upiId: 'devicedoctor@okhdfcbank',
        accountType: 'Current',
        status: 'Active',
      };

      const res = await request(app)
        .post('/api/bank-accounts')
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.bankAccount).toBeDefined();
      expect(res.body.bankAccount.accountNumber).toBe('50200012345678');
      expect(res.body.bankAccount.id).toBeDefined();
      createdAccountId = res.body.bankAccount.id;
    });

    it('should update (PUT) an existing bank account', async () => {
      const updatePayload = {
        branchName: 'Nariman Point, Mumbai',
        status: 'Active',
      };

      const res = await request(app)
        .put(`/api/bank-accounts/${createdAccountId}`)
        .set('Authorization', authHeader)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.bankAccount.branchName).toBe('Nariman Point, Mumbai');
    });

    it('should delete (DELETE) the bank account', async () => {
      const res = await request(app)
        .delete(`/api/bank-accounts/${createdAccountId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe(createdAccountId);
    });
  });

  describe('Galat Input & Validation Handling', () => {
    it('should reject bank account with missing account number or bank name (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/bank-accounts')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          accountName: '',
          accountNumber: '',
          // Missing bankName, accountNumber
        });

      // API should reject missing mandatory bank details
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject bank account with invalid IFSC code format (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/bank-accounts')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          accountName: 'Test Account',
          bankName: 'HDFC Bank',
          accountNumber: '1234567890',
          ifscCode: 'INVALID-IFSC-1234567890', // Invalid IFSC
        });

      // API should enforce valid IFSC format
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
