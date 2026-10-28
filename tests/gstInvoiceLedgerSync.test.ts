import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import * as azureSqlModule from '../server/db/azureSql';
import { mockStore } from '../server/db/mockStore';
import { syncPaymentToGstInvoiceSql } from '../server/routes/api';
import { Payment } from '../src/types/crm';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('FIX 14: GST Invoice Ledger & Synchronization Tests', () => {
  let capturedSqlQueries: { sqlText: string; inputs: Record<string, any> }[] = [];
  let inMemoryPayments: any[] = [];
  let inMemoryGstInvoices: any[] = [];

  beforeEach(() => {
    capturedSqlQueries = [];
    inMemoryPayments = [];
    inMemoryGstInvoices = [];
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockPool(options: {
    simulateConversionErrorOnce?: boolean;
    simulateUnavailable?: boolean;
    failSyncQuery?: boolean;
  } = {}) {
    let conversionFailedOnce = false;

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
            capturedSqlQueries.push({ sqlText, inputs: { ...req.inputs } });

            if (options.simulateUnavailable) {
              throw new Error('Connection lost or database offline');
            }

            if (options.simulateConversionErrorOnce && sqlText.includes('gst_invoices') && !conversionFailedOnce) {
              conversionFailedOnce = true;
              throw new Error('Conversion failed when converting from a character string to uniqueidentifier.');
            }

            if (options.failSyncQuery && sqlText.includes('gst_invoices')) {
              throw new Error('Azure SQL GST invoice insert failed: Network timeout or constraint failure');
            }

            // Project lookup
            if (sqlText.includes('FROM projects') && sqlText.includes('SELECT TOP 1')) {
              return {
                recordset: [
                  {
                    clientName: 'TechCorp Infotech Pvt Ltd',
                    clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
                  },
                ],
              };
            }

            // Payments UTR check
            if (sqlText.includes('FROM payments') && sqlText.includes('SELECT TOP 1') && sqlText.includes('reference_utr')) {
              return { recordset: [] };
            }

            // Check existing payment
            if (sqlText.includes('FROM payments') && sqlText.includes('SELECT TOP 1')) {
              return { recordset: [] };
            }

            // Payments save query
            if (sqlText.includes('BEGIN TRANSACTION') && sqlText.includes('payments')) {
              const pay = {
                id: req.inputs.id || 'f1111111-2222-3333-4444-555555555555',
                payment_id_code: req.inputs.rawId || 'DDI-PAY-001',
                brand: req.inputs.brand || 'Device Doctor India',
                project_id: req.inputs.project_id,
                client_id: req.inputs.client_id,
                client_name: req.inputs.client_name,
                payment_mode: req.inputs.payment_mode,
                payment_date: req.inputs.payment_date,
                amount_received: req.inputs.amount_received,
                currency: req.inputs.currency,
                amount_inr: req.inputs.amount_inr,
                reference_utr: req.inputs.reference_utr,
                payment_status: req.inputs.payment_status,
                notes: req.inputs.notes,
                created_at: req.inputs.created_at,
                updated_at: req.inputs.updated_at,
              };
              inMemoryPayments.push(pay);
              return { recordset: [], rowsAffected: [1] };
            }

            // Check existing GST invoice by paymentId
            if (sqlText.includes('FROM gst_invoices') && sqlText.includes('SELECT TOP 1') && (sqlText.includes('payment_id') || sqlText.includes('paymentId'))) {
              const payId = req.inputs.paymentId || '';
              const found = inMemoryGstInvoices.find(
                (inv) => inv.payment_id === payId || inv.paymentId === payId || inv.payment_id_code === payId
              );
              if (found) {
                return {
                  recordset: [
                    {
                      ...found,
                      id: found.id,
                      invoice_id_code: found.invoice_id_code || found.invoiceIdCode || '',
                      invoiceIdCode: found.invoice_id_code || found.invoiceIdCode || '',
                      invoiceNumber: found.invoice_number || found.invoiceNumber || '',
                      invoice_number: found.invoice_number || found.invoiceNumber || '',
                      uploadedToGstPortal: found.uploaded_to_gst_portal || found.uploadedToGstPortal || 'No',
                      uploaded_to_gst_portal: found.uploaded_to_gst_portal || found.uploadedToGstPortal || 'No',
                      gstPortalUploadDate: found.gst_portal_upload_date || found.gstPortalUploadDate || '',
                      gst_portal_upload_date: found.gst_portal_upload_date || found.gstPortalUploadDate || '',
                      notes: found.notes || '',
                    },
                  ],
                };
              }
              return { recordset: [] };
            }

            // Sequence calculation query for gst_invoices
            if (sqlText.includes('FROM gst_invoices') && sqlText.includes('@pattern')) {
              return {
                recordset: inMemoryGstInvoices.map((inv) => ({
                  id: inv.id,
                  invoice_id_code: inv.invoice_id_code || inv.id,
                })),
              };
            }

            // Upsert / Insert / Update GST invoice
            if (sqlText.includes('gst_invoices') && (sqlText.includes('INSERT INTO') || sqlText.includes('UPDATE gst_invoices'))) {
              const existingIdx = inMemoryGstInvoices.findIndex(
                (inv) => inv.payment_id === req.inputs.payment_id || inv.id === req.inputs.id || inv.invoice_id_code === req.inputs.rawId
              );

              const record = {
                id: req.inputs.id,
                invoice_id_code: req.inputs.rawId,
                brand: req.inputs.brand,
                payment_id: req.inputs.payment_id,
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
                notes: req.inputs.notes,
                created_at: req.inputs.created_at || new Date().toISOString(),
                updated_at: req.inputs.updated_at || new Date().toISOString(),
              };

              if (existingIdx >= 0) {
                inMemoryGstInvoices[existingIdx] = { ...inMemoryGstInvoices[existingIdx], ...record };
              } else {
                inMemoryGstInvoices.push(record);
              }
              return { recordset: [], rowsAffected: [1] };
            }

            // Fetch unsynced payments for self-healing GET
            if (sqlText.includes('FROM payments p') && sqlText.includes('NOT EXISTS') && sqlText.includes('gst_invoices')) {
              const unsynced = inMemoryPayments
                .filter((p) => {
                  const isGst = (p.payment_mode || '').toLowerCase() === 'gst invoice';
                  const hasGst = inMemoryGstInvoices.some(
                    (g) => g.payment_id === p.id || g.payment_id === p.payment_id_code
                  );
                  return isGst && !hasGst;
                })
                .map((p) => ({
                  id: p.id,
                  paymentIdCode: p.payment_id_code || p.paymentIdCode || '',
                  brand: p.brand || 'Device Doctor India',
                  projectId: p.project_id || p.projectId || '',
                  clientId: p.client_id || p.clientId || '',
                  clientName: p.client_name || p.clientName || '',
                  paymentDate: p.payment_date || p.paymentDate || '',
                  amountReceived: p.amount_received ?? p.amountReceived ?? 0,
                  currency: p.currency || 'INR',
                  amountINR: p.amount_inr ?? p.amountINR ?? 0,
                  notes: p.notes || '',
                }));
              return { recordset: unsynced };
            }

            // Query payments for POST /gst-invoices/sync
            if (sqlText.includes('FROM payments') && sqlText.includes('payment_mode')) {
              const gstPayments = inMemoryPayments
                .filter((p) => (p.payment_mode || '').toLowerCase() === 'gst invoice')
                .map((p) => ({
                  id: p.id,
                  paymentIdCode: p.payment_id_code || p.paymentIdCode || '',
                  brand: p.brand || 'Device Doctor India',
                  projectId: p.project_id || p.projectId || '',
                  clientId: p.client_id || p.clientId || '',
                  clientName: p.client_name || p.clientName || '',
                  paymentDate: p.payment_date || p.paymentDate || '',
                  amountReceived: p.amount_received ?? p.amountReceived ?? 0,
                  currency: p.currency || 'INR',
                  amountINR: p.amount_inr ?? p.amountINR ?? 0,
                  notes: p.notes || '',
                }));
              return { recordset: gstPayments };
            }

            // Query all GST invoices for GET /gst-invoices or POST /gst-invoices/sync
            if (sqlText.includes('FROM gst_invoices') && sqlText.includes('ORDER BY created_at')) {
              return {
                recordset: inMemoryGstInvoices.map((inv) => ({
                  id: inv.invoice_id_code || inv.id,
                  brand: inv.brand,
                  paymentId: inv.payment_id,
                  projectId: inv.project_id,
                  clientId: inv.client_id,
                  clientName: inv.client_name,
                  paymentDate: inv.payment_date,
                  amountReceived: inv.amount_received,
                  currency: inv.currency,
                  amountINR: inv.amount_inr,
                  gstAmountINR: inv.gst_amount_inr,
                  invoiceNumber: inv.invoice_number,
                  uploadedToGstPortal: inv.uploaded_to_gst_portal,
                  gstPortalUploadDate: inv.gst_portal_upload_date,
                  notes: inv.notes,
                  createdAt: inv.created_at,
                  updatedAt: inv.updated_at,
                })),
              };
            }

            // Payment deletion
            if (sqlText.includes('DELETE FROM payments')) {
              const targetId = req.inputs.rawId || req.inputs.id;
              inMemoryPayments = inMemoryPayments.filter(
                (p) => p.id !== targetId && p.payment_id_code !== targetId
              );
              inMemoryGstInvoices = inMemoryGstInvoices.filter(
                (g) => g.payment_id !== targetId && (g.uploaded_to_gst_portal === 'Yes')
              );
              return { recordset: [], rowsAffected: [1] };
            }

            return { recordset: [], rowsAffected: [1] };
          },
        };
        return req;
      },
    };
  }

  describe('1. Payment with GST Invoice Mode Appears in GST Ledger', () => {
    it('automatically synchronizes payment into GST invoice table upon creation', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const payload = {
        id: 'DDI-PAY-GST-101',
        brand: 'Device Doctor India',
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-SERVER-AMC',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
        clientName: 'TechCorp Infotech Pvt Ltd',
        paymentMode: 'GST Invoice',
        paymentDate: '2026-10-28',
        amountReceived: 100000,
        currency: 'INR',
        amountINR: 100000,
        referenceUtr: 'UTR-GST-SYNC-101',
      };

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.gstInvoiceSynced).toBe(true);
      expect(res.body.gstInvoice).toBeDefined();
      expect(res.body.gstInvoice.id).toBe('DDI-GST-001');
      expect(res.body.gstInvoice.gstAmountINR).toBe(18000);
      expect(res.body.gstInvoice.invoiceNumber).toMatch(/^INV-2026-/);

      // Now fetch GST invoices list via GET /api/gst-invoices
      const listRes = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body)).toBe(true);
      expect(listRes.body.length).toBe(1);
      expect(listRes.body[0].paymentId).toBe('DDI-PAY-GST-101');
      expect(listRes.body[0].gstAmountINR).toBe(18000);
    });
  });

  describe('2. Existing Eligible Payments Synchronized via POST /api/gst-invoices/sync', () => {
    it('synchronizes all eligible payments lacking GST ledger entries when sync is triggered', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Seed an eligible payment directly into inMemoryPayments
      inMemoryPayments.push({
        id: 'b2222222-3333-4444-5555-666666666666',
        payment_id_code: 'DDI-PAY-UNSYNCED-01',
        brand: 'Device Doctor India',
        project_id: 'PRJ-TEST-001',
        client_id: 'DDI-CLIENT-001',
        client_name: 'Alpha Corp',
        payment_mode: 'GST Invoice',
        payment_date: '2026-10-25',
        amount_received: 50000,
        currency: 'INR',
        amount_inr: 50000,
      });

      // Trigger sync
      const syncRes = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(syncRes.status).toBe(200);
      expect(syncRes.body.success).toBe(true);
      expect(syncRes.body.count).toBe(1);
      expect(syncRes.body.invoices.length).toBe(1);
      expect(syncRes.body.invoices[0].paymentId).toBe('DDI-PAY-UNSYNCED-01');
      expect(syncRes.body.invoices[0].gstAmountINR).toBe(9000);
    });
  });

  describe('3. Idempotency: Repeated Synchronization Does Not Create Duplicate Invoices', () => {
    it('updates existing ledger entry without duplicating when sync is triggered repeatedly', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      inMemoryPayments.push({
        id: 'c3333333-4444-5555-6666-777777777777',
        payment_id_code: 'DDI-PAY-REPEAT-01',
        brand: 'Device Doctor India',
        project_id: 'PRJ-TEST-001',
        client_id: 'DDI-CLIENT-001',
        client_name: 'Repeat Client Pvt Ltd',
        payment_mode: 'GST Invoice',
        payment_date: '2026-10-26',
        amount_received: 60000,
        currency: 'INR',
        amount_inr: 60000,
      });

      // First sync
      const firstSync = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(firstSync.status).toBe(200);
      expect(firstSync.body.invoices.length).toBe(1);
      const firstInvoiceId = firstSync.body.invoices[0].id;

      // Second sync (repeated)
      const secondSync = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(secondSync.status).toBe(200);
      expect(secondSync.body.invoices.length).toBe(1);
      expect(secondSync.body.invoices[0].id).toBe(firstInvoiceId);

      // Third sync (repeated)
      const thirdSync = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(thirdSync.status).toBe(200);
      expect(thirdSync.body.invoices.length).toBe(1);
      expect(thirdSync.body.invoices[0].id).toBe(firstInvoiceId);
    });
  });

  describe('4. Non-GST Payment Modes Are Not Included', () => {
    it('ignores Cash, Non GST Online, and Crypto payment modes from GST synchronization', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const nonGstModes = ['Non GST Online', 'Cash', 'Crypto'];
      for (const mode of nonGstModes) {
        const res = await request(app)
          .post('/api/payments')
          .set('Authorization', authHeader)
          .send({
            id: `DDI-PAY-${mode.replace(/\s+/g, '')}-01`,
            brand: 'Device Doctor India',
            amountReceived: 25000,
            currency: 'INR',
            amountINR: 25000,
            paymentMode: mode,
            referenceUtr: `UTR-${mode.replace(/\s+/g, '')}-01`,
          });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.gstInvoiceSynced).toBe(false);
        expect(res.body.gstInvoice).toBeNull();
      }

      // Ensure GST invoices ledger is still empty
      const listRes = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);

      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBe(0);
    });
  });

  describe('5. SQL Type Conversions & Identifier Joins Work Correctly', () => {
    it('uses explicit CAST on uniqueidentifier comparisons in syncPaymentToGstInvoiceSql queries', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const testPayment: Payment = {
        id: 'DDI-PAY-TYPE-CHECK',
        brand: 'Device Doctor India',
        projectId: 'PRJ-TYPE-01',
        clientId: 'CLI-TYPE-01',
        clientName: 'Type Check Client',
        paymentMode: 'GST Invoice',
        paymentDate: '2026-10-28',
        dueDate: '2026-10-28',
        amountReceived: 80000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 80000,
        referenceUtr: 'UTR-TYPE-01',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await syncPaymentToGstInvoiceSql(mockPool as any, testPayment);
      expect(result).toBeDefined();

      // Check captured SQL queries for explicit string casts
      const checkQuery = capturedSqlQueries.find((q) => q.sqlText.includes('FROM gst_invoices') && q.sqlText.includes('TOP 1'));
      expect(checkQuery).toBeDefined();
      expect(checkQuery!.sqlText).toContain('CAST(payment_id AS NVARCHAR(150)) = @paymentId');

      const seqQuery = capturedSqlQueries.find((q) => q.sqlText.includes('WHERE CAST(id AS NVARCHAR(100)) LIKE @pattern'));
      expect(seqQuery).toBeDefined();

      const upsertQuery = capturedSqlQueries.find((q) => q.sqlText.includes('WITH (UPDLOCK, HOLDLOCK)'));
      expect(upsertQuery).toBeDefined();
      expect(upsertQuery!.sqlText).toContain('CAST(payment_id AS NVARCHAR(150)) = @payment_id');
      expect(upsertQuery!.sqlText).toContain('CAST(id AS NVARCHAR(150)) = @id');
    });

    it('seamlessly recovers and retries with GUID bindings when uniqueidentifier error occurs', async () => {
      const mockPool = createMockPool({ simulateConversionErrorOnce: true });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const testPayment: Payment = {
        id: 'DDI-PAY-RETRY-GUID-01',
        brand: 'Device Doctor India',
        projectId: 'PRJ-RETRY-01',
        clientId: 'CLI-RETRY-01',
        clientName: 'Retry Corp',
        paymentMode: 'GST Invoice',
        paymentDate: '2026-10-28',
        dueDate: '2026-10-28',
        amountReceived: 45000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 45000,
        referenceUtr: 'UTR-RETRY-GUID-01',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await syncPaymentToGstInvoiceSql(mockPool as any, testPayment);
      expect(result).toBeDefined();
      expect(result?.id).toBe('DDI-GST-001');
    });
  });

  describe('6. Database Unavailability Produces Correct Fail-Closed API Response', () => {
    it('GET /api/gst-invoices returns HTTP 503 and never returns fabricated mock store data on SQL failure', async () => {
      const mockPool = createMockPool({ simulateUnavailable: true });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(res.body.message).toContain('Cannot complete fetch gst-invoices');
    });

    it('POST /api/gst-invoices/sync returns HTTP 503 when database is unavailable', async () => {
      const mockPool = createMockPool({ simulateUnavailable: true });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(res.body.message).toContain('Cannot complete sync GST invoices');
    });

    it('returns 503 when connection pool is null in production', async () => {
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(null);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
    });
  });

  describe('7. GST Invoice UI Contract & Distinguishing Empty vs Failed Request', () => {
    it('GET /api/gst-invoices returns 200 with empty array [] when database is healthy and has 0 invoices', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
      // Confirmed genuine empty result returns HTTP 200 []
    });

    it('GET /api/gst-invoices returns 503 error contract when request fails, allowing UI to distinguish from []', async () => {
      const mockPool = createMockPool({ simulateUnavailable: true });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(Array.isArray(res.body)).toBe(false);
      // Confirmed failure produces 503 error instead of masking as empty array
    });
  });

  describe('8. Existing Payment Recording, Deletion & Recalculation Safeguards', () => {
    it('deleting a payment cleans up unfiled linked GST invoices while preserving filed invoices', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const paymentId = 'DDI-PAY-DEL-01';
      inMemoryPayments.push({
        id: 'd4444444-5555-6666-7777-888888888888',
        payment_id_code: paymentId,
        brand: 'Device Doctor India',
        payment_mode: 'GST Invoice',
        amount_received: 30000,
      });

      inMemoryGstInvoices.push({
        id: 'DDI-GST-DEL-01',
        payment_id: paymentId,
        uploaded_to_gst_portal: 'No',
      });

      // Delete the payment
      const delRes = await request(app)
        .delete(`/api/payments/${paymentId}`)
        .set('Authorization', authHeader);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify delete payment SQL executed with linked GST invoice cleanup
      const delQuery = capturedSqlQueries.find((q) => q.sqlText.includes('DELETE FROM payments'));
      expect(delQuery).toBeDefined();
      expect(delQuery!.sqlText).toContain('DELETE FROM gst_invoices');
      expect(delQuery!.sqlText).toContain('CAST(payment_id AS NVARCHAR(150))');
    });
  });
});
