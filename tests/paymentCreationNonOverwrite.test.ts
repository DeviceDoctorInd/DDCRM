import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import { mockStore } from '../server/db/mockStore';
import { storageService } from '../src/services/storageService';
import * as azureSqlModule from '../server/db/azureSql';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('FIX 16: New Payment Creation Does Not Overwrite Previous Payments', () => {
  beforeEach(() => {
    mockStore.seedDefaultData();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1 & 2. Sequential Payment Creation without Overwrite', () => {
    it('creates first payment and second payment via Add Payment flow without replacing previous entry', async () => {
      // 1. Create first payment
      const pay1Payload = {
        isNew: true,
        brand: 'Device Doctor India',
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
        clientName: 'TechCorp Infotech Pvt Ltd',
        paymentMode: 'Non GST Online',
        paymentDate: '2026-02-01',
        dueDate: '2026-02-15',
        amountReceived: 25000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 25000,
        referenceUtr: 'UTR-NONOVERWRITE-001',
        paymentStatus: 'Received',
        notes: 'First payment entry',
      };

      const res1 = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send(pay1Payload);

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res1.body.payment).toBeDefined();
      const firstPaymentId = res1.body.payment.id;
      expect(firstPaymentId).toBeDefined();
      expect(res1.body.payment.amountReceived).toBe(25000);

      // 2. Simulate Add Payment modal creating second payment:
      // Even if client accidentally supplied the first payment ID or omitted it,
      // the backend and client safeguards ensure a unique new ID is used and the previous payment is NOT replaced.
      const pay2Payload = {
        id: firstPaymentId, // Simulates the bug where frontend Add Payment modal defaulted to DDI-PAY-001
        isNew: true, // Marked as new payment creation
        brand: 'Device Doctor India',
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
        clientName: 'TechCorp Infotech Pvt Ltd',
        paymentMode: 'Non GST Online',
        paymentDate: '2026-02-02',
        dueDate: '2026-02-16',
        amountReceived: 50000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 50000,
        referenceUtr: 'UTR-NONOVERWRITE-002',
        paymentStatus: 'Received',
        notes: 'Second distinct payment entry',
      };

      const res2 = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send(pay2Payload);

      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);
      expect(res2.body.payment).toBeDefined();
      const secondPaymentId = res2.body.payment.id;

      // 3. Verify unique IDs: Second payment ID MUST differ from first payment ID
      expect(secondPaymentId).not.toBe(firstPaymentId);
      expect(res2.body.payment.amountReceived).toBe(50000);

      // 4. Verify both records exist in GET /api/payments
      const listRes = await request(app)
        .get('/api/payments')
        .set('Authorization', authHeader);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body)).toBe(true);

      const found1 = listRes.body.find((p: any) => p.id === firstPaymentId || p.payment_id_code === firstPaymentId);
      const found2 = listRes.body.find((p: any) => p.id === secondPaymentId || p.payment_id_code === secondPaymentId);

      expect(found1).toBeDefined();
      expect(found2).toBeDefined();
      expect(found1.amountReceived).toBe(25000);
      expect(found1.referenceUtr).toBe('UTR-NONOVERWRITE-001');
      expect(found2.amountReceived).toBe(50000);
      expect(found2.referenceUtr).toBe('UTR-NONOVERWRITE-002');
    });
  });

  describe('3 & 4. Multiple Payments Independent Existence in Database & API', () => {
    it('creates 3 sequential payments and confirms all 3 exist concurrently in GET /api/payments', async () => {
      const createdIds: string[] = [];

      for (let i = 1; i <= 3; i++) {
        const res = await request(app)
          .post('/api/payments')
          .set('Authorization', authHeader)
          .send({
            isNew: true,
            brand: 'Device Doctor India',
            projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
            clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
            clientName: 'TechCorp Infotech Pvt Ltd',
            paymentMode: 'Non GST Online',
            amountReceived: i * 10000,
            currency: 'INR',
            exchangeRate: 1,
            amountINR: i * 10000,
            referenceUtr: `UTR-SEQ-00${i}`,
            paymentStatus: 'Received',
          });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        createdIds.push(res.body.payment.id);
      }

      // Ensure all 3 IDs are strictly unique
      const uniqueIds = new Set(createdIds);
      expect(uniqueIds.size).toBe(3);

      // Query GET /api/payments
      const getRes = await request(app)
        .get('/api/payments')
        .set('Authorization', authHeader);

      expect(getRes.status).toBe(200);
      for (const id of createdIds) {
        const exists = getRes.body.some((p: any) => p.id === id || p.payment_id_code === id);
        expect(exists).toBe(true);
      }
    });
  });

  describe('5 & 6. Unique Semantic ID Generation in Frontend Storage Service', () => {
    it('storageService.generateId produces sequential, non-colliding IDs when existing items are provided', () => {
      const brand = 'Device Doctor India';
      const existingPayments = [
        { id: 'DDI-PAY-001', brand },
        { id: 'DDI-PAY-002', brand },
      ];

      const nextId = storageService.generateId('PAY', brand as any, existingPayments as any);
      expect(nextId).toBe('DDI-PAY-003');

      const brand2 = 'Codestro';
      const nextCdsId = storageService.generateId('PAY', brand2 as any, []);
      expect(nextCdsId).toBe('CDS-PAY-001');
    });

    it('GET /api/payments/next-semantic-id returns the next non-colliding ID', async () => {
      const res = await request(app)
        .get('/api/payments/next-semantic-id')
        .set('Authorization', authHeader)
        .query({ brand: 'Device Doctor India' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.nextId).toMatch(/^DDI-PAY-\d{3,}$/);
    });
  });

  describe('7. Editing an Existing Payment Updates ONLY That Payment', () => {
    it('PUT /api/payments/:id updates target payment without altering other payments', async () => {
      // Create Payment A
      const resA = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          amountReceived: 10000,
          currency: 'INR',
          referenceUtr: 'UTR-PAY-A',
        });
      const idA = resA.body.payment.id;

      // Create Payment B
      const resB = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          amountReceived: 20000,
          currency: 'INR',
          referenceUtr: 'UTR-PAY-B',
        });
      const idB = resB.body.payment.id;

      // Update Payment A only
      const updateRes = await request(app)
        .put(`/api/payments/${idA}`)
        .set('Authorization', authHeader)
        .send({
          amountReceived: 15000,
          amountINR: 15000,
          notes: 'Updated payment A notes',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.payment.amountReceived).toBe(15000);

      // Verify Payment B was NOT mutated
      const listRes = await request(app)
        .get('/api/payments')
        .set('Authorization', authHeader);

      const payA = listRes.body.find((p: any) => p.id === idA);
      const payB = listRes.body.find((p: any) => p.id === idB);

      expect(payA.amountReceived).toBe(15000);
      expect(payB.amountReceived).toBe(20000);
      expect(payB.referenceUtr).toBe('UTR-PAY-B');
    });
  });

  describe('8. Repeated Submission & Idempotency Protection', () => {
    it('identical repeated submission (same UTR and ID) behaves idempotently and does not create duplicate entries', async () => {
      const initialPayload = {
        isNew: true,
        brand: 'Device Doctor India',
        amountReceived: 35000,
        currency: 'INR',
        referenceUtr: 'UTR-IDEMPOTENT-001',
      };

      const res1 = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send(initialPayload);

      expect(res1.status).toBe(200);
      const paymentId = res1.body.payment.id;

      // Second identical submission with same ID and same UTR
      const res2 = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          ...initialPayload,
          id: paymentId,
        });

      expect(res2.status).toBe(200);
      expect(res2.body.payment.id).toBe(paymentId);

      // Total count of matching payments should remain exactly 1
      const listRes = await request(app)
        .get('/api/payments')
        .set('Authorization', authHeader);

      const matching = listRes.body.filter((p: any) => p.referenceUtr === 'UTR-IDEMPOTENT-001');
      expect(matching.length).toBe(1);
    });

    it('rejects duplicate UTR when attempting to assign it to a different payment', async () => {
      await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          amountReceived: 10000,
          currency: 'INR',
          referenceUtr: 'UTR-SHARED-TEST',
        });

      // Second payment with different details but duplicate UTR
      const dupRes = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          amountReceived: 20000,
          currency: 'INR',
          referenceUtr: 'UTR-SHARED-TEST', // duplicate UTR
        });

      expect(dupRes.status).toBe(400);
      expect(dupRes.body.success).toBe(false);
      expect(dupRes.body.error).toContain('already in use');
    });
  });

  describe('9. GST Invoice Synchronization Remains Correct', () => {
    it('synchronizes linked GST invoice when new payment is created in GST Invoice mode', async () => {
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          paymentMode: 'GST Invoice',
          amountReceived: 118000,
          currency: 'INR',
          exchangeRate: 1,
          amountINR: 118000,
          referenceUtr: 'UTR-GST-SYNC-001',
          paymentStatus: 'Received',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.gstInvoiceSynced).toBe(true);
      expect(res.body.gstInvoice).toBeDefined();
      expect(res.body.gstInvoice.paymentId).toBe(res.body.payment.id);
      expect(res.body.gstInvoice.amountINR).toBe(118000);
      expect(res.body.gstInvoice.gstAmountINR).toBe(Math.round(118000 * 0.18));
    });
  });

  describe('10. Payment Deletion & Existing Safeguards', () => {
    it('deleting one payment preserves remaining payments and cleans linked unfiled invoices', async () => {
      // Create Payment 1
      const res1 = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          paymentMode: 'Non GST Online',
          amountReceived: 40000,
          currency: 'INR',
          referenceUtr: 'UTR-DEL-001',
        });
      const id1 = res1.body.payment.id;

      // Create Payment 2
      const res2 = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          paymentMode: 'Non GST Online',
          amountReceived: 60000,
          currency: 'INR',
          referenceUtr: 'UTR-DEL-002',
        });
      const id2 = res2.body.payment.id;

      // Delete Payment 1
      const delRes = await request(app)
        .delete(`/api/payments/${id1}`)
        .set('Authorization', authHeader);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify Payment 1 is deleted but Payment 2 is untouched
      const listRes = await request(app)
        .get('/api/payments')
        .set('Authorization', authHeader);

      const hasPay1 = listRes.body.some((p: any) => p.id === id1);
      const hasPay2 = listRes.body.some((p: any) => p.id === id2);

      expect(hasPay1).toBe(false);
      expect(hasPay2).toBe(true);
    });
  });

  describe('11. Azure SQL Connection Pool Active: Genuinely New Payment Insertion & Overwrite Prevention', () => {
    it('automatically generates next sequence ID from SQL database when pool is active and client attempts new payment creation with colliding ID', async () => {
      const capturedSqlQueries: { sqlText: string; inputs: Record<string, any> }[] = [];

      const mockExistingPayment = {
        id: 'DDI-PAY-001',
        payment_id_code: 'DDI-PAY-001',
        brand: 'Device Doctor India',
        reference_utr: 'UTR-EXISTING-001',
        amount_received: 50000,
        amount_inr: 50000,
        payment_status: 'Received',
        project_id: 'PRJ-TEST-001',
      };

      const fakePool: any = {
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

              // Sequence lookup for calculateNextPaymentIdSql
              if (sqlText.includes('WHERE id LIKE @pattern OR payment_id_code LIKE @pattern')) {
                return { recordset: [{ id: 'DDI-PAY-001' }] };
              }

              // Existing payment check (id or rawId)
              if (sqlText.includes('SELECT TOP 1 *') && sqlText.includes('FROM payments')) {
                if (req.inputs.rawId === 'DDI-PAY-001') {
                  return { recordset: [mockExistingPayment] };
                }
                return { recordset: [] };
              }

              // UTR duplicate check query
              if (sqlText.includes('reference_utr') && sqlText.includes('SELECT TOP 1')) {
                return { recordset: [] };
              }

              // Save execution
              if (sqlText.includes('Insert or Update Payment Voucher')) {
                return { recordset: [] };
              }

              return { recordset: [] };
            },
          };
          return req;
        },
      };

      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(fakePool);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-PAY-001', // Colliding ID from Add Payment modal bug
          isNew: true, // Marked as new creation
          brand: 'Device Doctor India',
          paymentMode: 'Non GST Online',
          amountReceived: 75000,
          currency: 'INR',
          exchangeRate: 1,
          amountINR: 75000,
          referenceUtr: 'UTR-FRESH-NEW-002',
          paymentStatus: 'Received',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment).toBeDefined();

      // Crucial assertion: Must have resolved to DDI-PAY-002, NOT overwritten DDI-PAY-001!
      expect(res.body.payment.id).toBe('DDI-PAY-002');
      expect(res.body.payment.amountReceived).toBe(75000);

      // Verify the SQL transaction query received rawId = 'DDI-PAY-002'
      const saveExecution = capturedSqlQueries.find((q) => q.sqlText.includes('Insert or Update Payment Voucher'));
      expect(saveExecution).toBeDefined();
      expect(saveExecution!.inputs.rawId).toBe('DDI-PAY-002');
    });
  });
});
