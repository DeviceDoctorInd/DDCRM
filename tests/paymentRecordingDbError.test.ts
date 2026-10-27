import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import * as azureSqlModule from '../server/db/azureSql';
import { mockStore } from '../server/db/mockStore';
import { buildPaymentSaveQuery } from '../server/routes/api';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('Payment Recording Internal Database Error Fix & Type-Safety Tests', () => {
  let capturedSqlQueries: { sqlText: string; inputs: Record<string, any> }[] = [];

  beforeEach(() => {
    capturedSqlQueries = [];
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockPool(options: {
    simulateConversionErrorOnce?: boolean;
    simulateFatalError?: boolean;
    existingPayments?: any[];
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

            if (options.simulateFatalError && sqlText.includes('BEGIN TRANSACTION')) {
              throw new Error('Azure SQL connection dead: Transaction aborted');
            }

            if (options.simulateConversionErrorOnce && sqlText.includes('BEGIN TRANSACTION') && !conversionFailedOnce) {
              conversionFailedOnce = true;
              throw new Error('Conversion failed when converting from a character string to uniqueidentifier.');
            }

            if (sqlText.includes('FROM payments') && sqlText.includes('SELECT TOP 1') && sqlText.includes('reference_utr')) {
              // UTR duplicate check query
              const utr = (req.inputs.reference_utr || '').toLowerCase();
              const found = (options.existingPayments || []).find(
                (p) => (p.reference_utr || '').toLowerCase() === utr && p.id !== req.inputs.id && p.payment_id_code !== req.inputs.rawId
              );
              return { recordset: found ? [found] : [] };
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

            if (sqlText.includes('BEGIN TRANSACTION')) {
              return { recordset: [], rowsAffected: [1] };
            }

            return { recordset: [], rowsAffected: [1] };
          },
        };
        return req;
      },
    };
  }

  describe('1. SQL Query Structure & Type Safety (buildPaymentSaveQuery)', () => {
    it('uses explicit string CAST on all uniqueidentifier comparisons avoiding uncast conversions', () => {
      const sql = buildPaymentSaveQuery();

      // Must cast p.id to NVARCHAR(150) when comparing with target_project_id or target_project_guid
      expect(sql).toContain('CAST(p.id AS NVARCHAR(150)) = @target_project_id');
      expect(sql).toContain('CAST(p.id AS NVARCHAR(150)) = @target_project_guid');
      expect(sql).toContain('CAST(p.project_id_code AS NVARCHAR(150)) = @target_project_id');

      // Must cast project_id and p.id when computing project totals
      expect(sql).toContain('CAST(project_id AS NVARCHAR(150)) = CAST(p.id AS NVARCHAR(150))');
      expect(sql).toContain('CAST(project_id AS NVARCHAR(150)) = CAST(p.project_id_code AS NVARCHAR(150))');
      expect(sql).toContain('CAST(project_id AS NVARCHAR(150)) = @target_project_id');

      // Must cast p.id when comparing with old_project_id
      expect(sql).toContain('CAST(p.id AS NVARCHAR(150)) = @old_project_id');
      expect(sql).toContain('CAST(p.id AS NVARCHAR(150)) = @old_project_guid');
      expect(sql).toContain('CAST(p.project_id_code AS NVARCHAR(150)) = @old_project_id');

      // Unsafe uncast comparisons that trigger SQL Server uniqueidentifier conversion errors must NOT exist
      const hasUnsafeTargetProjId = /\bp\.id\s*=\s*@target_project_id\b/.test(sql);
      const hasUnsafeOldProjId = /\bp\.id\s*=\s*@old_project_id\b/.test(sql);
      const hasUnsafeProjectIdPId = /\bproject_id\s*=\s*p\.id\b/.test(sql);

      expect(hasUnsafeTargetProjId).toBe(false);
      expect(hasUnsafeOldProjId).toBe(false);
      expect(hasUnsafeProjectIdPId).toBe(false);
    });

    it('enforces atomic transaction control with rollback on error', () => {
      const sql = buildPaymentSaveQuery();
      expect(sql).toContain('SET XACT_ABORT ON;');
      expect(sql).toContain('BEGIN TRANSACTION;');
      expect(sql).toContain('COMMIT TRANSACTION;');
      expect(sql).toContain('IF @@TRANCOUNT > 0');
      expect(sql).toContain('ROLLBACK TRANSACTION;');
      expect(sql).toContain('THROW;');
    });
  });

  describe('2. Successful Payment Recording with INR (Reported Bug Values)', () => {
    it('persists payment voucher to Azure SQL with INR amount and correct parameter binding', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const payload = {
        id: 'DDI-PAY-001',
        brand: 'Device Doctor India',
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
        clientName: 'TechCorp Infotech Pvt Ltd',
        currency: 'INR',
        amountReceived: 16000,
        exchangeRate: 1,
        amountINR: 16000,
        referenceUtr: 'UTR-DDI-227583',
        paymentMode: 'Non GST Online',
        paymentStatus: 'Received',
        paymentDate: '2026-10-28',
      };

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment).toBeDefined();
      expect(res.body.payment.id).toBe('DDI-PAY-001');
      expect(res.body.payment.amountReceived).toBe(16000);
      expect(res.body.payment.amountINR).toBe(16000);
      expect(res.body.payment.referenceUtr).toBe('UTR-DDI-227583');

      // Verify the query parameters captured
      const saveQuery = capturedSqlQueries.find((q) => q.sqlText.includes('Insert or Update Payment Voucher'));
      expect(saveQuery).toBeDefined();
      expect(saveQuery!.inputs.rawId).toBe('DDI-PAY-001');
      expect(saveQuery!.inputs.target_project_id).toBe('DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1');
      expect(saveQuery!.inputs.amount_received).toBe(16000);
      expect(saveQuery!.inputs.amount_inr).toBe(16000);
      expect(saveQuery!.inputs.exchange_rate).toBe(1);
      expect(saveQuery!.inputs.currency).toBe('INR');
      expect(saveQuery!.inputs.reference_utr).toBe('UTR-DDI-227583');
    });
  });

  describe('3. Foreign Currency & Exchange Rate Calculation', () => {
    it('records foreign currency payment and calculates amountINR accurately', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const payload = {
        id: 'DDI-PAY-USD-001',
        brand: 'Device Doctor India',
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        currency: 'USD',
        amountReceived: 1000,
        exchangeRate: 84.5,
        paymentMode: 'Non GST Online',
        paymentStatus: 'Received',
        referenceUtr: 'WIRE-US-992144',
      };

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment.currency).toBe('USD');
      expect(res.body.payment.amountReceived).toBe(1000);
      expect(res.body.payment.exchangeRate).toBe(84.5);
      expect(res.body.payment.amountINR).toBe(84500);

      const saveQuery = capturedSqlQueries.find((q) => q.sqlText.includes('Insert or Update Payment Voucher'));
      expect(saveQuery).toBeDefined();
      expect(saveQuery!.inputs.currency).toBe('USD');
      expect(saveQuery!.inputs.amount_received).toBe(1000);
      expect(saveQuery!.inputs.exchange_rate).toBe(84.5);
      expect(saveQuery!.inputs.amount_inr).toBe(84500);
    });
  });

  describe('4. Missing or Optional Receipt Proof Handling', () => {
    it('persists cleanly when payment proof is absent', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          amountReceived: 20000,
          currency: 'INR',
          referenceUtr: 'UTR-NO-PROOF-01',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment.paymentProof).toBeUndefined();
    });

    it('serializes and persists receipt proof metadata when provided', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const proofDoc = {
        id: 'proof-12345',
        name: 'receipt.pdf',
        size: 10240,
        type: 'application/pdf',
        uploadedAt: '2026-10-28T00:00:00Z',
        url: 'data:application/pdf;base64,JVBERi0xLjQK...',
        notes: 'Signed bank clearance voucher',
      };

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          amountReceived: 35000,
          currency: 'INR',
          referenceUtr: 'UTR-WITH-PROOF-01',
          paymentProof: proofDoc,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment.paymentProof).toBeDefined();
      expect(res.body.payment.paymentProof.name).toBe('receipt.pdf');

      const saveQuery = capturedSqlQueries.find((q) => q.sqlText.includes('Insert or Update Payment Voucher'));
      expect(saveQuery).toBeDefined();
      expect(saveQuery!.inputs.payment_proof).toContain('receipt.pdf');
    });
  });

  describe('5. Duplicate UTR Rejection & Idempotent Retries', () => {
    it('rejects creation when another payment record already uses the same UTR', async () => {
      const mockPool = createMockPool({
        existingPayments: [
          {
            id: 'e1111111-2222-3333-4444-555555555555',
            payment_id_code: 'DDI-PAY-EXISTING-01',
            reference_utr: 'UTR-DDI-DUPLICATE-999',
          },
        ],
      });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-PAY-NEW-02',
          brand: 'Device Doctor India',
          amountReceived: 25000,
          currency: 'INR',
          referenceUtr: 'UTR-DDI-DUPLICATE-999',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('already in use by Payment DDI-PAY-EXISTING-01');
    });

    it('allows idempotent retry/update of the SAME payment with its own UTR', async () => {
      const samePaymentId = 'DDI-PAY-IDEMPOTENT-01';
      const mockPool = createMockPool({
        existingPayments: [
          {
            id: 'e1111111-2222-3333-4444-555555555555',
            payment_id_code: samePaymentId,
            reference_utr: 'UTR-DDI-OWN-111',
          },
        ],
      });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          id: samePaymentId,
          brand: 'Device Doctor India',
          amountReceived: 25000,
          currency: 'INR',
          referenceUtr: 'UTR-DDI-OWN-111',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('6. Schema Fallback Retry on Uniqueidentifier Constraint', () => {
    it('seamlessly recovers and persists via GUID binding fallback when uniqueidentifier error occurs', async () => {
      const mockPool = createMockPool({ simulateConversionErrorOnce: true });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-PAY-RETRY-01',
          brand: 'Device Doctor India',
          projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
          amountReceived: 50000,
          currency: 'INR',
          referenceUtr: 'UTR-RETRY-001',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment.id).toBe('DDI-PAY-RETRY-01');

      // Verify that query was retried with GUID project_id binding
      const retryQueries = capturedSqlQueries.filter((q) => q.sqlText.includes('Insert or Update Payment Voucher'));
      expect(retryQueries.length).toBe(2);
      // The second query (fallback attempt) should pass projGuid
      expect(retryQueries[1].inputs.project_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('7. Database Fatal Error Handling & Information Leakage Prevention', () => {
    it('returns generic safe 500 without leaking raw database internals to client', async () => {
      const mockPool = createMockPool({ simulateFatalError: true });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-PAY-FAIL-01',
          brand: 'Device Doctor India',
          amountReceived: 10000,
          currency: 'INR',
          referenceUtr: 'UTR-FAIL-01',
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('An internal database error occurred while processing the payment voucher.');
      expect(res.body.message).toBe('Failed to record payment voucher and update project financials in Azure SQL.');
      // Must NOT leak connection string, SQL text, or driver stack trace to response
      expect(res.body.details).toBeUndefined();
      expect(res.body.stack).toBeUndefined();
    });
  });
});
