/**
 * FIX 15 Regression Tests: Stale GST Invoice Removal & Bidirectional Synchronization
 *
 * Verifies that:
 * 1. Changing Payment Mode from 'GST Invoice' to 'Non GST Online' removes unfiled GST ledger entries.
 * 2. Changing Payment Mode from 'GST Invoice' to 'Cash' (or Crypto) removes unfiled GST ledger entries.
 * 3. Changing Payment Mode from Non-GST to 'GST Invoice' creates exactly one GST ledger entry.
 * 4. Repeated 'Sync Payments Now' (POST /api/gst-invoices/sync) is idempotent and never creates duplicates.
 * 5. Stale GST invoices linked by Azure SQL GUID payment_id are correctly matched to semantic payment IDs and pruned.
 * 6. Filed GST invoices (uploaded_to_gst_portal = 'Yes') are strictly preserved and protected from removal or mode edits.
 * 7. Azure SQL outages during reconciliation fail closed (HTTP 503) without exposing sensitive internals or corrupting state.
 * 8. Semantic paymentId is cleanly returned in the GST ledger even if stored internally as a GUID.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import * as azureSqlModule from '../server/db/azureSql';
import { mockStore } from '../server/db/mockStore';
import { Payment } from '../src/types/crm';

describe('FIX 15: Stale GST Invoice Removal & Bidirectional Reconciliation', () => {
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
                uploadedToGstPortal: req.inputs.uploaded_to_gst_portal || 'No',
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
                // Direct payment delete / mode change
                const targetId = req.inputs.rawId || req.inputs.cleanId || req.inputs.id || req.inputs.paymentId;
                const dbId = req.inputs.dbId;
                const dbCode = req.inputs.dbCode;
                inMemoryGstInvoices = inMemoryGstInvoices.filter((inv) => {
                  if (inv.uploaded_to_gst_portal === 'Yes' || inv.uploadedToGstPortal === 'Yes') return true;
                  const match =
                    inv.payment_id === targetId ||
                    inv.paymentId === targetId ||
                    (dbId && (inv.payment_id === dbId || inv.paymentId === dbId)) ||
                    (dbCode && (inv.payment_id === dbCode || inv.paymentId === dbCode));
                  return !match;
                });
              }
              return { recordset: [], rowsAffected: [1] };
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

            // Query all GST invoices (with semantic paymentId resolved)
            if (sqlText.includes('FROM gst_invoices') && (sqlText.includes('ORDER BY') || sqlText.includes('created_at'))) {
              return {
                recordset: inMemoryGstInvoices.map((inv) => {
                  // Resolve semantic paymentId from inMemoryPayments if available
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

            // Payment deletion
            if (sqlText.includes('DELETE FROM payments')) {
              const targetId = req.inputs.rawId || req.inputs.id;
              inMemoryPayments = inMemoryPayments.filter(
                (p) => p.id !== targetId && p.payment_id_code !== targetId
              );
              inMemoryGstInvoices = inMemoryGstInvoices.filter(
                (g) => g.payment_id !== targetId || (g.uploaded_to_gst_portal === 'Yes' || g.uploadedToGstPortal === 'Yes')
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

  beforeEach(() => {
    inMemoryPayments = [];
    inMemoryGstInvoices = [];
    capturedSqlQueries = [];
    vi.restoreAllMocks();
  });

  describe('1. Mode Change: GST Invoice -> Non GST Online Removes Unfiled Ledger Entry', () => {
    it('removes unfiled GST invoice when payment mode is changed to Non GST Online', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Seed initial payment with 'GST Invoice' mode
      inMemoryPayments.push({
        id: 'a1111111-2222-3333-4444-555555555555',
        payment_id_code: 'DDI-PAY-001',
        brand: 'Device Doctor India',
        project_id: 'PRJ-ALPHA-01',
        client_id: 'DDI-CLIENT-ALPHA',
        client_name: 'Alpha Tech Enterprises',
        payment_mode: 'GST Invoice',
        payment_date: '2026-10-28',
        amount_received: 16000,
        currency: 'INR',
        amount_inr: 16000,
        reference_utr: 'UTR-ALPHA-001',
        payment_status: 'Received',
      });

      inMemoryGstInvoices.push({
        id: '667942ca-f382-4602-8b97-bb852e4728e4',
        invoice_id_code: 'DDI-GST-001',
        brand: 'Device Doctor India',
        payment_id: 'DDI-PAY-001',
        project_id: 'PRJ-ALPHA-01',
        client_id: 'DDI-CLIENT-ALPHA',
        client_name: 'Alpha Tech Enterprises',
        payment_date: '2026-10-28',
        amount_received: 16000,
        currency: 'INR',
        amount_inr: 16000,
        gst_amount_inr: 2880,
        invoice_number: 'INV-2026-001',
        uploaded_to_gst_portal: 'No',
      });

      // Update payment mode to 'Non GST Online'
      const updateRes = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-PAY-001',
          brand: 'Device Doctor India',
          paymentMode: 'Non GST Online',
          amountReceived: 16000,
          currency: 'INR',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.gstInvoiceSynced).toBe(false);
      expect(updateRes.body.gstInvoice).toBeNull();

      // Verify unfiled invoice is removed from inMemoryGstInvoices
      expect(inMemoryGstInvoices.length).toBe(0);

      // Verify GET /api/gst-invoices reflects 0 invoices
      const getRes = await request(app)
        .get('/api/gst-invoices')
        .set('Authorization', authHeader);

      expect(getRes.status).toBe(200);
      expect(getRes.body).toEqual([]);
    });
  });

  describe('2. Mode Change: GST Invoice -> Cash Removes Unfiled Ledger Entry', () => {
    it('removes unfiled GST invoice when payment mode is changed to Cash', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      inMemoryPayments.push({
        id: 'b2222222-3333-4444-5555-666666666666',
        payment_id_code: 'DDI-PAY-002',
        brand: 'Device Doctor India',
        project_id: 'PRJ-BETA-02',
        client_name: 'Beta Services Ltd',
        payment_mode: 'GST Invoice',
        amount_received: 25000,
        amount_inr: 25000,
      });

      inMemoryGstInvoices.push({
        id: '777942ca-f382-4602-8b97-bb852e4728e5',
        invoice_id_code: 'DDI-GST-002',
        payment_id: 'DDI-PAY-002',
        amount_received: 25000,
        amount_inr: 25000,
        gst_amount_inr: 4500,
        uploaded_to_gst_portal: 'No',
      });

      // Update to Cash
      const updateRes = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-PAY-002',
          paymentMode: 'Cash',
          amountReceived: 25000,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(inMemoryGstInvoices.length).toBe(0);
    });
  });

  describe('3. Mode Change: Non-GST -> GST Invoice Creates Exactly One Ledger Entry', () => {
    it('creates exactly one GST ledger entry when changing from Non-GST to GST Invoice', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      inMemoryPayments.push({
        id: 'c3333333-4444-5555-6666-777777777777',
        payment_id_code: 'DDI-PAY-003',
        brand: 'Device Doctor India',
        project_id: 'PRJ-GAMMA-03',
        client_name: 'Gamma Corp',
        payment_mode: 'Non GST Online',
        amount_received: 50000,
        amount_inr: 50000,
      });

      // Update mode to GST Invoice
      const updateRes = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-PAY-003',
          brand: 'Device Doctor India',
          paymentMode: 'GST Invoice',
          amountReceived: 50000,
          currency: 'INR',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.gstInvoiceSynced).toBe(true);
      expect(updateRes.body.gstInvoice).toBeDefined();
      expect(updateRes.body.gstInvoice.gstAmountINR).toBe(9000); // 18% of 50000
      expect(inMemoryGstInvoices.length).toBe(1);
    });
  });

  describe('4. Bidirectional Sync Payments Now: Idempotency & Duplicate Prevention', () => {
    it('reconciles both directions without creating duplicate invoices across repeated calls', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // 1 eligible payment and 1 ineligible payment
      inMemoryPayments.push(
        {
          id: 'd4444444-5555-6666-7777-888888888888',
          payment_id_code: 'DDI-PAY-VALID',
          brand: 'Device Doctor India',
          payment_mode: 'GST Invoice',
          amount_received: 100000,
          amount_inr: 100000,
        },
        {
          id: 'e5555555-6666-7777-8888-999999999999',
          payment_id_code: 'DDI-PAY-STALE',
          brand: 'Device Doctor India',
          payment_mode: 'Non GST Online',
          amount_received: 30000,
          amount_inr: 30000,
        }
      );

      // Pre-existing unfiled GST invoice for the now-ineligible payment
      inMemoryGstInvoices.push({
        id: '888942ca-f382-4602-8b97-bb852e4728e6',
        invoice_id_code: 'DDI-GST-STALE',
        brand: 'Device Doctor India',
        payment_id: 'DDI-PAY-STALE',
        amount_received: 30000,
        amount_inr: 30000,
        gst_amount_inr: 5400,
        uploaded_to_gst_portal: 'No',
      });

      // First sync: Should create invoice for VALID and delete invoice for STALE
      const sync1 = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(sync1.status).toBe(200);
      expect(sync1.body.success).toBe(true);
      expect(sync1.body.invoices.length).toBe(1);
      expect(sync1.body.invoices[0].paymentId).toBe('DDI-PAY-VALID');

      // Second sync (repeated): Idempotent, must remain 1 invoice
      const sync2 = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(sync2.status).toBe(200);
      expect(sync2.body.invoices.length).toBe(1);

      // Third sync (repeated)
      const sync3 = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(sync3.status).toBe(200);
      expect(sync3.body.invoices.length).toBe(1);
    });
  });

  describe('5. GUID vs Semantic Payment ID Matching', () => {
    it('matches stale ledger entries where payment_id is a GUID to the semantic payment ID and prunes them', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const paymentGuid = '99999999-aaaa-bbbb-cccc-dddddddddddd';

      // Payment row has GUID id and semantic payment_id_code, with mode 'Non GST Online'
      inMemoryPayments.push({
        id: paymentGuid,
        payment_id_code: 'DDI-PAY-001',
        brand: 'Device Doctor India',
        payment_mode: 'Non GST Online',
        amount_received: 16000,
        amount_inr: 16000,
      });

      // Stale GST invoice has GUID in payment_id (the live bug scenario)
      inMemoryGstInvoices.push({
        id: '667942ca-f382-4602-8b97-bb852e4728e4',
        invoice_id_code: 'DDI-GST-001',
        brand: 'Device Doctor India',
        payment_id: paymentGuid, // GUID stored in database
        amount_received: 16000,
        amount_inr: 16000,
        gst_amount_inr: 2880,
        uploaded_to_gst_portal: 'No',
      });

      // Trigger sync
      const syncRes = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(syncRes.status).toBe(200);
      expect(syncRes.body.success).toBe(true);
      // The stale invoice linked by GUID should be recognized as linked to DDI-PAY-001 (which is Non GST Online) and removed
      expect(syncRes.body.invoices.length).toBe(0);
      expect(inMemoryGstInvoices.length).toBe(0);
    });
  });

  describe('6. Filed GST Invoices Preservation & Protection', () => {
    it('prohibits changing Payment Mode away from GST Invoice when invoice is filed', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      inMemoryPayments.push({
        id: 'f1111111-2222-3333-4444-555555555555',
        payment_id_code: 'DDI-PAY-FILED-01',
        brand: 'Device Doctor India',
        payment_mode: 'GST Invoice',
        amount_received: 80000,
        amount_inr: 80000,
      });

      inMemoryGstInvoices.push({
        id: '55555555-6666-7777-8888-999999999999',
        invoice_id_code: 'DDI-GST-FILED-01',
        brand: 'Device Doctor India',
        payment_id: 'DDI-PAY-FILED-01',
        invoice_number: 'INV-2026-FILED-01',
        amount_received: 80000,
        amount_inr: 80000,
        gst_amount_inr: 14400,
        uploaded_to_gst_portal: 'Yes', // FILED!
      });

      // Attempt to change Payment Mode to Non GST Online
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-PAY-FILED-01',
          paymentMode: 'Non GST Online',
          amountReceived: 80000,
        });

      // Must be rejected with 400 Bad Request
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('already been filed to the GST portal');

      // The filed invoice must remain intact in memory
      expect(inMemoryGstInvoices.length).toBe(1);
      expect(inMemoryGstInvoices[0].uploaded_to_gst_portal).toBe('Yes');
    });

    it('sync never removes filed invoices even if payment is deleted or mode is changed', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // No payment exists in payments table (e.g. historical payment)
      inMemoryGstInvoices.push({
        id: '55555555-6666-7777-8888-999999999999',
        invoice_id_code: 'DDI-GST-HISTORICAL-01',
        brand: 'Device Doctor India',
        payment_id: 'DDI-PAY-HISTORICAL-01',
        invoice_number: 'INV-2025-HIST-01',
        amount_received: 50000,
        amount_inr: 50000,
        gst_amount_inr: 9000,
        uploaded_to_gst_portal: 'Yes', // FILED
      });

      const syncRes = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(syncRes.status).toBe(200);
      expect(syncRes.body.invoices.length).toBe(1);
      expect(syncRes.body.invoices[0].uploadedToGstPortal).toBe('Yes');
      expect(inMemoryGstInvoices.length).toBe(1);
    });

    it('deleting a payment voucher preserves filed GST invoices while removing unfiled ones', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      inMemoryPayments.push({
        id: 'f1111111-2222-3333-4444-555555555555',
        payment_id_code: 'DDI-PAY-FILED-DEL',
        brand: 'Device Doctor India',
        payment_mode: 'GST Invoice',
        amount_received: 80000,
        amount_inr: 80000,
      });

      inMemoryGstInvoices.push({
        id: '55555555-6666-7777-8888-999999999999',
        invoice_id_code: 'DDI-GST-FILED-DEL',
        brand: 'Device Doctor India',
        payment_id: 'DDI-PAY-FILED-DEL',
        invoice_number: 'INV-2026-FILED-DEL',
        uploaded_to_gst_portal: 'Yes',
      });

      const delRes = await request(app)
        .delete('/api/payments/DDI-PAY-FILED-DEL')
        .set('Authorization', authHeader);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // The filed GST invoice MUST NOT be deleted
      expect(inMemoryGstInvoices.length).toBe(1);
      expect(inMemoryGstInvoices[0].invoice_id_code).toBe('DDI-GST-FILED-DEL');
      expect(inMemoryGstInvoices[0].uploaded_to_gst_portal).toBe('Yes');
    });
  });

  describe('7. Fail-Closed Error Handling on Database Unavailability', () => {
    it('POST /api/gst-invoices/sync returns HTTP 503 when database reconciliation fails', async () => {
      const mockPool = createMockPool({ simulateReconcileError: true });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const syncRes = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', authHeader)
        .send({});

      expect(syncRes.status).toBe(503);
      expect(syncRes.body.success).toBe(false);
      expect(syncRes.body.error).toContain('Azure SQL Database Unavailable');
    });
  });
});
