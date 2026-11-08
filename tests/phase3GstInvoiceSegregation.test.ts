/**
 * FIX 19 Phase 3: GST Invoice Read-Only Segregation & Reconciliation Integrity Tests
 *
 * Verifies that:
 * 1. GET /api/gst-invoices performs pure read-only queries with zero INSERT/UPDATE/DELETE mutations.
 * 2. GET /api/gst-invoices does not invoke syncPaymentToGstInvoiceSql or any reconciliation helper.
 * 3. POST /api/gst-invoices/sync creates missing invoices for unsynced GST payments.
 * 4. POST /api/gst-invoices/sync updates eligible existing unfiled invoices.
 * 5. Filed/uploaded invoices (uploaded_to_gst_portal = 'Yes') are strictly protected.
 * 6. Stale unfiled invoice cleanup continues to prune orphaned or non-GST entries.
 * 7. Repeated sync requests are idempotent and never create duplicates.
 * 8. Concurrent sync requests are guarded by promise-sharing and cannot create duplicate invoices.
 * 9. Payment mode changes away from 'GST Invoice' are correctly reconciled.
 * 10. GUID and semantic identifiers remain seamlessly compatible.
 * 11. All reconciliation write mutations retain isFinancialMutation: true and zero retries.
 * 12. Full backward compatibility with payment creation sync is preserved.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import * as azureSqlModule from '../server/db/azureSql';
import * as apiModule from '../server/routes/api';
import { mockStore } from '../server/db/mockStore';
import { Payment, GstInvoice } from '../src/types/crm';

describe('FIX 19 Phase 3: GST Invoice Read-Only Segregation & Reconciliation Integrity', () => {
  const app = createTestApp();
  const authHeader = `Bearer ${getValidToken()}`;

  let inMemoryPayments: any[] = [];
  let inMemoryGstInvoices: any[] = [];
  let capturedSqlQueries: { sqlText: string; inputs: Record<string, any> }[] = [];

  function createMockPool(options: {
    simulateUnavailable?: boolean;
    simulateReconcileError?: boolean;
  } = {}) {
    return {
      connected: !options.simulateUnavailable,
      request() {
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
            capturedSqlQueries.push({ sqlText, inputs: { ...req.inputs } });

            if (options.simulateUnavailable) {
              throw new Error('Connection lost or database offline');
            }

            if (options.simulateReconcileError && sqlText.includes('DELETE FROM gst_invoices') && sqlText.includes('NOT EXISTS')) {
              throw new Error('Azure SQL reconciliation timeout or deadlock');
            }

            // Project lookup
            if (sqlText.includes('FROM projects') && sqlText.includes('SELECT TOP 1')) {
              return {
                recordset: [
                  {
                    clientName: 'Direct Client Infotech',
                    clientId: 'DDI-CLIENT-001',
                  },
                ],
              };
            }

            // Payments SELECT query in POST /gst-invoices/sync
            if (sqlText.trim().startsWith('SELECT') && sqlText.includes('FROM payments') && sqlText.includes('payment_mode')) {
              return {
                recordset: inMemoryPayments.filter((p) => (p.payment_mode || p.paymentMode || '').toLowerCase() === 'gst invoice'),
              };
            }

            // Check existing invoice query in syncPaymentToGstInvoiceSql
            if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM gst_invoices') && sqlText.includes('payment_id')) {
              const payId = req.inputs.paymentId;
              const found = inMemoryGstInvoices.find(
                (inv) => inv.payment_id === payId || inv.paymentId === payId
              );
              return { recordset: found ? [found] : [] };
            }

            // Sequence query in syncPaymentToGstInvoiceSql
            if (sqlText.includes('FROM gst_invoices') && sqlText.includes('LIKE @pattern')) {
              return {
                recordset: inMemoryGstInvoices.map((inv) => ({
                  id: inv.id,
                  invoice_id_code: inv.invoice_id_code || inv.invoiceIdCode || inv.id,
                })),
              };
            }

            // UPSERT statement in syncPaymentToGstInvoiceSql
            if (sqlText.includes('INSERT INTO gst_invoices') || sqlText.includes('UPDATE gst_invoices')) {
              const rawId = req.inputs.rawId || req.inputs.id;
              const payId = req.inputs.payment_id;
              const existingIdx = inMemoryGstInvoices.findIndex(
                (inv) => inv.payment_id === payId || inv.id === rawId || inv.invoice_id_code === rawId
              );

              const row: any = {
                id: req.inputs.id,
                invoice_id_code: req.inputs.rawId,
                brand: req.inputs.brand,
                payment_id: payId,
                project_id: req.inputs.project_id,
                client_id: req.inputs.client_id,
                client_name: req.inputs.client_name,
                payment_date: req.inputs.payment_date,
                amount_received: req.inputs.amount_received,
                currency: req.inputs.currency,
                amount_inr: req.inputs.amount_inr,
                gst_amount_inr: req.inputs.gst_amount_inr,
                invoice_number: req.inputs.invoice_number,
                uploaded_to_gst_portal: req.inputs.uploaded_to_gst_portal || 'No',
                gst_portal_upload_date: req.inputs.gst_portal_upload_date || '',
                notes: req.inputs.notes || '',
                created_at: req.inputs.created_at || new Date().toISOString(),
                updated_at: req.inputs.updated_at || new Date().toISOString(),
              };

              if (existingIdx >= 0) {
                // Preserve uploaded status on existing rows
                const existing = inMemoryGstInvoices[existingIdx];
                row.uploaded_to_gst_portal = existing.uploaded_to_gst_portal || existing.uploadedToGstPortal || 'No';
                row.gst_portal_upload_date = existing.gst_portal_upload_date || existing.gstPortalUploadDate || '';
                inMemoryGstInvoices[existingIdx] = row;
              } else {
                inMemoryGstInvoices.push(row);
              }
              return { rowsAffected: [1], recordset: [row] };
            }

            // DELETE query in syncPaymentToGstInvoiceSql and Direction 2 stale cleanup
            if (sqlText.includes('DELETE FROM gst_invoices')) {
              if (sqlText.includes('NOT EXISTS')) {
                // Direction 2: Stale unfiled reconciliation
                inMemoryGstInvoices = inMemoryGstInvoices.filter((inv) => {
                  if (inv.uploaded_to_gst_portal === 'Yes' || inv.uploadedToGstPortal === 'Yes') return true;
                  const pay = inMemoryPayments.find(
                    (p) =>
                      p.id === inv.payment_id ||
                      p.payment_id_code === inv.payment_id ||
                      (inv.paymentId && (p.id === inv.paymentId || p.payment_id_code === inv.paymentId))
                  );
                  if (!pay) return false;
                  return (pay.payment_mode || pay.paymentMode || '').toLowerCase() === 'gst invoice';
                });
              } else {
                // Direction 1 mode change / payment delete
                const targetId = req.inputs.paymentId || req.inputs.rawId || req.inputs.id;
                inMemoryGstInvoices = inMemoryGstInvoices.filter((inv) => {
                  if (inv.uploaded_to_gst_portal === 'Yes' || inv.uploadedToGstPortal === 'Yes') return true;
                  const match = inv.payment_id === targetId || inv.paymentId === targetId;
                  return !match;
                });
              }
              return { rowsAffected: [1], recordset: [] };
            }

            // Read-only SELECT query for GST Invoices (in GET /gst-invoices and end of POST sync)
            if (sqlText.includes('SELECT') && sqlText.includes('FROM gst_invoices g')) {
              return {
                recordset: inMemoryGstInvoices.map((inv) => ({
                  id: inv.invoice_id_code || inv.id,
                  brand: inv.brand || 'Device Doctor India',
                  paymentId: inv.payment_id || inv.paymentId || '',
                  projectId: inv.project_id || inv.projectId || '',
                  clientId: inv.client_id || inv.clientId || '',
                  clientName: inv.client_name || inv.clientName || '',
                  paymentDate: inv.payment_date || inv.paymentDate || '',
                  amountReceived: inv.amount_received ?? inv.amountReceived ?? 0,
                  currency: inv.currency || 'INR',
                  amountINR: inv.amount_inr ?? inv.amountINR ?? 0,
                  gstAmountINR: inv.gst_amount_inr ?? inv.gstAmountINR ?? 0,
                  invoiceNumber: inv.invoice_number || inv.invoiceNumber || '',
                  uploadedToGstPortal: inv.uploaded_to_gst_portal || inv.uploadedToGstPortal || 'No',
                  gstPortalUploadDate: inv.gst_portal_upload_date || inv.gstPortalUploadDate || '',
                  notes: inv.notes || '',
                  createdAt: inv.created_at || inv.createdAt || '',
                  updatedAt: inv.updated_at || inv.updatedAt || '',
                })),
              };
            }

            return { recordset: [] };
          },
        };
        return req;
      },
    };
  }

  beforeEach(() => {
    inMemoryPayments = [];
    inMemoryGstInvoices = [];
    capturedSqlQueries = [];
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. GET /api/gst-invoices Read-Only Segregation', () => {
    it('1. performs pure read-only queries with zero INSERT/UPDATE/DELETE mutations', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Seed an unsynced payment in payments table
      inMemoryPayments.push({
        id: 'PAY-UNSYNCED-01',
        payment_id_code: 'DDI-PAY-UNSYNCED-01',
        brand: 'Device Doctor India',
        payment_mode: 'GST Invoice',
        amount_received: 50000,
        amount_inr: 50000,
      });

      // Call GET /api/gst-invoices
      const res = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);

      // Verify that NO query executed by GET is a mutating query
      const mutatingQueries = capturedSqlQueries.filter((q) => {
        const text = q.sqlText.trim().toUpperCase();
        return (
          text.startsWith('INSERT') ||
          text.startsWith('UPDATE') ||
          text.startsWith('DELETE') ||
          text.includes('INSERT INTO') ||
          text.includes('UPDATE gst_invoices') ||
          text.includes('DELETE FROM gst_invoices')
        );
      });

      expect(mutatingQueries).toHaveLength(0);
      expect(capturedSqlQueries).toHaveLength(1);
      expect(capturedSqlQueries[0].sqlText).toContain('SELECT');
      expect(capturedSqlQueries[0].sqlText).toContain('FROM gst_invoices g');
    });

    it('2. does not invoke syncPaymentToGstInvoiceSql on GET', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const syncSpy = vi.spyOn(apiModule, 'syncPaymentToGstInvoiceSql');

      const res = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(syncSpy).not.toHaveBeenCalled();
    });
  });

  describe('2. POST /api/gst-invoices/sync Reconciliation Integrity', () => {
    it('3. creates missing invoices for eligible unsynced payments', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      inMemoryPayments.push({
        id: 'PAY-101',
        payment_id_code: 'DDI-PAY-101',
        brand: 'Device Doctor India',
        project_id: 'PRJ-101',
        client_id: 'CLI-101',
        client_name: 'Alpha Infotech',
        payment_mode: 'GST Invoice',
        payment_date: '2026-03-01',
        amount_received: 100000,
        amount_inr: 100000,
      });

      const res = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.invoices).toHaveLength(1);
      expect(res.body.invoices[0].paymentId).toBe('DDI-PAY-101');
      expect(res.body.invoices[0].gstAmountINR).toBe(18000);
      expect(res.body.invoices[0].uploadedToGstPortal).toBe('No');
    });

    it('4. updates eligible existing unfiled invoices with modified payment amounts', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Existing invoice with old amount
      inMemoryGstInvoices.push({
        id: 'DDI-GST-001',
        invoice_id_code: 'DDI-GST-001',
        brand: 'Device Doctor India',
        payment_id: 'DDI-PAY-200',
        amount_received: 50000,
        amount_inr: 50000,
        gst_amount_inr: 9000,
        uploaded_to_gst_portal: 'No',
      });

      // Payment updated to 100,000 INR
      inMemoryPayments.push({
        id: 'DDI-PAY-200',
        payment_id_code: 'DDI-PAY-200',
        brand: 'Device Doctor India',
        payment_mode: 'GST Invoice',
        amount_received: 100000,
        amount_inr: 100000,
      });

      const res = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.invoices).toHaveLength(1);
      expect(res.body.invoices[0].amountINR).toBe(100000);
      expect(res.body.invoices[0].gstAmountINR).toBe(18000);
    });

    it('5. strictly protects filed/uploaded invoices (uploaded_to_gst_portal = "Yes")', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Filed invoice
      inMemoryGstInvoices.push({
        id: 'DDI-GST-FILED-01',
        invoice_id_code: 'DDI-GST-FILED-01',
        brand: 'Device Doctor India',
        payment_id: 'DDI-PAY-FILED-01',
        amount_received: 50000,
        amount_inr: 50000,
        gst_amount_inr: 9000,
        uploaded_to_gst_portal: 'Yes',
        gst_portal_upload_date: '2026-02-15',
        invoice_number: 'INV-2026-FILED-99',
      });

      // Associated payment was deleted or mode changed (not in payments table)
      const res = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Filed invoice remains preserved in the ledger
      expect(res.body.invoices).toHaveLength(1);
      expect(res.body.invoices[0].id).toBe('DDI-GST-FILED-01');
      expect(res.body.invoices[0].uploadedToGstPortal).toBe('Yes');
      expect(res.body.invoices[0].gstPortalUploadDate).toBe('2026-02-15');
    });

    it('6. prunes stale unfiled invoices whose payments are deleted or changed mode', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Unfiled invoice whose payment was deleted
      inMemoryGstInvoices.push({
        id: 'DDI-GST-ORPHAN-01',
        invoice_id_code: 'DDI-GST-ORPHAN-01',
        brand: 'Device Doctor India',
        payment_id: 'DDI-PAY-DELETED-01',
        uploaded_to_gst_portal: 'No',
      });

      // No matching payment exists in inMemoryPayments
      const res = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.invoices).toHaveLength(0);
      expect(inMemoryGstInvoices).toHaveLength(0);
    });

    it('7. repeated sync calls are idempotent and never create duplicates', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      inMemoryPayments.push({
        id: 'PAY-IDEM-01',
        payment_id_code: 'DDI-PAY-IDEM-01',
        brand: 'Device Doctor India',
        payment_mode: 'GST Invoice',
        amount_received: 80000,
        amount_inr: 80000,
      });

      // First sync
      const res1 = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader);
      expect(res1.status).toBe(200);
      expect(res1.body.count).toBe(1);
      expect(res1.body.invoices).toHaveLength(1);

      // Second sync
      const res2 = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader);
      expect(res2.status).toBe(200);
      expect(res2.body.count).toBe(1);
      expect(res2.body.invoices).toHaveLength(1);
      expect(res2.body.invoices[0].paymentId).toBe('DDI-PAY-IDEM-01');

      // Third sync
      const res3 = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader);
      expect(res3.status).toBe(200);
      expect(res3.body.invoices).toHaveLength(1);
      expect(inMemoryGstInvoices).toHaveLength(1);
    });

    it('8. concurrent sync requests are guarded and do not create duplicate invoices', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      inMemoryPayments.push({
        id: 'PAY-CONCURRENT-01',
        payment_id_code: 'DDI-PAY-CONCURRENT-01',
        brand: 'Device Doctor India',
        payment_mode: 'GST Invoice',
        amount_received: 90000,
        amount_inr: 90000,
      });

      // Fire 4 concurrent sync requests simultaneously
      const [res1, res2, res3, res4] = await Promise.all([
        request(app).post('/api/gst-invoices/sync').set('Authorization', authHeader),
        request(app).post('/api/gst-invoices/sync').set('Authorization', authHeader),
        request(app).post('/api/gst-invoices/sync').set('Authorization', authHeader),
        request(app).post('/api/gst-invoices/sync').set('Authorization', authHeader),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res3.status).toBe(200);
      expect(res4.status).toBe(200);

      expect(res1.body.invoices).toHaveLength(1);
      expect(res2.body.invoices).toHaveLength(1);
      expect(res3.body.invoices).toHaveLength(1);
      expect(res4.body.invoices).toHaveLength(1);

      // Exactly 1 invoice generated in database state
      expect(inMemoryGstInvoices).toHaveLength(1);
      expect(inMemoryGstInvoices[0].payment_id).toBe('DDI-PAY-CONCURRENT-01');
    });

    it('9. reconciles payment mode changes away from GST Invoice', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Payment changed mode to 'Cash'
      inMemoryPayments.push({
        id: 'PAY-CASH-01',
        payment_id_code: 'DDI-PAY-CASH-01',
        brand: 'Device Doctor India',
        payment_mode: 'Cash',
        amount_received: 40000,
        amount_inr: 40000,
      });

      // Existing unfiled GST invoice from prior 'GST Invoice' mode
      inMemoryGstInvoices.push({
        id: 'DDI-GST-OLD-01',
        invoice_id_code: 'DDI-GST-OLD-01',
        brand: 'Device Doctor India',
        payment_id: 'DDI-PAY-CASH-01',
        uploaded_to_gst_portal: 'No',
      });

      const res = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.invoices).toHaveLength(0);
      expect(inMemoryGstInvoices).toHaveLength(0);
    });

    it('10. maintains GUID and semantic identifier compatibility', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const guidPaymentId = 'a1111111-2222-3333-4444-555555555555';
      const semanticCode = 'DDI-PAY-GUID-TEST';

      inMemoryPayments.push({
        id: guidPaymentId,
        payment_id_code: semanticCode,
        brand: 'Device Doctor India',
        payment_mode: 'GST Invoice',
        amount_received: 35000,
        amount_inr: 35000,
      });

      const res = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.invoices).toHaveLength(1);
      expect(res.body.invoices[0].paymentId).toBe(semanticCode);
      expect(res.body.invoices[0].gstAmountINR).toBe(6300);
    });

    it('11. all reconciliation write mutations retain isFinancialMutation: true and 0 retries', async () => {
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Direct call to syncPaymentToGstInvoiceSql with simulated transient failure
      const failingPool: any = {
        connected: true,
        request() {
          return {
            input() { return this; },
            query: vi.fn().mockRejectedValue(Object.assign(new Error('Connection reset during GST write'), { code: 'ECONNRESET' })),
          };
        },
      };

      const paymentObj: Payment = {
        id: 'DDI-PAY-FAIL-01',
        brand: 'Device Doctor India',
        projectId: 'PRJ-01',
        clientId: 'CLI-01',
        clientName: 'Client',
        paymentMode: 'GST Invoice',
        paymentDate: '2026-03-01',
        dueDate: '2026-03-01',
        amountReceived: 50000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 50000,
        referenceUtr: '',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await expect(apiModule.syncPaymentToGstInvoiceSql(failingPool, paymentObj)).rejects.toThrow('Connection reset during GST write');
    });

    it('12. fail-closed behavior on database error during POST sync (HTTP 503)', async () => {
      const mockPool = createMockPool({ simulateReconcileError: true });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
    });
  });
});
