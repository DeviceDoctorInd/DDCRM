/**
 * FIX 19 Phase 3 Step 2: GST Invoice Read-Only Segregation Tests
 *
 * Verifies that:
 * 1. mockStore.getGstInvoices() does not create missing invoices from payments.
 * 2. GET does not delete stale unfiled invoices from mock storage.
 * 3. GET does not mutate the original invoice array (immutability / defensive copying).
 * 4. Brand filtering continues to work as expected in mockStore.getGstInvoices().
 * 5. GET /api/gst-invoices issues strictly read-only SELECT queries with 0 database mutations (0 INSERT, 0 UPDATE, 0 DELETE).
 * 6. POST /api/gst-invoices/sync safely creates missing invoices for eligible payments.
 * 7. POST sync updates eligible unfiled invoices when payment details change.
 * 8. Filed invoices (uploaded_to_gst_portal = 'Yes') remain strictly protected from deletion or overwrite.
 * 9. Stale unfiled invoice cleanup still works correctly through POST sync.
 * 10. Repeated sync is idempotent and never creates duplicate invoices.
 * 11. Concurrent sync requests remain protected and deduplicated via activeGstSyncPromises.
 * 12. Payment mode changes and identifier compatibility (semantic vs GUID) remain fully intact.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import * as azureSqlModule from '../server/db/azureSql';
import { mockStore } from '../server/db/mockStore';
import { GstInvoice, Payment } from '../src/types/crm';

describe('FIX 19 Phase 3: GST Invoice Read-Only Segregation Tests', () => {
  const app = createTestApp();
  const authHeader = `Bearer ${getValidToken()}`;

  let inMemoryPayments: any[] = [];
  let inMemoryGstInvoices: any[] = [];
  let capturedSqlQueries: { sqlText: string; inputs: Record<string, any> }[] = [];

  function createMockPool() {
    return {
      connected: true,
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

            // Filed invoice check
            if (sqlText.includes('FROM gst_invoices') && sqlText.includes('uploaded_to_gst_portal = \'Yes\'')) {
              const cleanId = req.inputs.rawId || req.inputs.cleanId || req.inputs.id;
              const dbId = req.inputs.dbId;
              const dbCode = req.inputs.dbCode;
              const filed = inMemoryGstInvoices.find(
                (inv) =>
                  (inv.uploaded_to_gst_portal === 'Yes' || inv.uploadedToGstPortal === 'Yes') &&
                  (inv.payment_id === cleanId ||
                    inv.paymentId === cleanId ||
                    inv.payment_id === dbId ||
                    inv.payment_id === dbCode)
              );
              return { recordset: filed ? [filed] : [] };
            }

            // Project lookup
            if (sqlText.includes('FROM projects') && sqlText.includes('SELECT TOP 1')) {
              return {
                recordset: [
                  {
                    clientName: 'Alpha Tech Enterprises',
                    clientId: 'DDI-CLIENT-ALPHA',
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
              const targetId = req.inputs.rawId || req.inputs.id;
              const found = inMemoryPayments.find(
                (p) => p.id === targetId || p.payment_id_code === targetId
              );
              return { recordset: found ? [found] : [] };
            }

            // Payments save query
            if (sqlText.includes('BEGIN TRANSACTION') && sqlText.includes('payments')) {
              const targetId = req.inputs.rawId || req.inputs.id || 'DDI-PAY-001';
              const existingIdx = inMemoryPayments.findIndex(
                (p) => p.id === targetId || p.payment_id_code === targetId || p.id === req.inputs.id
              );
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
              if (existingIdx >= 0) {
                inMemoryPayments[existingIdx] = { ...inMemoryPayments[existingIdx], ...pay };
              } else {
                inMemoryPayments.push(pay);
              }
              return { recordset: [], rowsAffected: [1] };
            }

            // Check existing GST invoice by id / invoice_id_code / paymentId
            if (sqlText.includes('FROM gst_invoices') && sqlText.includes('SELECT TOP 1')) {
              const targetId = req.inputs.rawId || req.inputs.id || req.inputs.paymentId || '';
              const found = inMemoryGstInvoices.find(
                (inv) =>
                  inv.id === targetId ||
                  inv.invoice_id_code === targetId ||
                  inv.invoiceIdCode === targetId ||
                  inv.payment_id === targetId ||
                  inv.paymentId === targetId
              );
              if (found) {
                return {
                  recordset: [
                    {
                      ...found,
                      id: found.id,
                      invoice_id_code: found.invoice_id_code || found.invoiceIdCode || '',
                      invoiceIdCode: found.invoice_id_code || found.invoiceIdCode || '',
                      brand: found.brand || 'Device Doctor India',
                      invoice_number: found.invoice_number || found.invoiceNumber || '',
                      invoiceNumber: found.invoice_number || found.invoiceNumber || '',
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
            if (sqlText.includes('gst_invoices') && (sqlText.includes('INSERT INTO') || sqlText.includes('UPDATE gst_invoices') || sqlText.includes('UPDATE\n              gst_invoices'))) {
              const targetPaymentId = req.inputs.payment_id || req.inputs.paymentId;
              const existingIdx = inMemoryGstInvoices.findIndex(
                (inv) =>
                  (targetPaymentId && (inv.payment_id === targetPaymentId || inv.paymentId === targetPaymentId)) ||
                  inv.id === req.inputs.id ||
                  inv.invoice_id_code === req.inputs.rawId
              );

              const record = {
                id: req.inputs.id || 'new-gst-guid',
                invoice_id_code: req.inputs.rawId || 'DDI-GST-001',
                invoiceIdCode: req.inputs.rawId || 'DDI-GST-001',
                brand: req.inputs.brand || 'Device Doctor India',
                payment_id: targetPaymentId,
                paymentId: targetPaymentId,
                project_id: req.inputs.project_id || '',
                client_id: req.inputs.client_id || '',
                client_name: req.inputs.client_name || '',
                payment_date: req.inputs.payment_date || '',
                amount_received: req.inputs.amount_received ?? 0,
                currency: req.inputs.currency || 'INR',
                amount_inr: req.inputs.amount_inr ?? 0,
                gst_amount_inr: req.inputs.gst_amount_inr ?? 0,
                invoice_number: req.inputs.invoice_number || 'INV-2026-001',
                uploaded_to_gst_portal: req.inputs.uploaded_to_gst_portal || 'No',
                uploadedToGstPortal: req.inputs.uploaded_to_gst_portal || 'No',
                gst_portal_upload_date: req.inputs.gst_portal_upload_date || '',
                notes: req.inputs.notes || '',
                created_at: req.inputs.created_at || new Date().toISOString(),
                updated_at: req.inputs.updated_at || new Date().toISOString(),
              };

              if (existingIdx >= 0) {
                inMemoryGstInvoices[existingIdx] = {
                  ...inMemoryGstInvoices[existingIdx],
                  ...record,
                  uploaded_to_gst_portal: inMemoryGstInvoices[existingIdx].uploaded_to_gst_portal || record.uploaded_to_gst_portal,
                  uploadedToGstPortal: inMemoryGstInvoices[existingIdx].uploadedToGstPortal || record.uploadedToGstPortal,
                };
              } else {
                inMemoryGstInvoices.push(record);
              }
              return { recordset: [], rowsAffected: [1] };
            }

            // Delete GST invoices
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
                  return (pay.payment_mode || '').toLowerCase() === 'gst invoice';
                });
              } else {
                const targetId = req.inputs.rawId || req.inputs.cleanId || req.inputs.id || req.inputs.paymentId;
                inMemoryGstInvoices = inMemoryGstInvoices.filter((inv) => {
                  if (inv.uploaded_to_gst_portal === 'Yes' || inv.uploadedToGstPortal === 'Yes') return true;
                  return inv.payment_id !== targetId && inv.paymentId !== targetId && inv.id !== targetId && inv.invoice_id_code !== targetId;
                });
              }
              return { recordset: [], rowsAffected: [1] };
            }

            // Query payments for POST /gst-invoices/sync
            if (sqlText.includes('FROM payments') && sqlText.includes('payment_mode')) {
              const brandFilter = req.inputs.brandFilter;
              const gstPayments = inMemoryPayments
                .filter((p) => (p.payment_mode || '').toLowerCase() === 'gst invoice' && (!brandFilter || p.brand === brandFilter))
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

            // Query all GST invoices (with semantic paymentId resolved)
            if (sqlText.includes('FROM gst_invoices') && (sqlText.includes('ORDER BY') || sqlText.includes('created_at'))) {
              const brandFilter = req.inputs.brandFilter;
              const filtered = brandFilter
                ? inMemoryGstInvoices.filter((i) => i.brand === brandFilter)
                : inMemoryGstInvoices;

              return {
                recordset: filtered.map((inv) => {
                  const linkedPay = inMemoryPayments.find(
                    (p) => p.id === inv.payment_id || p.payment_id_code === inv.payment_id
                  );
                  const resolvedPaymentId = linkedPay?.payment_id_code || inv.payment_id || '';
                  return {
                    id: inv.invoice_id_code || inv.id,
                    brand: inv.brand,
                    paymentId: resolvedPaymentId,
                    projectId: inv.project_id,
                    clientId: inv.client_id,
                    clientName: inv.client_name,
                    paymentDate: inv.payment_date,
                    amountReceived: inv.amount_received,
                    currency: inv.currency,
                    amountINR: inv.amount_inr,
                    gstAmountINR: inv.gst_amount_inr,
                    invoiceNumber: inv.invoice_number,
                    uploadedToGstPortal: inv.uploaded_to_gst_portal || inv.uploadedToGstPortal || 'No',
                    gstPortalUploadDate: inv.gst_portal_upload_date || '',
                    notes: inv.notes,
                    createdAt: inv.created_at,
                    updatedAt: inv.updated_at,
                  };
                }),
              };
            }

            return { recordset: [], rowsAffected: [1] };
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
    mockStore.seedDefaultData();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Part A: Mock Store GET Strictly Read-Only Invariance', () => {
    it('1. mockStore.getGstInvoices() does NOT create missing invoices from payments', () => {
      // Direct insertion of an unsynced payment into mockStore payments array
      (mockStore as any).payments.push({
        id: 'DDI-PAY-MOCK-UNSYNCED',
        brand: 'Device Doctor India',
        projectId: 'PRJ-MOCK-01',
        clientName: 'Test Client Ltd',
        paymentMode: 'GST Invoice',
        amountReceived: 50000,
        amountINR: 50000,
      });

      const countBefore = (mockStore as any).gstInvoices.length;

      // Call mockStore.getGstInvoices()
      const returnedInvoices = mockStore.getGstInvoices('Device Doctor India');

      // Must NOT have created a new GST invoice
      expect((mockStore as any).gstInvoices.length).toBe(countBefore);
      expect(returnedInvoices.some((inv) => inv.paymentId === 'DDI-PAY-MOCK-UNSYNCED')).toBe(false);
    });

    it('2. mockStore.getGstInvoices() does NOT delete stale unfiled invoices', () => {
      // Add a stale unfiled invoice (no payment exists for it)
      (mockStore as any).gstInvoices.push({
        id: 'DDI-GST-STALE-MOCK',
        brand: 'Device Doctor India',
        paymentId: 'NON-EXISTENT-PAYMENT',
        uploadedToGstPortal: 'No',
        amountReceived: 25000,
        amountINR: 25000,
        gstAmountINR: 4500,
      });

      const initialCount = (mockStore as any).gstInvoices.length;

      // Read via getGstInvoices
      const result = mockStore.getGstInvoices();

      // Must preserve the unfiled invoice without deletion side effects
      expect((mockStore as any).gstInvoices.length).toBe(initialCount);
      expect(result.some((i) => i.id === 'DDI-GST-STALE-MOCK')).toBe(true);
    });

    it('3. mockStore.getGstInvoices() does NOT mutate the original invoice array (defensive copy)', () => {
      const result1 = mockStore.getGstInvoices();
      expect(result1.length).toBeGreaterThan(0);

      // Mutate returned object
      const originalNotes = result1[0].notes;
      result1[0].notes = 'MALICIOUS_TAMPER';
      result1.push({ id: 'MALICIOUS_INJECTED' } as any);

      // Subsequent read must be pristine and unaffected
      const result2 = mockStore.getGstInvoices();
      expect(result2[0].notes).toBe(originalNotes);
      expect(result2.some((i) => i.id === 'MALICIOUS_INJECTED')).toBe(false);
    });

    it('4. Brand filtering continues to work correctly in mockStore.getGstInvoices()', () => {
      (mockStore as any).gstInvoices = [
        { id: 'GST-DDI-01', brand: 'Device Doctor India', amountINR: 10000 },
        { id: 'GST-FIX-01', brand: 'FixDoctor India', amountINR: 20000 },
      ];

      const ddiOnly = mockStore.getGstInvoices('Device Doctor India');
      expect(ddiOnly.length).toBe(1);
      expect(ddiOnly[0].id).toBe('GST-DDI-01');

      const all = mockStore.getGstInvoices('All');
      expect(all.length).toBe(2);
    });
  });

  describe('Part B: Azure SQL GET /api/gst-invoices Read-Only Invariance', () => {
    it('5. GET /api/gst-invoices issues strictly read-only SELECT queries with 0 mutations', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Seed an unsynced payment and a stale unfiled invoice
      inMemoryPayments.push({
        id: 'p1111111-2222-3333-4444-555555555555',
        payment_id_code: 'DDI-PAY-UNSYNCED',
        brand: 'Device Doctor India',
        payment_mode: 'GST Invoice',
        amount_received: 75000,
        amount_inr: 75000,
      });

      inMemoryGstInvoices.push({
        id: 'g1111111-2222-3333-4444-555555555555',
        invoice_id_code: 'DDI-GST-STALE',
        brand: 'Device Doctor India',
        payment_id: 'NON-EXISTENT-PAY',
        uploaded_to_gst_portal: 'No',
        amount_received: 30000,
        amount_inr: 30000,
        gst_amount_inr: 5400,
      });

      const res = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);

      // Verify queries executed
      expect(capturedSqlQueries.length).toBe(1);
      const query = capturedSqlQueries[0].sqlText.trim();

      // STRICT READ-ONLY ASSERTIONS:
      expect(query).toMatch(/^SELECT\b/i);
      expect(query).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(query).not.toMatch(/\bUPDATE\s+[a-zA-Z_]/i);
      expect(query).not.toMatch(/\bDELETE\s+FROM\b/i);
      expect(query).not.toMatch(/\bMERGE\s+INTO\b/i);
      expect(query).not.toMatch(/\bEXEC(UTE)?\s+/i);

      // No new invoice was created for DDI-PAY-UNSYNCED
      expect(res.body.some((inv: any) => inv.paymentId === 'DDI-PAY-UNSYNCED')).toBe(false);

      // Stale invoice was NOT deleted
      expect(res.body.some((inv: any) => inv.id === 'DDI-GST-STALE')).toBe(true);
    });
  });

  describe('Part C: POST /api/gst-invoices/sync Comprehensive Reconciliation', () => {
    it('6. POST /api/gst-invoices/sync creates missing invoices for historical unsynced payments', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      inMemoryPayments.push({
        id: 'a1111111-2222-3333-4444-555555555555',
        payment_id_code: 'DDI-PAY-HISTORICAL-01',
        brand: 'Device Doctor India',
        project_id: 'PRJ-HIST-01',
        payment_mode: 'GST Invoice',
        amount_received: 100000,
        amount_inr: 100000,
      });

      const syncRes = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(syncRes.status).toBe(200);
      expect(syncRes.body.success).toBe(true);
      expect(syncRes.body.count).toBe(1);
      expect(inMemoryGstInvoices.length).toBe(1);
      expect(inMemoryGstInvoices[0].gst_amount_inr).toBe(18000);
    });

    it('7. POST sync updates eligible unfiled invoices when payment details change', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      inMemoryPayments.push({
        id: 'b2222222-3333-4444-5555-666666666666',
        payment_id_code: 'DDI-PAY-UPD-01',
        brand: 'Device Doctor India',
        payment_mode: 'GST Invoice',
        amount_received: 120000, // Updated amount
        amount_inr: 120000,
      });

      // Existing unfiled GST invoice with older amount (50,000)
      inMemoryGstInvoices.push({
        id: 'g2222222-3333-4444-5555-666666666666',
        invoice_id_code: 'DDI-GST-UPD-01',
        brand: 'Device Doctor India',
        payment_id: 'DDI-PAY-UPD-01',
        amount_received: 50000,
        amount_inr: 50000,
        gst_amount_inr: 9000,
        uploaded_to_gst_portal: 'No',
      });

      const syncRes = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(syncRes.status).toBe(200);
      expect(syncRes.body.success).toBe(true);

      // Verify unfiled invoice amount is reconciled to 120,000 and 18% GST (21,600)
      expect(inMemoryGstInvoices[0].amount_inr).toBe(120000);
      expect(inMemoryGstInvoices[0].gst_amount_inr).toBe(21600);
    });

    it('8. Filed invoices remain protected from removal or corruption during POST sync', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Filed invoice whose payment was deleted or changed to Non-GST
      inMemoryGstInvoices.push({
        id: 'g3333333-4444-5555-6666-777777777777',
        invoice_id_code: 'DDI-GST-FILED-PROT',
        brand: 'Device Doctor India',
        payment_id: 'DDI-PAY-DELETED',
        invoice_number: 'INV-2025-FILED-99',
        uploaded_to_gst_portal: 'Yes', // FILED!
        gst_portal_upload_date: '2025-12-01',
        amount_received: 80000,
        amount_inr: 80000,
        gst_amount_inr: 14400,
      });

      const syncRes = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(syncRes.status).toBe(200);

      // Filed invoice MUST remain intact
      expect(inMemoryGstInvoices.length).toBe(1);
      expect(inMemoryGstInvoices[0].uploaded_to_gst_portal).toBe('Yes');
      expect(inMemoryGstInvoices[0].invoice_number).toBe('INV-2025-FILED-99');
    });

    it('9. Stale unfiled invoice cleanup still works through POST sync', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Payment mode is Cash (ineligible)
      inMemoryPayments.push({
        id: 'c4444444-5555-6666-7777-888888888888',
        payment_id_code: 'DDI-PAY-CASH-01',
        brand: 'Device Doctor India',
        payment_mode: 'Cash',
        amount_received: 20000,
        amount_inr: 20000,
      });

      // Stale unfiled invoice previously generated
      inMemoryGstInvoices.push({
        id: 'g4444444-5555-6666-7777-888888888888',
        invoice_id_code: 'DDI-GST-STALE-01',
        brand: 'Device Doctor India',
        payment_id: 'DDI-PAY-CASH-01',
        uploaded_to_gst_portal: 'No',
        amount_received: 20000,
        amount_inr: 20000,
        gst_amount_inr: 3600,
      });

      const syncRes = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(syncRes.status).toBe(200);
      expect(inMemoryGstInvoices.length).toBe(0);
    });

    it('10. Repeated sync does not create duplicates (idempotency)', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      inMemoryPayments.push({
        id: 'd5555555-6666-7777-8888-999999999999',
        payment_id_code: 'DDI-PAY-IDEMP-01',
        brand: 'Device Doctor India',
        payment_mode: 'GST Invoice',
        amount_received: 40000,
        amount_inr: 40000,
      });

      // 1st sync
      const s1 = await request(app).post('/api/gst-invoices/sync').set('Authorization', authHeader).send({});
      expect(s1.status).toBe(200);
      expect(s1.body.invoices.length).toBe(1);

      // 2nd sync
      const s2 = await request(app).post('/api/gst-invoices/sync').set('Authorization', authHeader).send({});
      expect(s2.status).toBe(200);
      expect(s2.body.invoices.length).toBe(1);

      // 3rd sync
      const s3 = await request(app).post('/api/gst-invoices/sync').set('Authorization', authHeader).send({});
      expect(s3.status).toBe(200);
      expect(s3.body.invoices.length).toBe(1);
    });

    it('11. Concurrent sync requests remain protected and deduplicated', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      inMemoryPayments.push({
        id: 'e6666666-7777-8888-9999-000000000000',
        payment_id_code: 'DDI-PAY-CONCURR-01',
        brand: 'Device Doctor India',
        payment_mode: 'GST Invoice',
        amount_received: 60000,
        amount_inr: 60000,
      });

      // Dispatch 2 sync calls concurrently
      const [res1, res2] = await Promise.all([
        request(app).post('/api/gst-invoices/sync').set('Authorization', authHeader).send({}),
        request(app).post('/api/gst-invoices/sync').set('Authorization', authHeader).send({}),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res2.body.success).toBe(true);
      expect(res1.body.invoices.length).toBe(1);
      expect(res2.body.invoices.length).toBe(1);
      expect(inMemoryGstInvoices.length).toBe(1);
    });

    it('12. Payment mode changes and identifier compatibility (GUID vs semantic) remain intact', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const paymentGuid = '99999999-aaaa-bbbb-cccc-dddddddddddd';

      inMemoryPayments.push({
        id: paymentGuid,
        payment_id_code: 'DDI-PAY-SEMGUID',
        brand: 'Device Doctor India',
        payment_mode: 'Non GST Online', // changed from GST to Non GST
        amount_received: 35000,
        amount_inr: 35000,
      });

      // Unfiled GST invoice has GUID stored in payment_id column
      inMemoryGstInvoices.push({
        id: 'g8888888-9999-aaaa-bbbb-cccccccccccc',
        invoice_id_code: 'DDI-GST-SEMGUID',
        brand: 'Device Doctor India',
        payment_id: paymentGuid,
        uploaded_to_gst_portal: 'No',
        amount_received: 35000,
        amount_inr: 35000,
        gst_amount_inr: 6300,
      });

      const syncRes = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(syncRes.status).toBe(200);
      // The invoice linked by GUID should be matched to DDI-PAY-SEMGUID (Non GST) and pruned
      expect(syncRes.body.invoices.length).toBe(0);
      expect(inMemoryGstInvoices.length).toBe(0);
    });
  });
});
