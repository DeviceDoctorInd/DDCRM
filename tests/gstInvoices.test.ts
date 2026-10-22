import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('GST Invoices Module - CRUD & Input Validation Tests', () => {
  describe('Normal CRUD Operations', () => {
    let createdInvoiceId = '';

    it('should read (GET) all GST invoices list successfully', async () => {
      const res = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('gstAmountINR');
    });

    it('should create (POST) a new valid GST invoice record', async () => {
      const payload = {
        brand: 'Device Doctor India',
        clientName: 'TechCorp Infotech Pvt Ltd',
        paymentDate: '2026-02-01',
        amountReceived: 100000,
        currency: 'INR',
        amountINR: 100000,
        gstAmountINR: 18000,
        invoiceNumber: 'INV-2026-TEST-999',
        uploadedToGstPortal: 'No',
        notes: 'Manual test invoice record',
      };

      const res = await request(app)
        .post('/api/gst-invoices')
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.invoice).toBeDefined();
      expect(res.body.invoice.gstAmountINR).toBe(18000);
      expect(res.body.invoice.id).toBeDefined();
      createdInvoiceId = res.body.invoice.id;
    });

    it('should update (PUT) an existing GST invoice', async () => {
      const updatePayload = {
        invoiceNumber: 'INV-2026-TEST-999-UPDATED',
        uploadedToGstPortal: 'Yes',
        gstPortalUploadDate: '2026-02-05',
      };

      const res = await request(app)
        .put(`/api/gst-invoices/${createdInvoiceId}`)
        .set('Authorization', authHeader)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.invoice.invoiceNumber).toBe('INV-2026-TEST-999-UPDATED');
      expect(res.body.invoice.uploadedToGstPortal).toBe('Yes');
    });

    it('should delete (DELETE) the GST invoice', async () => {
      const res = await request(app)
        .delete(`/api/gst-invoices/${createdInvoiceId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe(createdInvoiceId);
    });
  });

  describe('Galat Input & Validation Handling', () => {
    it('should reject GST invoice with negative amount (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/gst-invoices')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          clientName: 'TechCorp Infotech Pvt Ltd',
          amountReceived: -50000, // Invalid negative amount
          gstAmountINR: -9000,
          currency: 'INR',
          paymentDate: '2026-02-01',
        });

      // API should reject negative tax amounts
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject GST invoice with invalid payment date (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/gst-invoices')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          clientName: 'TechCorp Infotech Pvt Ltd',
          amountReceived: 50000,
          paymentDate: 'invalid-date-format', // Invalid date
        });

      // API should reject invalid date
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject GST invoice with missing client or invoice details (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/gst-invoices')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          // Missing clientName and amountReceived
        });

      // API should reject incomplete invoice
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
