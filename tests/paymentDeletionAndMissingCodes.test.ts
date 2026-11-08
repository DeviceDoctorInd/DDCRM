import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import { mockStore } from '../server/db/mockStore';
import { Payment, GstInvoice } from '../src/types/crm';
import { buildPaymentSaveQuery } from '../server/routes/api';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('Payment Deletion Safety, Filed Invoice Protection & Missing Codes Self-Check', () => {
  const brand = 'Device Doctor India';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Self-Check: GET /api/payments/missing-codes', () => {
    it('accurately detects and lists payments missing payment_id_code', async () => {
      // Create a payment intentionally missing payment_id_code
      const orphanPayment: Payment = {
        id: 'DDI-PAY-TEST-MISSING',
        brand,
        projectId: 'PRJ-TEST-001',
        clientId: 'CLI-TEST-001',
        clientName: 'Test Client',
        paymentMode: 'GST Invoice',
        bankAccountId: 'BNK-001',
        bankAccountName: 'HDFC Bank',
        paymentDate: '2026-11-08',
        dueDate: '2026-11-08',
        amountReceived: 50000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 50000,
        referenceUtr: 'UTR-MISSING-01',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'Test missing code payment',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      delete (orphanPayment as any).payment_id_code;

      mockStore.savePayment(orphanPayment, false);

      const res = await request(app)
        .get('/api/payments/missing-codes')
        .set('Authorization', authHeader)
        .set('x-active-brand', brand);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBeGreaterThanOrEqual(1);
      const found = res.body.missingPayments.find((p: any) => p.id === 'DDI-PAY-TEST-MISSING');
      expect(found).toBeDefined();
      expect(found.clientName).toBe('Test Client');

      // Cleanup
      mockStore.deletePayment('DDI-PAY-TEST-MISSING', brand);
    });
  });

  describe('2. Payment Deletion Safety: Purges unfiled vouchers, preserves filed invoices', () => {
    it('purges linked unfiled GST invoice when payment is deleted', async () => {
      const payId = 'DDI-PAY-PURGE-TEST';
      const unfiledInvId = 'DDI-GST-UNFILED-TEST';

      const payment: Payment = {
        id: payId,
        payment_id_code: payId,
        brand,
        projectId: 'PRJ-PURGE-001',
        clientId: 'CLI-PURGE-001',
        clientName: 'Purge Client',
        paymentMode: 'GST Invoice',
        bankAccountId: 'BNK-001',
        bankAccountName: 'HDFC Bank',
        paymentDate: '2026-11-08',
        dueDate: '2026-11-08',
        amountReceived: 20000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 20000,
        referenceUtr: 'UTR-PURGE-01',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'Payment to delete',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any;

      const unfiledInvoice: GstInvoice = {
        id: unfiledInvId,
        invoice_id_code: unfiledInvId,
        brand,
        paymentId: payId,
        projectId: 'PRJ-PURGE-001',
        clientId: 'CLI-PURGE-001',
        clientName: 'Purge Client',
        paymentDate: '2026-11-08',
        amountReceived: 20000,
        currency: 'INR',
        amountINR: 20000,
        gstAmountINR: 3600,
        invoiceNumber: 'INV-2026-999',
        uploadedToGstPortal: 'No', // Unfiled
        gstPortalUploadDate: '',
        notes: 'Unfiled invoice',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any;

      mockStore.savePayment(payment, false);
      mockStore.saveGstInvoice(unfiledInvoice);

      // Verify invoice exists before delete
      expect(mockStore.getGstInvoices().some((i) => i.id === unfiledInvId)).toBe(true);

      // Delete payment
      const delRes = await request(app)
        .delete(`/api/payments/${payId}`)
        .set('Authorization', authHeader)
        .set('x-active-brand', brand);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify payment was deleted
      expect(mockStore.getPayments().some((p) => p.id === payId)).toBe(false);

      // Verify unfiled linked GST invoice was purged
      expect(mockStore.getGstInvoices().some((i) => i.id === unfiledInvId)).toBe(false);
    });

    it('NEVER purges a filed/finalized GST invoice (uploadedToGstPortal = Yes) when payment is deleted', async () => {
      const payId = 'DDI-PAY-FILED-KEEP';
      const filedInvId = 'DDI-GST-FILED-KEEP';

      const payment: Payment = {
        id: payId,
        payment_id_code: payId,
        brand,
        projectId: 'PRJ-KEEP-001',
        clientId: 'CLI-KEEP-001',
        clientName: 'Filed Tax Client',
        paymentMode: 'GST Invoice',
        bankAccountId: 'BNK-001',
        bankAccountName: 'HDFC Bank',
        paymentDate: '2026-11-08',
        dueDate: '2026-11-08',
        amountReceived: 100000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 100000,
        referenceUtr: 'UTR-FILED-01',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'Payment with filed GST invoice',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any;

      const filedInvoice: GstInvoice = {
        id: filedInvId,
        invoice_id_code: filedInvId,
        brand,
        paymentId: payId,
        projectId: 'PRJ-KEEP-001',
        clientId: 'CLI-KEEP-001',
        clientName: 'Filed Tax Client',
        paymentDate: '2026-11-08',
        amountReceived: 100000,
        currency: 'INR',
        amountINR: 100000,
        gstAmountINR: 18000,
        invoiceNumber: 'INV-2026-FILED-001',
        uploadedToGstPortal: 'Yes', // FILED!
        gstPortalUploadDate: '2026-11-08',
        notes: 'Tax invoice filed under GSTR-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any;

      mockStore.savePayment(payment, false);
      mockStore.saveGstInvoice(filedInvoice);

      // Delete the payment
      const delRes = await request(app)
        .delete(`/api/payments/${payId}`)
        .set('Authorization', authHeader)
        .set('x-active-brand', brand);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Payment was deleted
      expect(mockStore.getPayments().some((p) => p.id === payId)).toBe(false);

      // Filed GST invoice is PRESERVED and untouched
      const preservedInvoice = mockStore.getGstInvoices().find((i) => i.id === filedInvId);
      expect(preservedInvoice).toBeDefined();
      expect(preservedInvoice!.uploadedToGstPortal).toBe('Yes');

      // Cleanup
      mockStore.deleteGstInvoice(filedInvId, brand);
    });
  });

  describe('3. buildPaymentSaveQuery Static Code & T-SQL Verification', () => {
    it('inspects sys.columns for payments and gst_invoices type safety', () => {
      const sql = buildPaymentSaveQuery();

      expect(sql).toContain("OBJECT_ID('payments') AND c.name = 'id'");
      expect(sql).toContain("OBJECT_ID('payments') AND c.name = 'project_id'");
      expect(sql).toContain("OBJECT_ID('payments') AND c.name = 'client_id'");
      expect(sql).toContain("OBJECT_ID('payments') AND c.name = 'bank_account_id'");

      expect(sql).toContain("OBJECT_ID('gst_invoices') AND c.name = 'id'");
      expect(sql).toContain("OBJECT_ID('gst_invoices') AND c.name = 'payment_id'");
      expect(sql).toContain("OBJECT_ID('gst_invoices') AND c.name = 'project_id'");
      expect(sql).toContain("OBJECT_ID('gst_invoices') AND c.name = 'client_id'");
    });

    it('contains in-transaction sequence ID reservation with UPDLOCK/HOLDLOCK', () => {
      const sql = buildPaymentSaveQuery();

      expect(sql).toContain('FROM payments WITH (UPDLOCK, HOLDLOCK)');
      expect(sql).toContain('FROM gst_invoices WITH (UPDLOCK, HOLDLOCK)');
      expect(sql).toContain('BEGIN TRANSACTION;');
      expect(sql).toContain('COMMIT TRANSACTION;');
      expect(sql).toContain('IF @@TRANCOUNT > 0');
      expect(sql).toContain('ROLLBACK TRANSACTION;');
    });

    it('uses CAST(... AS NVARCHAR(150)) in comparisons to prevent Error 8169', () => {
      const sql = buildPaymentSaveQuery();

      expect(sql).toContain('CAST(id AS NVARCHAR(150)) = @id');
      expect(sql).toContain('CAST(id AS NVARCHAR(150)) = @rawId');
      expect(sql).toContain('CAST(payment_id AS NVARCHAR(150)) = @effectiveRawId');
      expect(sql).toContain('TRY_CAST(p.id AS UNIQUEIDENTIFIER)');
      expect(sql).toContain('TRY_CAST(c.id AS UNIQUEIDENTIFIER)');
      expect(sql).toContain('TRY_CAST(b.id AS UNIQUEIDENTIFIER)');
    });
  });
});
