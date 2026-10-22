import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('Payments Module - CRUD, Input Validation, Project Recalculation & GST Sync', () => {
  describe('Normal CRUD Operations', () => {
    let createdPaymentId = '';

    it('should read (GET) all payments list successfully', async () => {
      const res = await request(app)
        .get('/api/payments')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('amountReceived');
    });

    it('should create (POST) a new valid payment voucher', async () => {
      const payload = {
        brand: 'Device Doctor India',
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
        clientName: 'TechCorp Infotech Pvt Ltd',
        paymentMode: 'Non GST Online',
        paymentDate: '2026-01-25',
        dueDate: '2026-01-25',
        amountReceived: 25000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 25000,
        referenceUtr: 'UTR-TEST-12345678',
        paymentStatus: 'Received',
        notes: 'Automated test payment',
      };

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment).toBeDefined();
      expect(res.body.payment.amountReceived).toBe(25000);
      expect(res.body.payment.id).toBeDefined();
      createdPaymentId = res.body.payment.id;
    });

    it('should update (PUT) an existing payment voucher', async () => {
      const updatePayload = {
        amountReceived: 30000,
        amountINR: 30000,
        notes: 'Updated payment amount to 30000',
      };

      const res = await request(app)
        .put(`/api/payments/${createdPaymentId}`)
        .set('Authorization', authHeader)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment.amountReceived).toBe(30000);
    });

    it('should delete (DELETE) the payment voucher', async () => {
      const res = await request(app)
        .delete(`/api/payments/${createdPaymentId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe(createdPaymentId);
    });
  });

  describe('Galat Input & Validation Handling', () => {
    it('should reject payment with negative amount (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
          amountReceived: -10000, // Invalid negative amount
          currency: 'INR',
          paymentDate: '2026-01-20',
        });

      // API should reject negative financial transactions
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject payment with invalid date format (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          amountReceived: 10000,
          currency: 'INR',
          paymentDate: 'invalid-date-31-02-2026', // Invalid date
        });

      // API should reject invalid date
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject payment with missing required amount or project link (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          paymentMode: 'Cash',
          // Missing projectId and amountReceived
        });

      // API should reject incomplete payment records
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Project Total Received & Balance Recalculation Flow', () => {
    const targetProjectId = 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1';
    let initialReceived = 0;
    let initialBalance = 0;
    let testPayId = '';

    it('should update linked project totalReceived and balance after adding payment', async () => {
      // Step 1: Read initial project figures
      const projBeforeRes = await request(app)
        .get('/api/projects')
        .set('Authorization', authHeader);
      const projBefore = projBeforeRes.body.find((p: any) => p.id === targetProjectId);
      expect(projBefore).toBeDefined();
      initialReceived = Number(projBefore.totalReceived);
      initialBalance = Number(projBefore.balance);

      // Step 2: Record new payment of 50000
      const payAmount = 50000;
      const addPayRes = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          projectId: targetProjectId,
          clientId: projBefore.clientId,
          clientName: projBefore.clientName,
          amountReceived: payAmount,
          currency: 'INR',
          exchangeRate: 1,
          amountINR: payAmount,
          paymentMode: 'Non GST Online',
          paymentDate: '2026-02-01',
          paymentStatus: 'Received',
        });

      expect(addPayRes.status).toBe(200);
      testPayId = addPayRes.body.payment.id;

      // Step 3: Verify project totalReceived increased and balance decreased
      const projAfterRes = await request(app)
        .get('/api/projects')
        .set('Authorization', authHeader);
      const projAfter = projAfterRes.body.find((p: any) => p.id === targetProjectId);

      // Business rule: Project received should increase by payAmount, balance should decrease
      expect(Number(projAfter.totalReceived)).toBe(initialReceived + payAmount);
      expect(Number(projAfter.balance)).toBe(initialBalance - payAmount);
    });

    it('should update linked project received & balance after payment amount is edited', async () => {
      const newAmount = 80000; // Increased by 30000

      const editRes = await request(app)
        .put(`/api/payments/${testPayId}`)
        .set('Authorization', authHeader)
        .send({
          amountReceived: newAmount,
          amountINR: newAmount,
        });
      expect(editRes.status).toBe(200);

      // Verify project reflects updated amount
      const projAfterRes = await request(app)
        .get('/api/projects')
        .set('Authorization', authHeader);
      const projAfter = projAfterRes.body.find((p: any) => p.id === targetProjectId);

      expect(Number(projAfter.totalReceived)).toBe(initialReceived + newAmount);
      expect(Number(projAfter.balance)).toBe(initialBalance - newAmount);
    });

    it('should restore linked project received & balance after payment is deleted', async () => {
      const delRes = await request(app)
        .delete(`/api/payments/${testPayId}`)
        .set('Authorization', authHeader);
      expect(delRes.status).toBe(200);

      // Verify project values return to initial numbers
      const projAfterRes = await request(app)
        .get('/api/projects')
        .set('Authorization', authHeader);
      const projAfter = projAfterRes.body.find((p: any) => p.id === targetProjectId);

      expect(Number(projAfter.totalReceived)).toBe(initialReceived);
      expect(Number(projAfter.balance)).toBe(initialBalance);
    });
  });

  describe('Payment Deletion vs GST Invoice Behavior', () => {
    it('should auto-delete linked GST invoice when payment is deleted if NOT uploaded to portal (uploadedToGstPortal: "No")', async () => {
      // 1. Create payment with paymentMode: 'GST Invoice'
      const payRes = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          clientName: 'TechCorp Infotech Pvt Ltd',
          paymentMode: 'GST Invoice',
          amountReceived: 40000,
          currency: 'INR',
          amountINR: 40000,
          paymentDate: '2026-02-10',
        });

      expect(payRes.status).toBe(200);
      const paymentId = payRes.body.payment.id;

      // 2. Verify GST invoice was auto-synced
      const gstListRes = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);
      const linkedGst = gstListRes.body.find((g: any) => g.paymentId === paymentId);
      expect(linkedGst).toBeDefined();
      expect(linkedGst.uploadedToGstPortal).toBe('No');

      // 3. Delete the payment
      const delPayRes = await request(app)
        .delete(`/api/payments/${paymentId}`)
        .set('Authorization', authHeader);
      expect(delPayRes.status).toBe(200);

      // 4. Verify unfiled GST invoice is removed
      const gstListAfterRes = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);
      const foundGst = gstListAfterRes.body.find((g: any) => g.paymentId === paymentId);
      expect(foundGst).toBeUndefined();
    });

    it('should PRESERVE linked GST invoice when payment is deleted if ALREADY uploaded to portal (uploadedToGstPortal: "Yes")', async () => {
      // 1. Create payment with paymentMode: 'GST Invoice'
      const payRes = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          clientName: 'TechCorp Infotech Pvt Ltd',
          paymentMode: 'GST Invoice',
          amountReceived: 60000,
          currency: 'INR',
          amountINR: 60000,
          paymentDate: '2026-02-12',
        });

      expect(payRes.status).toBe(200);
      const paymentId = payRes.body.payment.id;

      // 2. Find auto-synced GST invoice
      const gstListRes = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);
      const linkedGst = gstListRes.body.find((g: any) => g.paymentId === paymentId);
      expect(linkedGst).toBeDefined();

      // 3. Mark the invoice as officially uploaded to GST portal
      const updateGstRes = await request(app)
        .put(`/api/gst-invoices/${linkedGst.id}`)
        .set('Authorization', authHeader)
        .send({
          ...linkedGst,
          uploadedToGstPortal: 'Yes',
          gstPortalUploadDate: '2026-02-13',
        });
      expect(updateGstRes.status).toBe(200);

      // 4. Delete the payment
      const delPayRes = await request(app)
        .delete(`/api/payments/${paymentId}`)
        .set('Authorization', authHeader);
      expect(delPayRes.status).toBe(200);

      // 5. Verify the filed GST invoice remains preserved for tax compliance
      const gstListAfterRes = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);
      const preservedGst = gstListAfterRes.body.find((g: any) => g.paymentId === paymentId);
      expect(preservedGst).toBeDefined();
      expect(preservedGst.uploadedToGstPortal).toBe('Yes');
    });
  });
});
