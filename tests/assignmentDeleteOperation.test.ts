import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import { mockStore } from '../server/db/mockStore';
import * as azureSqlModule from '../server/db/azureSql';
import { storageService } from '../src/services/storageService';
import type { Assignment, EmployeePayment } from '../src/types/crm';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('FIX 19: Assignments Module Delete Operation Investigation & Fix Tests', () => {
  beforeEach(() => {
    mockStore.seedDefaultData();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Assignment Creation, Editing & Successful Deletion
  describe('1. Assignment Lifecycle: Create, Edit & Delete Flow', () => {
    it('successfully creates an assignment via POST /api/assignments', async () => {
      const payload = {
        brand: 'Device Doctor India',
        projectId: 'PRJ-TEST-DEL-01',
        clientId: 'CLI-TEST-01',
        clientName: 'Test Client',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        roleName: 'Lead Engineer',
        assignedDate: '2026-03-01',
        workAssigned: 'Database Optimization Task',
        amount: 35000,
        amountPaid: 0,
        paymentStatus: 'Pending',
      };

      const res = await request(app)
        .post('/api/assignments')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.assignment).toBeDefined();
      expect(res.body.assignment.id).toBeDefined();
      expect(res.body.assignment.workAssigned).toBe('Database Optimization Task');
    });

    it('successfully updates an existing assignment via PUT /api/assignments/:id', async () => {
      // First create an assignment
      const createRes = await request(app)
        .post('/api/assignments')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India')
        .send({
          brand: 'Device Doctor India',
          projectId: 'PRJ-TEST-DEL-02',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amount: 40000,
          workAssigned: 'Initial Scope',
        });

      const assignmentId = createRes.body.assignment.id;

      // Update it
      const updateRes = await request(app)
        .put(`/api/assignments/${assignmentId}`)
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India')
        .send({
          id: assignmentId,
          brand: 'Device Doctor India',
          projectId: 'PRJ-TEST-DEL-02',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amount: 45000,
          workAssigned: 'Updated Scope with Extra Deliverables',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.assignment.workAssigned).toBe('Updated Scope with Extra Deliverables');
      expect(updateRes.body.assignment.amount).toBe(45000);
    });

    it('successfully deletes an assignment via DELETE /api/assignments/:id and verifies removal', async () => {
      // 1. Create an assignment
      const createRes = await request(app)
        .post('/api/assignments')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India')
        .send({
          brand: 'Device Doctor India',
          projectId: 'PRJ-DEL-VERIFY',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amount: 25000,
          workAssigned: 'Task to be deleted',
        });

      const assignmentId = createRes.body.assignment.id;
      expect(assignmentId).toBeDefined();

      // Verify it exists in GET
      const getBefore = await request(app)
        .get('/api/assignments')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India');
      expect(getBefore.body.some((a: any) => a.id === assignmentId)).toBe(true);

      // 2. Delete the assignment
      const deleteRes = await request(app)
        .delete(`/api/assignments/${assignmentId}`)
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India');

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);
      expect(deleteRes.body.id).toBe(assignmentId);

      // 3. Verify it is completely removed after page refresh / fresh GET
      const getAfter = await request(app)
        .get('/api/assignments')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India');
      expect(getAfter.body.some((a: any) => a.id === assignmentId)).toBe(false);
    });
  });

  // 2. Error Handling & Validation
  describe('2. Validation & Security Checks', () => {
    it('rejects deletion of a non-existent assignment with HTTP 404', async () => {
      const res = await request(app)
        .delete('/api/assignments/NON-EXISTENT-ASN-999')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found or does not exist');
    });

    it('rejects unauthenticated DELETE /api/assignments/:id with HTTP 401', async () => {
      const res = await request(app)
        .delete('/api/assignments/DDI-ASN-001');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Access denied');
    });

    it('rejects deletion when assignment belongs to another workspace brand with HTTP 403', async () => {
      // Create assignment under Codestro
      const createRes = await request(app)
        .post('/api/assignments')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Codestro')
        .send({
          brand: 'Codestro',
          projectId: 'PRJ-CODESTRO-01',
          employeeId: 'EMP-001',
          employeeName: 'Staff Member',
          amount: 30000,
          workAssigned: 'Codestro Task',
        });

      const codestroAsnId = createRes.body.assignment.id;

      // Attempt to delete it from 'Device Doctor India' workspace
      const deleteRes = await request(app)
        .delete(`/api/assignments/${codestroAsnId}`)
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India');

      expect(deleteRes.status).toBe(403);
      expect(deleteRes.body.success).toBe(false);
      expect(deleteRes.body.error).toContain('Permission denied');
    });
  });

  // 3. Referential Integrity: Financial Records & Payouts Protection
  describe('3. Referential Integrity Protection', () => {
    it('blocks assignment deletion with HTTP 409 when employee payouts are linked to it', async () => {
      // Create assignment
      const createAsnRes = await request(app)
        .post('/api/assignments')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India')
        .send({
          brand: 'Device Doctor India',
          projectId: 'PRJ-PAYOUT-TEST',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amount: 50000,
          workAssigned: 'Task with Payout',
        });

      const asnId = createAsnRes.body.assignment.id;

      // Create linked employee payout
      const createPayRes = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India')
        .send({
          brand: 'Device Doctor India',
          assignmentId: asnId,
          projectId: 'PRJ-PAYOUT-TEST',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 20000,
          paymentDate: '2026-03-05',
          paymentMode: 'Bank Transfer',
        });

      expect(createPayRes.status).toBe(200);
      const payoutId = createPayRes.body.payment.id;

      // Attempt to delete assignment
      const deleteRes = await request(app)
        .delete(`/api/assignments/${asnId}`)
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India');

      expect(deleteRes.status).toBe(409);
      expect(deleteRes.body.success).toBe(false);
      expect(deleteRes.body.error).toContain('payout record(s) are logged against it');

      // Crucial assertion: Employee payout MUST remain completely intact!
      const getPayouts = await request(app)
        .get('/api/employee-payments')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India');

      const foundPayout = getPayouts.body.find((p: any) => p.id === payoutId);
      expect(foundPayout).toBeDefined();
      expect(foundPayout.amountPaid).toBe(20000);
    });

    it('storageService.canDeleteAssignment blocks deletion when payouts are present', () => {
      const testAsnId = 'DDI-ASN-999';
      const assignments: Assignment[] = [
        {
          id: testAsnId,
          brand: 'Device Doctor India',
          projectId: 'PRJ-1',
          clientId: 'CLI-1',
          clientName: 'Test Client',
          employeeId: 'EMP-1',
          employeeName: 'Test Emp',
          roleName: 'Engineer',
          assignedDate: '2026-03-01',
          workAssigned: 'Testing Task',
          amount: 10000,
          amountPaid: 5000,
          paymentStatus: 'Partially Paid',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
      ];

      const payments: EmployeePayment[] = [
        {
          id: 'DDI-EPAY-001',
          brand: 'Device Doctor India',
          assignmentId: testAsnId,
          projectId: 'PRJ-1',
          employeeId: 'EMP-1',
          employeeName: 'Test Emp',
          amountPaid: 5000,
          paymentDate: '2026-03-01',
          paymentMode: 'GST Invoice',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
      ];

      const check = storageService.canDeleteAssignment(testAsnId, payments, assignments);
      expect(check.allowed).toBe(false);
      expect(check.linkedCount).toBe(1);
      expect(check.reason).toContain('1 payout(s) have been disbursed against it');

      // Test with unlinked assignment
      const checkUnlinked = storageService.canDeleteAssignment('DDI-ASN-OTHER', payments, assignments);
      expect(checkUnlinked.allowed).toBe(true);
      expect(checkUnlinked.linkedCount).toBe(0);
    });
  });

  // 4. Live Azure SQL Simulation Tests (Safe CAST, Type Compatibility & Zero Mock Fallback)
  describe('4. Azure SQL Live Pool Execution & Type Safety', () => {
    it('executes SQL queries with safe CAST comparisons and returns 200 on successful Azure SQL deletion', async () => {
      const capturedSqlQueries: { sqlText: string; inputs: Record<string, any> }[] = [];

      const mockExistingAssignment = {
        id: 'c1d2e3f4-5678-90ab-cdef-1234567890ab',
        assignment_id_code: 'DDI-ASN-SQL-01',
        brand: 'Device Doctor India',
      };

      const fakePool: any = {
        connected: true,
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              capturedSqlQueries.push({ sqlText, inputs: { ...req.inputs } });

              // 1. Existing check query
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM assignments')) {
                return { recordset: [mockExistingAssignment] };
              }

              // 2. Dependency check query (employee_payments)
              if (sqlText.includes('SELECT COUNT(1) as payCount') && sqlText.includes('FROM employee_payments')) {
                return { recordset: [{ payCount: 0 }] };
              }

              // 3. Delete query
              if (sqlText.includes('DELETE FROM assignments')) {
                return { rowsAffected: [1] };
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
        .delete('/api/assignments/DDI-ASN-SQL-01')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe('DDI-ASN-SQL-01');

      // Verify safe CAST in dependency query to prevent MSSQL Error 8169
      const depQuery = capturedSqlQueries.find((q) => q.sqlText.includes('FROM employee_payments'));
      expect(depQuery).toBeDefined();
      expect(depQuery!.sqlText).toContain('CAST(assignment_id AS NVARCHAR(150))');

      // Verify safe CAST in delete query
      const delQuery = capturedSqlQueries.find((q) => q.sqlText.includes('DELETE FROM assignments'));
      expect(delQuery).toBeDefined();
      expect(delQuery!.sqlText).toContain('CAST(id AS NVARCHAR(150))');
    });

    it('returns HTTP 409 Conflict without falling back to mockStore when Azure SQL finds linked payouts', async () => {
      const fakePool: any = {
        connected: true,
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM assignments')) {
                return {
                  recordset: [
                    {
                      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                      assignment_id_code: 'DDI-ASN-LINKED-01',
                      brand: 'Device Doctor India',
                    },
                  ],
                };
              }
              if (sqlText.includes('SELECT COUNT(1) as payCount')) {
                return { recordset: [{ payCount: 2 }] };
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
        .delete('/api/assignments/DDI-ASN-LINKED-01')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India');

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('2 employee payout record(s) are logged against it');
    });

    it('returns HTTP 404 when assignment does not exist in Azure SQL (zero fake success)', async () => {
      const fakePool: any = {
        connected: true,
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM assignments')) {
                return { recordset: [] }; // Not found
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
        .delete('/api/assignments/DDI-ASN-NONEXISTENT')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found or does not exist');
    });

    it('returns HTTP 503 Azure SQL Database Unavailable when pool is null in production', async () => {
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(null);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .delete('/api/assignments/DDI-ASN-001')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India');

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(res.body.message).toContain('Cannot complete delete assignment');
    });

    it('correctly classifies genuine SQL errors via sendDatabaseError (e.g. HTTP 409 for constraint violations)', async () => {
      const fakePool: any = {
        connected: true,
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM assignments')) {
                return {
                  recordset: [
                    {
                      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                      assignment_id_code: 'DDI-ASN-ERR-01',
                      brand: 'Device Doctor India',
                    },
                  ],
                };
              }
              if (sqlText.includes('SELECT COUNT(1) as payCount')) {
                return { recordset: [{ payCount: 0 }] };
              }
              if (sqlText.includes('DELETE FROM assignments')) {
                // Simulate foreign key constraint violation
                const constraintErr = Object.assign(new Error('The DELETE statement conflicted with the REFERENCE constraint "FK_test".'), {
                  number: 547,
                });
                throw constraintErr;
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
        .delete('/api/assignments/DDI-ASN-ERR-01')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India');

      // sendDatabaseError classifies number 547 as CONSTRAINT_VIOLATION with HTTP 409
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Database Constraint Violation');
      expect(res.body.category).toBe('CONSTRAINT_VIOLATION');
    });

    it('returns HTTP 404 when Azure SQL DELETE query reports 0 rows affected (e.g. concurrent deletion)', async () => {
      const fakePool: any = {
        connected: true,
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM assignments')) {
                return {
                  recordset: [
                    {
                      id: 'b1c2d3e4-1234-5678-90ab-cdef12345678',
                      assignment_id_code: 'DDI-ASN-ZERO-01',
                      brand: 'Device Doctor India',
                    },
                  ],
                };
              }
              if (sqlText.includes('SELECT COUNT(1) as payCount')) {
                return { recordset: [{ payCount: 0 }] };
              }
              if (sqlText.includes('DELETE FROM assignments')) {
                // 0 rows affected (e.g. deleted concurrently)
                return { rowsAffected: [0] };
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
        .delete('/api/assignments/DDI-ASN-ZERO-01')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found or already deleted from Azure SQL');
    });

    it('successful Azure SQL deletion does not depend on mockStore cache deletion', async () => {
      const fakePool: any = {
        connected: true,
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM assignments')) {
                return {
                  recordset: [
                    {
                      id: 'f1e2d3c4-9876-5432-10fe-dcba09876543',
                      assignment_id_code: 'DDI-ASN-CACHE-01',
                      brand: 'Device Doctor India',
                    },
                  ],
                };
              }
              if (sqlText.includes('SELECT COUNT(1) as payCount')) {
                return { recordset: [{ payCount: 0 }] };
              }
              if (sqlText.includes('DELETE FROM assignments')) {
                return { rowsAffected: [1] };
              }
              return { recordset: [] };
            },
          };
          return req;
        },
      };

      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(fakePool);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Force mockStore.deleteAssignment to throw an unexpected error
      vi.spyOn(mockStore, 'deleteAssignment').mockImplementation(() => {
        throw new Error('Unexpected mockStore corruption error');
      });

      const res = await request(app)
        .delete('/api/assignments/DDI-ASN-CACHE-01')
        .set('Authorization', authHeader)
        .set('x-active-brand', 'Device Doctor India');

      // Crucial: SQL deletion succeeded, so response MUST be 200 success!
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe('DDI-ASN-CACHE-01');
    });
  });
});
