import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import { mockStore } from '../server/db/mockStore';
import * as azureSqlModule from '../server/db/azureSql';
import { syncPaymentToGstInvoiceSql } from '../server/routes/api';
import { Payment } from '../src/types/crm';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

function createMockPool(options: { failGstQuery?: boolean; failPaymentTransaction?: boolean } = {}) {
  return {
    request: () => {
      const req: any = {
        inputs: {} as Record<string, any>,
        input(name: string, value: any) {
          req.inputs[name] = value;
          return req;
        },
        output() {
          return req;
        },
        async query(sqlText: string) {
          if (options.failPaymentTransaction && sqlText.includes('BEGIN TRANSACTION')) {
            throw new Error('Azure SQL payment transaction error');
          }

          if (options.failGstQuery && sqlText.includes('gst_invoices')) {
            throw new Error('Azure SQL GST invoice insert failed: Network timeout or constraint failure');
          }

          if (sqlText.includes('FROM payments') && sqlText.includes('SELECT TOP 1')) {
            return { recordset: [] };
          }

          if (sqlText.includes('FROM projects') && sqlText.includes('SELECT TOP 1')) {
            return {
              recordset: [
                {
                  id: req.inputs.projectId || 'PRJ-TEST-001',
                  clientName: 'TechCorp Infotech Pvt Ltd',
                  clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
                  totalAmount: 100000,
                  totalReceived: 0,
                  balance: 100000,
                },
              ],
            };
          }

          if (sqlText.includes('FROM payments WHERE id LIKE @pattern')) {
            return { recordset: [] };
          }

          if (sqlText.includes('BEGIN TRANSACTION')) {
            return { recordset: [], rowsAffected: [1] };
          }

          if (sqlText.includes('FROM gst_invoices WHERE payment_id = @paymentId')) {
            return { recordset: [] };
          }

          if (sqlText.includes('FROM gst_invoices WHERE id LIKE @pattern')) {
            return { recordset: [] };
          }

          if (sqlText.includes('INSERT INTO gst_invoices')) {
            return { recordset: [], rowsAffected: [1] };
          }

          return { recordset: [], rowsAffected: [1] };
        },
      };
      return req;
    },
  };
}

describe('GST Invoice Synchronization & Mock Fallback Regression Tests (Step 4)', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowFallback = process.env.ALLOW_MOCK_FALLBACK;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAllowFallback !== undefined) {
      process.env.ALLOW_MOCK_FALLBACK = originalAllowFallback;
    } else {
      delete process.env.ALLOW_MOCK_FALLBACK;
    }
    vi.restoreAllMocks();
  });

  describe('1. Successful Payment and GST Invoice Persistence', () => {
    it('persists payment and GST invoice to Azure SQL, returning synced GST invoice with correct format', async () => {
      const mockPool = createMockPool({ failGstQuery: false });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const payload = {
        id: 'DDI-PAY-901',
        brand: 'Device Doctor India',
        projectId: 'PRJ-TEST-001',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
        clientName: 'TechCorp Infotech Pvt Ltd',
        paymentMode: 'GST Invoice',
        paymentDate: '2026-03-15',
        amountReceived: 50000,
        currency: 'INR',
        amountINR: 50000,
        notes: 'Full sync test',
      };

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment).toBeDefined();
      expect(res.body.payment.id).toBe('DDI-PAY-901');
      expect(res.body.gstInvoiceSynced).toBe(true);
      expect(res.body.gstInvoice).toBeDefined();
      expect(res.body.gstInvoice.id).toMatch(/^DDI-GST-\d{3}$/);
      expect(res.body.gstInvoice.invoiceNumber).toMatch(/^INV-2026-/);
      expect(res.body.gstInvoice.gstAmountINR).toBe(Math.round(50000 * 0.18));
      expect(res.body.gstInvoice.uploadedToGstPortal).toBe('No');
      expect(res.body.warning).toBeUndefined();
      expect(res.body.gstSyncError).toBeUndefined();
    });
  });

  describe('2. Partial Success: Payment Persisted but GST Invoice Insert Fails', () => {
    it('returns truthful response: payment preserved, gstInvoiceSynced false, gstInvoice null, warning and error populated', async () => {
      const mockPool = createMockPool({ failGstQuery: true });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const testPaymentId = 'DDI-PAY-PARTIAL-001';
      // Clean up mockStore beforehand
      mockStore.deletePayment(testPaymentId);
      mockStore.deleteGstInvoiceByPaymentId(testPaymentId);

      const payload = {
        id: testPaymentId,
        brand: 'Device Doctor India',
        projectId: 'PRJ-TEST-001',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
        clientName: 'TechCorp Infotech Pvt Ltd',
        paymentMode: 'GST Invoice',
        paymentDate: '2026-03-16',
        amountReceived: 75000,
        currency: 'INR',
        amountINR: 75000,
        notes: 'Partial success test',
      };

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send(payload);

      // Must NOT fail with 500 saying payment failed
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment).toBeDefined();
      expect(res.body.payment.id).toBe(testPaymentId);
      expect(res.body.payment.amountReceived).toBe(75000);

      // GST invoice synchronization was NOT successful
      expect(res.body.gstInvoiceSynced).toBe(false);
      expect(res.body.gstInvoice).toBeNull();
      expect(res.body.warning).toBe('Payment was saved, but automatic GST invoice synchronization failed.');
      expect(res.body.gstSyncError).toContain('Azure SQL GST invoice insert failed');

      // Crucial: No ghost GST invoice lingering in mockStore for this payment
      const lingeringInMock = mockStore.getGstInvoices().find((inv) => inv.paymentId === testPaymentId);
      expect(lingeringInMock).toBeUndefined();
    });
  });

  describe('3. Production Mode with ALLOW_MOCK_FALLBACK=true', () => {
    it('strictly disables fallback in NODE_ENV=production, never returning a mock GST invoice on SQL failure', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_MOCK_FALLBACK = 'true';

      const mockPool = createMockPool({ failGstQuery: true });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      // isMockFallbackAllowed must evaluate to false in production
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockImplementation(() => {
        return process.env.NODE_ENV === 'test'
          ? true
          : process.env.NODE_ENV === 'production'
          ? false
          : process.env.ALLOW_MOCK_FALLBACK === 'true';
      });

      const testPaymentId = 'DDI-PAY-PROD-MOCK-CHECK';
      mockStore.deletePayment(testPaymentId);
      mockStore.deleteGstInvoiceByPaymentId(testPaymentId);

      const payload = {
        id: testPaymentId,
        brand: 'Device Doctor India',
        projectId: 'PRJ-TEST-001',
        paymentMode: 'GST Invoice',
        amountReceived: 20000,
        currency: 'INR',
        amountINR: 20000,
      };

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.gstInvoiceSynced).toBe(false);
      expect(res.body.gstInvoice).toBeNull();
      expect(res.body.gstSyncError).toBeDefined();

      // No mock GST invoice must exist in mockStore
      const lingeringInMock = mockStore.getGstInvoices().find((inv) => inv.paymentId === testPaymentId);
      expect(lingeringInMock).toBeUndefined();
    });
  });

  describe('4. Direct Helper Check: syncPaymentToGstInvoiceSql', () => {
    it('throws in production when Azure SQL GST query fails, never returning mockSynced', async () => {
      const mockPool = createMockPool({ failGstQuery: true });
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const paymentObj: Payment = {
        id: 'DDI-PAY-HELPER-FAIL',
        brand: 'Device Doctor India',
        projectId: 'PRJ-TEST-001',
        clientId: 'CL-001',
        clientName: 'Client 1',
        paymentMode: 'GST Invoice',
        paymentDate: '2026-03-20',
        dueDate: '2026-03-20',
        amountReceived: 10000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 10000,
        referenceUtr: '',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await expect(
        syncPaymentToGstInvoiceSql(mockPool as any, paymentObj)
      ).rejects.toThrow('Azure SQL GST invoice insert failed');
    });

    it('returns mockStore invoice when isMockFallbackAllowed() is true (development/test mode)', async () => {
      const mockPool = createMockPool({ failGstQuery: true });
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(true);

      const paymentObj: Payment = {
        id: 'DDI-PAY-HELPER-FALLBACK',
        brand: 'Device Doctor India',
        projectId: 'PRJ-TEST-001',
        clientId: 'CL-001',
        clientName: 'Client 1',
        paymentMode: 'GST Invoice',
        paymentDate: '2026-03-20',
        dueDate: '2026-03-20',
        amountReceived: 10000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 10000,
        referenceUtr: '',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await syncPaymentToGstInvoiceSql(mockPool as any, paymentObj);
      expect(result).toBeDefined();
      expect(result?.paymentId).toBe('DDI-PAY-HELPER-FALLBACK');
    });

    it('throws when pool is null in production', async () => {
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const paymentObj: Payment = {
        id: 'DDI-PAY-NULL-POOL',
        brand: 'Device Doctor India',
        projectId: 'PRJ-TEST-001',
        clientId: 'CL-001',
        clientName: 'Client 1',
        paymentMode: 'GST Invoice',
        paymentDate: '2026-03-20',
        dueDate: '2026-03-20',
        amountReceived: 5000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 5000,
        referenceUtr: '',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await expect(
        syncPaymentToGstInvoiceSql(null, paymentObj)
      ).rejects.toThrow('Azure SQL Database is offline. Cannot synchronize GST invoice.');
    });
  });

  describe('5. Response Contract Compatibility', () => {
    it('maintains compatibility for Non-GST payment modes', async () => {
      const mockPool = createMockPool({ failGstQuery: false });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-PAY-NONGST-01',
          brand: 'Device Doctor India',
          projectId: 'PRJ-TEST-001',
          paymentMode: 'Cash',
          amountReceived: 15000,
          currency: 'INR',
          amountINR: 15000,
          paymentDate: '2026-03-10',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment).toBeDefined();
      expect(res.body.gstInvoiceSynced).toBe(false);
      expect(res.body.gstInvoice).toBeNull();
      expect(res.body.warning).toBeUndefined();
    });

    it('returns 500 when the payment transaction itself fails in Azure SQL', async () => {
      const mockPool = createMockPool({ failPaymentTransaction: true });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          projectId: 'PRJ-TEST-001',
          paymentMode: 'GST Invoice',
          amountReceived: 10000,
          currency: 'INR',
          amountINR: 10000,
          paymentDate: '2026-03-10',
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('internal database error');
    });
  });
});
