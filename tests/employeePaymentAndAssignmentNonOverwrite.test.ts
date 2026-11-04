import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import { mockStore } from '../server/db/mockStore';
import { storageService } from '../src/services/storageService';
import * as azureSqlModule from '../server/db/azureSql';
import { calculateNextAssignmentIdSql, calculateNextEmployeePaymentIdSql, verifyUtrIdempotency, parseValidFiniteAmount } from '../server/routes/api';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('FIX 20: Employee Payment & Project Assignment Non-Overwrite Protection', () => {
  beforeEach(() => {
    mockStore.seedDefaultData();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Create Employee Payment A, then B; both remain independently available
  describe('1. Sequential Employee Payment Creation Without Overwrite', () => {
    it('creates Payment A and Payment B sequentially; verifies both exist and A is unchanged', async () => {
      // Create Employee Payment A
      const resA = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          paymentDate: '2026-03-01',
          amountPaid: 20000,
          paymentMode: 'GST Invoice',
          referenceUtr: 'UTR-EMP-SEQ-001',
          notes: 'Payout A original disbursement',
        });

      expect(resA.status).toBe(200);
      expect(resA.body.success).toBe(true);
      const idA = resA.body.payment.id;
      expect(idA).toBeDefined();

      // Create Employee Payment B (simulating frontend modal bug providing idA or colliding ID)
      const resB = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          id: idA, // Colliding ID from frontend bug
          isNew: true,
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          paymentDate: '2026-03-02',
          amountPaid: 25000,
          paymentMode: 'Non GST Online',
          referenceUtr: 'UTR-EMP-SEQ-002',
          notes: 'Payout B distinct disbursement',
        });

      expect(resB.status).toBe(200);
      expect(resB.body.success).toBe(true);
      const idB = resB.body.payment.id;
      expect(idB).toBeDefined();

      // Crucial assertion: IDs must differ!
      expect(idB).not.toBe(idA);

      // Verify both exist independently in GET list
      const listRes = await request(app)
        .get('/api/employee-payments')
        .set('Authorization', authHeader);

      expect(listRes.status).toBe(200);
      const payA = listRes.body.find((p: any) => p.id === idA || p.emp_payment_id_code === idA);
      const payB = listRes.body.find((p: any) => p.id === idB || p.emp_payment_id_code === idB);

      expect(payA).toBeDefined();
      expect(payB).toBeDefined();
      expect(payA.amountPaid).toBe(20000);
      expect(payA.referenceUtr).toBe('UTR-EMP-SEQ-001');
      expect(payA.notes).toBe('Payout A original disbursement');

      expect(payB.amountPaid).toBe(25000);
      expect(payB.referenceUtr).toBe('UTR-EMP-SEQ-002');
      expect(payB.notes).toBe('Payout B distinct disbursement');
    });
  });

  // 2. Create Assignment A, then B; both remain independently available
  describe('2. Sequential Project Assignment Creation Without Overwrite', () => {
    it('creates Assignment A and Assignment B sequentially; verifies both exist and A is unchanged', async () => {
      // Create Assignment A
      const resA = await request(app)
        .post('/api/assignments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          roleName: 'Senior Hardware Systems Engineer',
          assignedDate: '2026-03-01',
          workAssigned: 'Assignment A Task - Hardware Maintenance',
          amount: 50000,
          amountPaid: 0,
          paymentStatus: 'Pending',
        });

      expect(resA.status).toBe(200);
      expect(resA.body.success).toBe(true);
      const idA = resA.body.assignment.id;
      expect(idA).toBeDefined();

      // Create Assignment B (simulating frontend modal bug providing idA or colliding ID)
      const resB = await request(app)
        .post('/api/assignments')
        .set('Authorization', authHeader)
        .send({
          id: idA, // Colliding ID from frontend bug
          isNew: true,
          brand: 'Device Doctor India',
          projectId: 'DDI-APOLLO-DIAGNOSTICS-CENTRE-HYBRID-CLOUD-ARCHITECTURE-AWS-AZURE-MIGRATION-1',
          employeeId: 'DDI-EMP-002',
          employeeName: 'Vikram Batra',
          roleName: 'Senior Cloud & DevOps Engineer',
          assignedDate: '2026-03-02',
          workAssigned: 'Assignment B Task - Cloud Infra Setup',
          amount: 65000,
          amountPaid: 0,
          paymentStatus: 'Pending',
        });

      expect(resB.status).toBe(200);
      expect(resB.body.success).toBe(true);
      const idB = resB.body.assignment.id;
      expect(idB).toBeDefined();

      // Crucial assertion: IDs must differ!
      expect(idB).not.toBe(idA);

      // Verify both exist independently in GET list
      const listRes = await request(app)
        .get('/api/assignments')
        .set('Authorization', authHeader);

      expect(listRes.status).toBe(200);
      const asnA = listRes.body.find((a: any) => a.id === idA || a.assignment_id_code === idA);
      const asnB = listRes.body.find((a: any) => a.id === idB || a.assignment_id_code === idB);

      expect(asnA).toBeDefined();
      expect(asnB).toBeDefined();
      expect(asnA.workAssigned).toBe('Assignment A Task - Hardware Maintenance');
      expect(asnA.amount).toBe(50000);
      expect(asnB.workAssigned).toBe('Assignment B Task - Cloud Infra Setup');
      expect(asnB.amount).toBe(65000);
    });
  });

  // 3. Existing seeded records remain unchanged after new records are created
  describe('3. Historical Seeded Records Preservation', () => {
    it('preserves seeded records DDI-EPAY-001 and DDI-ASN-001 after adding new records', async () => {
      // Get baseline
      const initialAsns = await request(app).get('/api/assignments').set('Authorization', authHeader);
      const initialEpays = await request(app).get('/api/employee-payments').set('Authorization', authHeader);

      const seededAsn = initialAsns.body.find((a: any) => a.id === 'DDI-ASN-001');
      const seededEpay = initialEpays.body.find((p: any) => p.id === 'DDI-EPAY-001');

      expect(seededAsn).toBeDefined();
      expect(seededEpay).toBeDefined();
      const originalAsnAmount = seededAsn.amount;
      const originalEpayAmount = seededEpay.amountPaid;

      // Add 3 new assignments with colliding DDI-ASN-001 ID
      for (let i = 1; i <= 3; i++) {
        await request(app)
          .post('/api/assignments')
          .set('Authorization', authHeader)
          .send({
            id: 'DDI-ASN-001',
            isNew: true,
            brand: 'Device Doctor India',
            projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
            employeeId: 'DDI-EMP-001',
            employeeName: 'Amit Trivedi',
            roleName: 'Engineer',
            workAssigned: `Task Seed Test ${i}`,
            amount: 10000 * i,
          });
      }

      // Add 3 new employee payments with colliding DDI-EPAY-001 ID
      for (let i = 1; i <= 3; i++) {
        await request(app)
          .post('/api/employee-payments')
          .set('Authorization', authHeader)
          .send({
            id: 'DDI-EPAY-001',
            isNew: true,
            brand: 'Device Doctor India',
            assignmentId: 'DDI-ASN-001',
            employeeId: 'DDI-EMP-001',
            employeeName: 'Amit Trivedi',
            paymentDate: '2026-03-05',
            amountPaid: 5000 * i,
            referenceUtr: `UTR-HISTORICAL-${i}`,
          });
      }

      // Re-fetch and check seeded records
      const afterAsns = await request(app).get('/api/assignments').set('Authorization', authHeader);
      const afterEpays = await request(app).get('/api/employee-payments').set('Authorization', authHeader);

      const checkAsn = afterAsns.body.find((a: any) => a.id === 'DDI-ASN-001');
      const checkEpay = afterEpays.body.find((p: any) => p.id === 'DDI-EPAY-001');

      expect(checkAsn).toBeDefined();
      expect(checkAsn.amount).toBe(originalAsnAmount);
      expect(checkAsn.workAssigned).toBe(seededAsn.workAssigned);

      expect(checkEpay).toBeDefined();
      expect(checkEpay.amountPaid).toBe(originalEpayAmount);
      expect(checkEpay.referenceUtr).toBe(seededEpay.referenceUtr);
    });
  });

  // 4. Updating an existing record updates only that record
  describe('4. PUT Updates Only Target Record', () => {
    it('PUT /api/employee-payments/:id modifies target payout and leaves sibling payouts untouched', async () => {
      // Create Payment 1
      const res1 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          paymentDate: '2026-03-01',
          amountPaid: 30000,
          referenceUtr: 'UTR-PUT-TEST-001',
          notes: 'Original Notes 1',
        });
      const id1 = res1.body.payment.id;

      // Create Payment 2
      const res2 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-002',
          employeeName: 'Vikram Batra',
          paymentDate: '2026-03-02',
          amountPaid: 40000,
          referenceUtr: 'UTR-PUT-TEST-002',
          notes: 'Original Notes 2',
        });
      const id2 = res2.body.payment.id;

      // Edit Payment 1 via PUT
      const updateRes = await request(app)
        .put(`/api/employee-payments/${id1}`)
        .set('Authorization', authHeader)
        .send({
          amountPaid: 32000,
          notes: 'Updated Notes 1 with bonus',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);

      // Verify Payment 1 was modified; Payment 2 was untouched
      const listRes = await request(app).get('/api/employee-payments').set('Authorization', authHeader);
      const pay1 = listRes.body.find((p: any) => p.id === id1);
      const pay2 = listRes.body.find((p: any) => p.id === id2);

      expect(pay1.amountPaid).toBe(32000);
      expect(pay1.notes).toBe('Updated Notes 1 with bonus');

      expect(pay2.amountPaid).toBe(40000);
      expect(pay2.notes).toBe('Original Notes 2');
      expect(pay2.referenceUtr).toBe('UTR-PUT-TEST-002');
    });

    it('PUT /api/assignments/:id modifies target assignment and leaves sibling assignments untouched', async () => {
      // Create Assignment 1
      const res1 = await request(app)
        .post('/api/assignments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          projectId: 'PRJ-1',
          employeeId: 'EMP-1',
          workAssigned: 'Task 1 Original',
          amount: 50000,
        });
      const id1 = res1.body.assignment.id;

      // Create Assignment 2
      const res2 = await request(app)
        .post('/api/assignments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          projectId: 'PRJ-2',
          employeeId: 'EMP-2',
          workAssigned: 'Task 2 Original',
          amount: 70000,
        });
      const id2 = res2.body.assignment.id;

      // Edit Assignment 1 via PUT
      const updateRes = await request(app)
        .put(`/api/assignments/${id1}`)
        .set('Authorization', authHeader)
        .send({
          amount: 55000,
          workAssigned: 'Task 1 Extended Scope',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);

      // Verify Assignment 1 updated, Assignment 2 untouched
      const listRes = await request(app).get('/api/assignments').set('Authorization', authHeader);
      const asn1 = listRes.body.find((a: any) => a.id === id1);
      const asn2 = listRes.body.find((a: any) => a.id === id2);

      expect(asn1.amount).toBe(55000);
      expect(asn1.workAssigned).toBe('Task 1 Extended Scope');

      expect(asn2.amount).toBe(70000);
      expect(asn2.workAssigned).toBe('Task 2 Original');
    });

    it('PUT on non-existent assignment returns 404', async () => {
      const res = await request(app)
        .put('/api/assignments/DDI-ASN-999999')
        .set('Authorization', authHeader)
        .send({ amount: 10000 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('PUT on non-existent employee payment returns 404', async () => {
      const res = await request(app)
        .put('/api/employee-payments/DDI-EPAY-999999')
        .set('Authorization', authHeader)
        .send({ amountPaid: 10000 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // 5. Concurrent Creation Produces Unique IDs
  describe('5. Concurrency Protection & Non-Colliding Sequence Allocation', () => {
    it('concurrent employee payment creations allocate strictly unique IDs', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/employee-payments')
          .set('Authorization', authHeader)
          .send({
            isNew: true,
            brand: 'Device Doctor India',
            employeeId: 'DDI-EMP-001',
            employeeName: 'Amit Trivedi',
            paymentDate: '2026-03-01',
            amountPaid: 10000 + i,
            referenceUtr: `UTR-CONCURRENT-EPAY-${i}-${Date.now()}`,
          })
      );

      const responses = await Promise.all(promises);
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }

      const allocatedIds = responses.map((r) => r.body.payment.id);
      const uniqueIds = new Set(allocatedIds);
      expect(uniqueIds.size).toBe(5);
    });

    it('concurrent assignment creations allocate strictly unique IDs', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/assignments')
          .set('Authorization', authHeader)
          .send({
            isNew: true,
            brand: 'Device Doctor India',
            projectId: `PRJ-CONCURRENT-${i}`,
            employeeId: 'DDI-EMP-001',
            employeeName: 'Amit Trivedi',
            amount: 20000 + i,
            workAssigned: `Concurrent Task ${i}`,
          })
      );

      const responses = await Promise.all(promises);
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }

      const allocatedIds = responses.map((r) => r.body.assignment.id);
      const uniqueIds = new Set(allocatedIds);
      expect(uniqueIds.size).toBe(5);
    });
  });

  // 6. UTR Duplicate Protection and Idempotency
  describe('6. Employee Payment UTR Duplicate Protection & Idempotency', () => {
    it('rejects duplicate UTR when attempting to assign it to a different employee payment', async () => {
      const sharedUtr = 'UTR-SHARED-EMP-DUPLICATE-CHECK';

      // 1. First payment with UTR
      const res1 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 25000,
          referenceUtr: sharedUtr,
        });

      expect(res1.status).toBe(200);

      // 2. Second payment with the same UTR
      const res2 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-002',
          employeeName: 'Vikram Batra',
          amountPaid: 35000,
          referenceUtr: sharedUtr,
        });

      expect(res2.status).toBe(409);
      expect(res2.body.success).toBe(false);
      expect(res2.body.error).toContain('already in use');
    });

    it('handles identical re-submission (same ID and same UTR) idempotently', async () => {
      const idempotentUtr = 'UTR-EMP-IDEMPOTENT-001';

      // 1. Initial creation
      const res1 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 25000,
          referenceUtr: idempotentUtr,
        });

      expect(res1.status).toBe(200);
      const paymentId = res1.body.payment.id;

      // 2. Exact same submission
      const res2 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          id: paymentId,
          isNew: true,
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 25000,
          referenceUtr: idempotentUtr,
        });

      expect(res2.status).toBe(200);
      expect(res2.body.payment.id).toBe(paymentId);

      // Verify no duplicates created
      const listRes = await request(app).get('/api/employee-payments').set('Authorization', authHeader);
      const matching = listRes.body.filter((p: any) => p.referenceUtr === idempotentUtr);
      expect(matching.length).toBe(1);
    });

    it('handles blind retry without ID having identical details & UTR idempotently with HTTP 200', async () => {
      const blindUtr = 'UTR-EMP-BLIND-RETRY-001';

      // 1. First creation attempt without ID
      const res1 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 42000,
          paymentDate: '2026-03-01',
          referenceUtr: blindUtr,
        });

      expect(res1.status).toBe(200);
      const allocatedId = res1.body.payment.id;

      // 2. Exact same request retried by client without ID
      const res2 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 42000,
          paymentDate: '2026-03-01',
          referenceUtr: blindUtr,
        });

      expect(res2.status).toBe(200);
      expect(res2.body.payment.id).toBe(allocatedId);
      expect(res2.body.payment.amountPaid).toBe(42000);

      // Verify still exactly one record in list
      const listRes = await request(app).get('/api/employee-payments').set('Authorization', authHeader);
      const matching = listRes.body.filter((p: any) => p.referenceUtr === blindUtr);
      expect(matching.length).toBe(1);
    });

    it('rejects duplicate UTR with conflicting employee name even if employeeId matches (HTTP 409)', async () => {
      const utr = 'UTR-CONFLICT-NAME-001';
      await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 30000,
          referenceUtr: utr,
        });

      // Conflicting name
      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Rohan Sharma', // Different employee name
          amountPaid: 30000,
          referenceUtr: utr,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('conflicting employee name');
    });

    it('rejects duplicate UTR with conflicting amount (HTTP 409)', async () => {
      const utr = 'UTR-CONFLICT-AMOUNT-001';
      await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 30000,
          referenceUtr: utr,
        });

      // Conflicting amount
      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 35000, // Different amount
          referenceUtr: utr,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('conflicting amount');
    });

    it('rejects duplicate UTR with conflicting assignment ID (HTTP 409)', async () => {
      const utr = 'UTR-CONFLICT-ASN-001';
      await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          assignmentId: 'DDI-ASN-001',
          amountPaid: 30000,
          referenceUtr: utr,
        });

      // Conflicting assignment
      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          assignmentId: 'DDI-ASN-002', // Different assignment
          amountPaid: 30000,
          referenceUtr: utr,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('conflicting assignment ID');
    });

    it('rejects duplicate UTR with conflicting payment date (HTTP 409)', async () => {
      const utr = 'UTR-CONFLICT-DATE-001';
      await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          paymentDate: '2026-03-01',
          amountPaid: 30000,
          referenceUtr: utr,
        });

      // Conflicting date
      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          paymentDate: '2026-03-05', // Different date
          amountPaid: 30000,
          referenceUtr: utr,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('conflicting payment date');
    });
  });

  // 7. Multiple independent assignments for same employee or same project
  describe('7. Domain Integrity: Multiple Assignments for Same Project or Employee', () => {
    it('allows allocating multiple distinct assignments to the same employee across different projects', async () => {
      const res1 = await request(app)
        .post('/api/assignments')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          projectId: 'PRJ-MUKUNDARA-001',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amount: 30000,
          workAssigned: 'Deliverable 1',
        });

      const res2 = await request(app)
        .post('/api/assignments')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          projectId: 'PRJ-MUKUNDARA-002',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amount: 40000,
          workAssigned: 'Deliverable 2',
        });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.assignment.id).not.toBe(res2.body.assignment.id);

      const listRes = await request(app).get('/api/assignments').set('Authorization', authHeader);
      const empAssignments = listRes.body.filter((a: any) => a.employeeId === 'DDI-EMP-001');
      expect(empAssignments.length).toBeGreaterThanOrEqual(2);
    });
  });

  // 8. Azure SQL Connection Pool Active: Strict Sequence Calculation & Overwrite Prevention
  describe('8. Azure SQL Connection Pool Active: Concurrency & Overwrite Prevention', () => {
    it('calculateNextAssignmentIdSql calculates correct sequence against SQL query', async () => {
      const fakePool: any = {
        transaction: () => ({
          begin: async () => {},
          commit: async () => {},
          rollback: async () => {},
          request: () => fakePool.request(),
        }),
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              expect(sqlText).toContain('assignments WITH (UPDLOCK, HOLDLOCK, TABLOCK)');
              return {
                recordset: [
                  { id: 'DDI-ASN-001' },
                  { id: 'DDI-ASN-002' },
                ],
              };
            },
          };
          return req;
        },
      };

      const nextId = await calculateNextAssignmentIdSql(fakePool, 'Device Doctor India');
      expect(nextId).toBe('DDI-ASN-003');
    });

    it('calculateNextEmployeePaymentIdSql calculates correct sequence against SQL query', async () => {
      const fakePool: any = {
        transaction: () => ({
          begin: async () => {},
          commit: async () => {},
          rollback: async () => {},
          request: () => fakePool.request(),
        }),
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              expect(sqlText).toContain('employee_payments WITH (UPDLOCK, HOLDLOCK, TABLOCK)');
              return {
                recordset: [
                  { id: 'DDI-EPAY-001' },
                  { id: 'DDI-EPAY-002' },
                  { id: 'DDI-EPAY-005' },
                ],
              };
            },
          };
          return req;
        },
      };

      const nextId = await calculateNextEmployeePaymentIdSql(fakePool, 'Device Doctor India');
      expect(nextId).toBe('DDI-EPAY-006');
    });

    it('automatically generates next sequence ID from SQL database when pool is active and client attempts new assignment with colliding ID', async () => {
      const capturedSqlQueries: { sqlText: string; inputs: Record<string, any> }[] = [];

      const mockExistingAssignment = {
        id: 'DDI-ASN-001',
        assignment_id_code: 'DDI-ASN-001',
        brand: 'Device Doctor India',
        project_id: 'PRJ-EXISTING',
        employee_id: 'EMP-EXISTING',
        amount: 45000,
      };

      const fakePool: any = {
        transaction: () => ({
          begin: async () => {},
          commit: async () => {},
          rollback: async () => {},
          request: () => fakePool.request(),
        }),
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

              // Sequence lookup
              if (sqlText.includes('WHERE CAST(id AS NVARCHAR(150)) LIKE @pattern OR assignment_id_code LIKE @pattern')) {
                return { recordset: [{ id: 'DDI-ASN-001' }] };
              }

              // Existing check query
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM assignments')) {
                if (req.inputs.rawId === 'DDI-ASN-001') {
                  return { recordset: [mockExistingAssignment] };
                }
                return { recordset: [] };
              }

              // Save execution
              if (sqlText.includes('INSERT INTO assignments')) {
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
        .post('/api/assignments')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-ASN-001', // Colliding ID from Add modal bug
          isNew: true, // Marked as new creation
          brand: 'Device Doctor India',
          projectId: 'PRJ-NEW-002',
          employeeId: 'EMP-NEW-002',
          employeeName: 'Vikram Batra',
          amount: 60000,
          workAssigned: 'New non-colliding task',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.assignment).toBeDefined();

      // Crucial assertion: Must have resolved to DDI-ASN-002, NOT overwritten DDI-ASN-001!
      expect(res.body.assignment.id).toBe('DDI-ASN-002');
      expect(res.body.assignment.amount).toBe(60000);

      // Verify strict INSERT executed
      const insertQuery = capturedSqlQueries.find((q) => q.sqlText.includes('INSERT INTO assignments'));
      expect(insertQuery).toBeDefined();
      expect(insertQuery!.inputs.rawId).toBe('DDI-ASN-002');

      const updateQuery = capturedSqlQueries.find((q) => q.sqlText.includes('UPDATE assignments SET'));
      expect(updateQuery).toBeUndefined();
    });

    it('automatically generates next sequence ID from SQL database when pool is active and client attempts new employee payment with colliding ID', async () => {
      const capturedSqlQueries: { sqlText: string; inputs: Record<string, any> }[] = [];

      const mockExistingPayment = {
        id: 'DDI-EPAY-001',
        emp_payment_id_code: 'DDI-EPAY-001',
        brand: 'Device Doctor India',
        reference_utr: 'UTR-EXISTING-001',
        amount_paid: 45000,
      };

      const fakePool: any = {
        transaction: () => ({
          begin: async () => {},
          commit: async () => {},
          rollback: async () => {},
          request: () => fakePool.request(),
        }),
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

              // Sequence lookup
              if (sqlText.includes('WHERE CAST(id AS NVARCHAR(150)) LIKE @pattern OR emp_payment_id_code LIKE @pattern')) {
                return { recordset: [{ id: 'DDI-EPAY-001' }] };
              }

              // UTR duplicate check query (must precede generic existing check)
              if (sqlText.includes('reference_utr = @utr') || sqlText.includes('WHERE reference_utr')) {
                return { recordset: [] };
              }

              // Existing check query
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM employee_payments')) {
                if (req.inputs.rawId === 'DDI-EPAY-001') {
                  return { recordset: [mockExistingPayment] };
                }
                return { recordset: [] };
              }

              // Save execution
              if (sqlText.includes('INSERT INTO employee_payments')) {
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
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-EPAY-001', // Colliding ID from Add modal bug
          isNew: true, // Marked as new creation
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 35000,
          referenceUtr: 'UTR-NEW-NONCOLLIDING-999',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment).toBeDefined();

      // Crucial assertion: Must have resolved to DDI-EPAY-002, NOT overwritten DDI-EPAY-001!
      expect(res.body.payment.id).toBe('DDI-EPAY-002');
      expect(res.body.payment.amountPaid).toBe(35000);

      // Verify strict INSERT executed
      const insertQuery = capturedSqlQueries.find((q) => q.sqlText.includes('INSERT INTO employee_payments'));
      expect(insertQuery).toBeDefined();
      expect(insertQuery!.inputs.rawId).toBe('DDI-EPAY-002');

      const updateQuery = capturedSqlQueries.find((q) => q.sqlText.includes('UPDATE employee_payments SET'));
      expect(updateQuery).toBeUndefined();
    });

    it('aborts POST and returns 500/503 when mandatory transaction.begin() fails in production without falling back to mockStore', async () => {
      const failingTxPool: any = {
        transaction: () => ({
          begin: async () => {
            throw new Error('Connection lost while beginning transaction');
          },
          commit: async () => {},
          rollback: async () => {},
          request: () => ({}),
        }),
      };

      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(failingTxPool);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/assignments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          amount: 50000,
          workAssigned: 'Transaction failure test',
        });

      expect([500, 503]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });
  });

  // 9. Frontend storageService.generateId with existing items
  describe('9. Frontend ID Generation with Items Array', () => {
    it('storageService.generateId calculates correct next sequential ID when items are provided', () => {
      const existingAssignments = [
        { id: 'DDI-ASN-001' },
        { id: 'DDI-ASN-002' },
      ];
      const nextAsnId = storageService.generateId('ASN', 'Device Doctor India', existingAssignments as any);
      expect(nextAsnId).toBe('DDI-ASN-003');

      const existingEpays = [
        { id: 'DDI-EPAY-001' },
        { id: 'DDI-EPAY-002' },
        { id: 'DDI-EPAY-004' },
      ];
      const nextEpayId = storageService.generateId('EPAY', 'Device Doctor India', existingEpays as any);
      expect(nextEpayId).toBe('DDI-EPAY-005');
    });
  });

  // 10. Multi-Instance Simulated Connection Concurrency & Strict REST Integrity
  describe('10. Multi-Instance Simulated Connection Concurrency & Strict REST Integrity', () => {
    it('simulates concurrent creates across two separate database connections with transaction locks', async () => {
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Simulate Azure SQL database state with table locking
      let committedAssignments = [{ id: 'DDI-ASN-001' }];
      let activeLockHolder: string | null = null;
      const pendingQueue: (() => void)[] = [];

      function createSimulatedConnection(instanceName: string) {
        return {
          transaction: () => {
            return {
              begin: async () => {
                // Wait if another connection holds the transaction lock
                if (activeLockHolder && activeLockHolder !== instanceName) {
                  await new Promise<void>((resolve) => pendingQueue.push(resolve));
                }
                activeLockHolder = instanceName;
              },
              commit: async () => {
                activeLockHolder = null;
                if (pendingQueue.length > 0) {
                  const next = pendingQueue.shift();
                  if (next) next();
                }
              },
              rollback: async () => {
                activeLockHolder = null;
                if (pendingQueue.length > 0) {
                  const next = pendingQueue.shift();
                  if (next) next();
                }
              },
              request: () => {
                const req: any = {
                  inputs: {} as Record<string, any>,
                  input(name: string, val: any) {
                    req.inputs[name] = val;
                    return req;
                  },
                  query: async (sqlText: string) => {
                    if (sqlText.includes('WHERE CAST(id AS NVARCHAR(150)) LIKE @pattern OR assignment_id_code LIKE @pattern')) {
                      return { recordset: [...committedAssignments] };
                    }
                    if (sqlText.includes('INSERT INTO assignments')) {
                      committedAssignments.push({ id: req.inputs.rawId });
                      return { recordset: [] };
                    }
                    return { recordset: [] };
                  },
                };
                return req;
              },
            };
          },
        };
      }

      const conn1 = createSimulatedConnection('Instance-1');
      const conn2 = createSimulatedConnection('Instance-2');

      // Both instances start creation concurrently
      const [res1, res2] = await Promise.all([
        (async () => {
          const tx1 = conn1.transaction();
          await tx1.begin();
          const id1 = await calculateNextAssignmentIdSql(tx1 as any, 'Device Doctor India');
          await tx1.request().input('rawId', id1).query('INSERT INTO assignments');
          await tx1.commit();
          return id1;
        })(),
        (async () => {
          const tx2 = conn2.transaction();
          await tx2.begin();
          const id2 = await calculateNextAssignmentIdSql(tx2 as any, 'Device Doctor India');
          await tx2.request().input('rawId', id2).query('INSERT INTO assignments');
          await tx2.commit();
          return id2;
        })(),
      ]);

      // Assertions:
      // Instance 1 generated DDI-ASN-002, Instance 2 waited and generated DDI-ASN-003!
      expect([res1, res2]).toContain('DDI-ASN-002');
      expect([res1, res2]).toContain('DDI-ASN-003');
      expect(res1).not.toBe(res2);
      expect(committedAssignments.map((a) => a.id)).toEqual(['DDI-ASN-001', 'DDI-ASN-002', 'DDI-ASN-003']);
    });

    it('POST with explicit colliding ID and isNew=false is rejected with 409 Conflict without modifying original', async () => {
      const seededAsn = mockStore.getAssignments('Device Doctor India')[0];
      const origAmount = seededAsn.amount;

      const res = await request(app)
        .post('/api/assignments')
        .set('Authorization', authHeader)
        .send({
          id: seededAsn.id,
          isNew: false, // Explicitly not marked as new
          brand: 'Device Doctor India',
          projectId: 'PRJ-MOD-TEST',
          employeeId: 'EMP-MOD-TEST',
          amount: 999999, // Should NOT overwrite
          workAssigned: 'Malicious overwrite payload',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('already exists');

      // Verify original remains untouched
      const checkAsn = mockStore.getAssignments('Device Doctor India').find((a) => a.id === seededAsn.id);
      expect(checkAsn!.amount).toBe(origAmount);
    });

    it('PUT with non-existent ID returns 404 Not Found and never inserts a new record', async () => {
      const initialCount = mockStore.getAssignments(null).length;

      const res = await request(app)
        .put('/api/assignments/DDI-ASN-NONEXISTENT-999')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          amount: 50000,
          workAssigned: 'Ghost update',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found for update');

      const finalCount = mockStore.getAssignments(null).length;
      expect(finalCount).toBe(initialCount);
    });

    it('simulates concurrent employee payment creates across two separate database connections with transaction locks', async () => {
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      let committedPayments = [{ id: 'DDI-EPAY-001' }];
      let activeLockHolder: string | null = null;
      const pendingQueue: (() => void)[] = [];

      function createSimulatedConnection(instanceName: string) {
        return {
          transaction: () => ({
            begin: async () => {
              if (activeLockHolder && activeLockHolder !== instanceName) {
                await new Promise<void>((resolve) => pendingQueue.push(resolve));
              }
              activeLockHolder = instanceName;
            },
            commit: async () => {
              activeLockHolder = null;
              if (pendingQueue.length > 0) {
                const next = pendingQueue.shift();
                if (next) next();
              }
            },
            rollback: async () => {
              activeLockHolder = null;
              if (pendingQueue.length > 0) {
                const next = pendingQueue.shift();
                if (next) next();
              }
            },
            request: () => {
              const req: any = {
                inputs: {} as Record<string, any>,
                input(name: string, val: any) {
                  req.inputs[name] = val;
                  return req;
                },
                query: async (sqlText: string) => {
                  if (sqlText.includes('WHERE CAST(id AS NVARCHAR(150)) LIKE @pattern OR emp_payment_id_code LIKE @pattern')) {
                    return { recordset: [...committedPayments] };
                  }
                  if (sqlText.includes('INSERT INTO employee_payments')) {
                    committedPayments.push({ id: req.inputs.rawId });
                    return { recordset: [] };
                  }
                  return { recordset: [] };
                },
              };
              return req;
            },
          }),
        };
      }

      const conn1 = createSimulatedConnection('Instance-1');
      const conn2 = createSimulatedConnection('Instance-2');

      const [res1, res2] = await Promise.all([
        (async () => {
          const tx1 = conn1.transaction();
          await tx1.begin();
          const id1 = await calculateNextEmployeePaymentIdSql(tx1 as any, 'Device Doctor India');
          await tx1.request().input('rawId', id1).query('INSERT INTO employee_payments');
          await tx1.commit();
          return id1;
        })(),
        (async () => {
          const tx2 = conn2.transaction();
          await tx2.begin();
          const id2 = await calculateNextEmployeePaymentIdSql(tx2 as any, 'Device Doctor India');
          await tx2.request().input('rawId', id2).query('INSERT INTO employee_payments');
          await tx2.commit();
          return id2;
        })(),
      ]);

      expect([res1, res2]).toContain('DDI-EPAY-002');
      expect([res1, res2]).toContain('DDI-EPAY-003');
      expect(res1).not.toBe(res2);
      expect(committedPayments.map((p) => p.id)).toEqual(['DDI-EPAY-001', 'DDI-EPAY-002', 'DDI-EPAY-003']);
    });

    it('POST with explicit colliding employee payment ID and isNew=false is rejected with 409 Conflict without modifying original', async () => {
      const seededEpay = mockStore.getEmployeePayments('Device Doctor India')[0];
      const origAmount = seededEpay.amountPaid;

      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          id: seededEpay.id,
          isNew: false, // Explicitly not marked as new
          brand: 'Device Doctor India',
          employeeId: seededEpay.employeeId,
          employeeName: seededEpay.employeeName,
          amountPaid: 999999, // Should NOT overwrite
          referenceUtr: 'UTR-COLLIDE-TEST-NON-IDEMPOTENT',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('already exists');

      // Verify original remains untouched
      const checkEpay = mockStore.getEmployeePayments('Device Doctor India').find((p) => p.id === seededEpay.id);
      expect(checkEpay!.amountPaid).toBe(origAmount);
    });

    it('PUT with non-existent employee payment ID returns 404 Not Found and never inserts a new record', async () => {
      const initialCount = mockStore.getEmployeePayments(null).length;

      const res = await request(app)
        .put('/api/employee-payments/DDI-EPAY-NONEXISTENT-999')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          amountPaid: 45000,
          notes: 'Ghost payout update',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found for update');

      const finalCount = mockStore.getEmployeePayments(null).length;
      expect(finalCount).toBe(initialCount);
    });
  });

  // 11. Strict UTR Idempotency & Conflict Prevention Regression Suite
  describe('11. Strict UTR Idempotency & Conflict Prevention Regression Suite', () => {
    it('rejects replay when existing has assignment ID but incoming assignment ID is missing', async () => {
      const existing = {
        id: 'DDI-EPAY-100',
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000,
        referenceUtr: 'UTR-ASN-MISS-01',
      };
      const incoming: any = {
        brand: 'Device Doctor India',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000,
        referenceUtr: 'UTR-ASN-MISS-01',
        // assignmentId is missing
      };
      const check = verifyUtrIdempotency(existing, incoming);
      expect(check.isIdentical).toBe(false);
      expect(check.conflictReason).toContain('assignment ID presence mismatch');
    });

    it('rejects replay when existing has payment date but incoming payment date is missing', async () => {
      const existing = {
        id: 'DDI-EPAY-101',
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000,
        referenceUtr: 'UTR-DATE-MISS-01',
      };
      const incoming: any = {
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000,
        referenceUtr: 'UTR-DATE-MISS-01',
        // paymentDate is missing
      };
      const check = verifyUtrIdempotency(existing, incoming);
      expect(check.isIdentical).toBe(false);
      expect(check.conflictReason).toContain('payment date presence mismatch');
    });

    it('rejects replay when existing has brand but incoming brand is missing', async () => {
      const existing = {
        id: 'DDI-EPAY-102',
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000,
        referenceUtr: 'UTR-BRAND-MISS-01',
      };
      const incoming: any = {
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000,
        referenceUtr: 'UTR-BRAND-MISS-01',
        // brand is missing
      };
      const check = verifyUtrIdempotency(existing, incoming);
      expect(check.isIdentical).toBe(false);
      expect(check.conflictReason).toContain('brand presence mismatch');
    });

    it('rejects replay when employee IDs contradict, even if employee names match', async () => {
      const existing = {
        id: 'DDI-EPAY-103',
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000,
        referenceUtr: 'UTR-EMPID-MISMATCH-01',
      };
      const incoming: any = {
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-999', // Contradictory ID!
        employeeName: 'Amit Trivedi', // Matching name must NOT override
        amountPaid: 25000,
        referenceUtr: 'UTR-EMPID-MISMATCH-01',
      };
      const check = verifyUtrIdempotency(existing, incoming);
      expect(check.isIdentical).toBe(false);
      expect(check.conflictReason).toContain('conflicting employee ID');
    });

    it('handles brand and brand_id aliases consistently for identical replays', async () => {
      const existing = {
        id: 'DDI-EPAY-104',
        brand_id: 'Device Doctor India', // database brand_id
        assignment_id: 'DDI-ASN-001',
        payment_date: '2026-03-15',
        employee_id: 'DDI-EMP-001',
        employee_name: 'Amit Trivedi',
        amount_paid: 25000,
        reference_utr: 'UTR-BRAND-ALIAS-01',
      };
      const incoming: any = {
        brand: 'DDI', // Standard alias for Device Doctor India
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000,
        referenceUtr: 'UTR-BRAND-ALIAS-01',
      };
      const check = verifyUtrIdempotency(existing, incoming);
      expect(check.isIdentical).toBe(true);
    });

    it('rejects POST with same UTR but different amount with 409 Conflict', async () => {
      // 1. First payment
      const res1 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          paymentDate: '2026-03-15',
          amountPaid: 15000,
          paymentMode: 'GST Invoice',
          referenceUtr: 'UTR-AMT-DIFF-409',
        });
      expect(res1.status).toBe(200);

      // 2. Second payment with same UTR but different amount
      const res2 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          paymentDate: '2026-03-15',
          amountPaid: 16000, // Different amount!
          paymentMode: 'GST Invoice',
          referenceUtr: 'UTR-AMT-DIFF-409',
        });
      expect(res2.status).toBe(409);
      expect(res2.body.success).toBe(false);
      expect(res2.body.error).toContain('conflicting amount');
    });

    it('exact identical replay returns HTTP 200 and performs zero INSERT/UPDATE', async () => {
      const payload = {
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        paymentDate: '2026-03-15',
        amountPaid: 17500,
        paymentMode: 'GST Invoice',
        referenceUtr: 'UTR-EXACT-REPLAY-200',
      };

      const res1 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send(payload);
      expect(res1.status).toBe(200);
      const originalPayment = res1.body.payment;
      const originalCount = mockStore.getEmployeePayments(null).length;

      // Replay identical request
      const res2 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send(payload);
      expect(res2.status).toBe(200);
      expect(res2.body.payment.id).toBe(originalPayment.id);
      expect(res2.body.payment.amountPaid).toBe(17500);

      // Total count should NOT change (zero INSERT)
      const afterCount = mockStore.getEmployeePayments(null).length;
      expect(afterCount).toBe(originalCount);
    });

    it('conflicting replay returns HTTP 409 and does not modify the original record', async () => {
      const origPayload = {
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        paymentDate: '2026-03-15',
        amountPaid: 18000,
        paymentMode: 'GST Invoice',
        referenceUtr: 'UTR-CONFLICT-NOMOD-409',
        notes: 'Original untouched note',
      };

      const res1 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send(origPayload);
      expect(res1.status).toBe(200);
      const originalId = res1.body.payment.id;

      // Conflicting payload: different employee and omitted assignment
      const conflictPayload = {
        brand: 'Device Doctor India',
        employeeId: 'DDI-EMP-002', // different
        employeeName: 'Vikram Singh', // different
        paymentDate: '2026-03-15',
        amountPaid: 18000,
        paymentMode: 'GST Invoice',
        referenceUtr: 'UTR-CONFLICT-NOMOD-409',
        notes: 'Malicious modification note',
      };

      const res2 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send(conflictPayload);
      expect(res2.status).toBe(409);
      expect(res2.body.success).toBe(false);

      // Original record in store must remain completely intact
      const stored = mockStore.getEmployeePayments(null).find((p) => p.id === originalId);
      expect(stored).toBeDefined();
      expect(stored!.employeeId).toBe('DDI-EMP-001');
      expect(stored!.employeeName).toBe('Amit Trivedi');
      expect(stored!.notes).toBe('Original untouched note');
    });

    it('concurrent identical UTR requests do not create duplicate records', async () => {
      const payload = {
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        paymentDate: '2026-03-15',
        amountPaid: 19000,
        paymentMode: 'GST Invoice',
        referenceUtr: 'UTR-CONCURRENT-IDEMPOTENT-001',
      };

      const beforeCount = mockStore.getEmployeePayments(null).length;

      // Dispatch 2 concurrent identical requests
      const [resA, resB] = await Promise.all([
        request(app).post('/api/employee-payments').set('Authorization', authHeader).send(payload),
        request(app).post('/api/employee-payments').set('Authorization', authHeader).send(payload),
      ]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      expect(resA.body.payment.id).toBe(resB.body.payment.id);

      const afterCount = mockStore.getEmployeePayments(null).length;
      // Exactly 1 new record created, NOT 2!
      expect(afterCount).toBe(beforeCount + 1);
    });

    // Amount Validation & Boundary Regression Tests
    it('rejects replay when existing amount is missing', () => {
      const existing: any = {
        id: 'DDI-EPAY-201',
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        referenceUtr: 'UTR-AMT-TEST-01',
        // amount_paid / amountPaid is missing
      };
      const incoming: any = {
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000,
        referenceUtr: 'UTR-AMT-TEST-01',
      };
      const check = verifyUtrIdempotency(existing, incoming);
      expect(check.isIdentical).toBe(false);
      expect(check.conflictReason).toContain('invalid or missing amount on existing payment');
    });

    it('rejects replay when incoming amount is missing', () => {
      const existing: any = {
        id: 'DDI-EPAY-202',
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000,
        referenceUtr: 'UTR-AMT-TEST-02',
      };
      const incoming: any = {
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        referenceUtr: 'UTR-AMT-TEST-02',
        // amountPaid is missing
      };
      const check = verifyUtrIdempotency(existing, incoming);
      expect(check.isIdentical).toBe(false);
      expect(check.conflictReason).toContain('invalid or missing amount on requested payment');
    });

    it('rejects replay when existing amount is invalid (NaN / non-finite)', () => {
      const existing: any = {
        id: 'DDI-EPAY-203',
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 'not-a-number',
        referenceUtr: 'UTR-AMT-TEST-03',
      };
      const incoming: any = {
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000,
        referenceUtr: 'UTR-AMT-TEST-03',
      };
      const check = verifyUtrIdempotency(existing, incoming);
      expect(check.isIdentical).toBe(false);
      expect(check.conflictReason).toContain('invalid or missing amount on existing payment');
    });

    it('rejects replay when incoming amount is invalid (NaN / non-finite / Infinity)', () => {
      const existing: any = {
        id: 'DDI-EPAY-204',
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000,
        referenceUtr: 'UTR-AMT-TEST-04',
      };
      const incoming: any = {
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: Infinity,
        referenceUtr: 'UTR-AMT-TEST-04',
      };
      const check = verifyUtrIdempotency(existing, incoming);
      expect(check.isIdentical).toBe(false);
      expect(check.conflictReason).toContain('invalid or missing amount on requested payment');
    });

    it('rejects replay when both amounts are missing (never defaults to zero)', () => {
      const existing: any = {
        id: 'DDI-EPAY-205',
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        referenceUtr: 'UTR-AMT-TEST-05',
      };
      const incoming: any = {
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        referenceUtr: 'UTR-AMT-TEST-05',
      };
      const check = verifyUtrIdempotency(existing, incoming);
      expect(check.isIdentical).toBe(false);
      expect(check.conflictReason).toContain('missing amount on both existing and requested payment');
    });

    it('qualifies as identical replay when both amounts are valid and equal across aliases (amount_paid vs amountPaid)', () => {
      const existing: any = {
        id: 'DDI-EPAY-206',
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amount_paid: 25000, // SQL alias
        referenceUtr: 'UTR-AMT-TEST-06',
      };
      const incoming: any = {
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000, // Frontend alias
        referenceUtr: 'UTR-AMT-TEST-06',
      };
      const check = verifyUtrIdempotency(existing, incoming);
      expect(check.isIdentical).toBe(true);
    });

    it('evaluates amounts at the exact monetary tolerance boundary (0.001)', () => {
      const existing: any = {
        id: 'DDI-EPAY-207',
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000.000,
        referenceUtr: 'UTR-AMT-TEST-07',
      };

      // Difference is 0.0005 (< 0.001): within tolerance -> identical
      const incomingWithinTolerance: any = {
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000.0005,
        referenceUtr: 'UTR-AMT-TEST-07',
      };
      expect(verifyUtrIdempotency(existing, incomingWithinTolerance).isIdentical).toBe(true);

      // Difference is exactly 0.001 (>= 0.001): at/beyond tolerance -> conflict
      const incomingAtBoundary: any = {
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        paymentDate: '2026-03-15',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        amountPaid: 25000.001,
        referenceUtr: 'UTR-AMT-TEST-07',
      };
      const checkBoundary = verifyUtrIdempotency(existing, incomingAtBoundary);
      expect(checkBoundary.isIdentical).toBe(false);
      expect(checkBoundary.conflictReason).toContain('conflicting amount');
    });

    it('confirms invalid or incomplete replay requests via POST cannot return HTTP 200 as identical', async () => {
      // 1. Initial valid payment
      const initial = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          paymentDate: '2026-03-15',
          amountPaid: 22000,
          paymentMode: 'GST Invoice',
          referenceUtr: 'UTR-INCOMPLETE-REPLAY-TEST',
        });
      expect(initial.status).toBe(200);

      // 2. Incomplete replay missing amount: rejected by route validation (400) or idempotency (409), NEVER 200
      const resMissingAmt = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          paymentDate: '2026-03-15',
          referenceUtr: 'UTR-INCOMPLETE-REPLAY-TEST',
          // amountPaid omitted
        });
      expect(resMissingAmt.status).not.toBe(200);
      expect([400, 409]).toContain(resMissingAmt.status);
    });

    // 12. Amount Parser Type Safety & Rejection of Non-Decimal / Non-Numeric Inputs
    describe('12. Amount Parser Type Safety', () => {
      it('rejects boolean values (true and false) and does not coerce to numbers', () => {
        expect(parseValidFiniteAmount(true)).toBeNull();
        expect(parseValidFiniteAmount(false)).toBeNull();

        // Also test through verifyUtrIdempotency
        const existing: any = {
          id: 'DDI-EPAY-301',
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          paymentDate: '2026-03-15',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: true, // boolean should never coerce to 1
          referenceUtr: 'UTR-BOOL-TEST-01',
        };
        const incoming: any = {
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          paymentDate: '2026-03-15',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 1,
          referenceUtr: 'UTR-BOOL-TEST-01',
        };
        const check = verifyUtrIdempotency(existing, incoming);
        expect(check.isIdentical).toBe(false);
        expect(check.conflictReason).toContain('invalid or missing amount on existing payment');
      });

      it('rejects array inputs ([] and [25000]) and does not coerce to numbers', () => {
        expect(parseValidFiniteAmount([])).toBeNull();
        expect(parseValidFiniteAmount([25000])).toBeNull();
        expect(parseValidFiniteAmount(['25000'])).toBeNull();

        const existing: any = {
          id: 'DDI-EPAY-302',
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          paymentDate: '2026-03-15',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 25000,
          referenceUtr: 'UTR-ARRAY-TEST-01',
        };
        const incoming: any = {
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          paymentDate: '2026-03-15',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: [25000],
          referenceUtr: 'UTR-ARRAY-TEST-01',
        };
        const check = verifyUtrIdempotency(existing, incoming);
        expect(check.isIdentical).toBe(false);
        expect(check.conflictReason).toContain('invalid or missing amount on requested payment');
      });

      it('rejects object inputs ({}, { amount: 25000 }) and does not coerce to numbers', () => {
        expect(parseValidFiniteAmount({})).toBeNull();
        expect(parseValidFiniteAmount({ amount: 25000 })).toBeNull();

        const existing: any = {
          id: 'DDI-EPAY-303',
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          paymentDate: '2026-03-15',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: { amount: 25000 },
          referenceUtr: 'UTR-OBJ-TEST-01',
        };
        const incoming: any = {
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          paymentDate: '2026-03-15',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 25000,
          referenceUtr: 'UTR-OBJ-TEST-01',
        };
        const check = verifyUtrIdempotency(existing, incoming);
        expect(check.isIdentical).toBe(false);
        expect(check.conflictReason).toContain('invalid or missing amount on existing payment');
      });

      it('rejects hexadecimal strings (0x10, 0x1A) and non-decimal representations (0b101, 0o77)', () => {
        expect(parseValidFiniteAmount('0x10')).toBeNull();
        expect(parseValidFiniteAmount('0x1A')).toBeNull();
        expect(parseValidFiniteAmount('0XFF')).toBeNull();
        expect(parseValidFiniteAmount('0b101')).toBeNull();
        expect(parseValidFiniteAmount('0o77')).toBeNull();

        const existing: any = {
          id: 'DDI-EPAY-304',
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          paymentDate: '2026-03-15',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 16,
          referenceUtr: 'UTR-HEX-TEST-01',
        };
        const incoming: any = {
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          paymentDate: '2026-03-15',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: '0x10', // 16 in hex, but MUST NOT be accepted as decimal payment
          referenceUtr: 'UTR-HEX-TEST-01',
        };
        const check = verifyUtrIdempotency(existing, incoming);
        expect(check.isIdentical).toBe(false);
        expect(check.conflictReason).toContain('invalid or missing amount on requested payment');
      });

      it('rejects empty or whitespace-only strings, NaN, Infinity, -Infinity and invalid numeric strings', () => {
        expect(parseValidFiniteAmount('')).toBeNull();
        expect(parseValidFiniteAmount('   ')).toBeNull();
        expect(parseValidFiniteAmount(NaN)).toBeNull();
        expect(parseValidFiniteAmount(Infinity)).toBeNull();
        expect(parseValidFiniteAmount(-Infinity)).toBeNull();
        expect(parseValidFiniteAmount('abc')).toBeNull();
        expect(parseValidFiniteAmount('25000abc')).toBeNull();
        expect(parseValidFiniteAmount('12.34.56')).toBeNull();
      });

      it('accepts valid decimal strings and parses them to correct finite numbers', () => {
        expect(parseValidFiniteAmount('25000')).toBe(25000);
        expect(parseValidFiniteAmount('25000.5')).toBe(25000.5);
        expect(parseValidFiniteAmount('  25000.75  ')).toBe(25000.75);
        expect(parseValidFiniteAmount('0.05')).toBe(0.05);
        expect(parseValidFiniteAmount('.5')).toBe(0.5);
        expect(parseValidFiniteAmount('+25000')).toBe(25000);
      });

      it('accepts valid JavaScript finite numbers', () => {
        expect(parseValidFiniteAmount(25000)).toBe(25000);
        expect(parseValidFiniteAmount(25000.75)).toBe(25000.75);
        expect(parseValidFiniteAmount(0)).toBe(0);
        expect(parseValidFiniteAmount(0.001)).toBe(0.001);
      });

      it('satisfies exact required parser test matrix', () => {
        expect(parseValidFiniteAmount('25000')).toBe(25000);
        expect(parseValidFiniteAmount('25000.75')).toBe(25000.75);
        expect(parseValidFiniteAmount('.5')).toBe(0.5);
        expect(parseValidFiniteAmount('0.05')).toBe(0.05);
        expect(parseValidFiniteAmount('-25000.75')).toBe(-25000.75);
        expect(parseValidFiniteAmount('1e4')).toBe(10000);
        expect(parseValidFiniteAmount('0x10')).toBeNull();
        expect(parseValidFiniteAmount('25000abc')).toBeNull();
        expect(parseValidFiniteAmount(true)).toBeNull();
        expect(parseValidFiniteAmount([])).toBeNull();
        expect(parseValidFiniteAmount({})).toBeNull();
      });
    });
  });
});
