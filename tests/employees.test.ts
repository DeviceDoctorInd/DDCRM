import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import { storageService } from '../src/services/storageService';
import { calculateNextEmployeeIdSql } from '../server/routes/api';
import * as azureSqlModule from '../server/db/azureSql';
import { mockStore } from '../server/db/mockStore';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('Employees Module - CRUD & Input Validation Tests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Normal CRUD Operations', () => {
    let createdEmployeeId = '';

    it('should read (GET) all employees list successfully', async () => {
      const res = await request(app)
        .get('/api/employees')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name');
    });

    it('should create (POST) a new valid employee record', async () => {
      const payload = {
        brand: 'Device Doctor India',
        name: 'Karan Mehra',
        roleId: 'DDI-ROL-001',
        email: 'karan.m@devicedoctor.in',
        status: 'Active',
        joiningDate: '2026-01-15',
        costOfEmployee: 70000,
        employeeType: 'Salary Basis',
        comesUnderTds: 'Yes',
        notes: 'Enterprise server hardware technician',
      };

      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.employee).toBeDefined();
      expect(res.body.employee.name).toBe('Karan Mehra');
      expect(res.body.employee.id).toBeDefined();
      createdEmployeeId = res.body.employee.id;
    });

    it('should update (PUT) an existing employee', async () => {
      const updatePayload = {
        costOfEmployee: 75000,
        notes: 'Promoted to senior tier server specialist',
      };

      const res = await request(app)
        .put(`/api/employees/${createdEmployeeId}`)
        .set('Authorization', authHeader)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.employee.costOfEmployee).toBe(75000);
    });

    it('should delete (DELETE) the employee', async () => {
      const res = await request(app)
        .delete(`/api/employees/${createdEmployeeId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe(createdEmployeeId);
    });
  });

  describe('Galat Input & Validation Handling', () => {
    it('should reject employee with negative costOfEmployee (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          name: 'Negative Salary Employee',
          costOfEmployee: -45000, // Invalid negative compensation
          email: 'invalid.cost@ddcrm.in',
        });

      // API should reject negative compensation
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject employee with invalid joining date (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          name: 'Bad Date Employee',
          joiningDate: 'not-a-valid-date-31-02', // Invalid date
          costOfEmployee: 50000,
        });

      // API should reject invalid date
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject employee with missing required name field (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          costOfEmployee: 50000,
          // Missing name
        });

      // API should require employee name
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Step 8 Regression Tests: Multiple Employee Creation & ID Sequence Management', () => {
    describe('1. Frontend ID Generator (storageService.generateId)', () => {
      it('generates DDI-EMP-001 when employee list is empty', () => {
        const nextId = storageService.generateId('EMP', 'Device Doctor India', []);
        expect(nextId).toBe('DDI-EMP-001');
      });

      it('generates distinct next ID DDI-EMP-002 after DDI-EMP-001 exists in collection', () => {
        const existing = [{ id: 'DDI-EMP-001', brand: 'Device Doctor India' as const }];
        const nextId = storageService.generateId('EMP', 'Device Doctor India', existing);
        expect(nextId).toBe('DDI-EMP-002');
      });

      it('generates distinct next ID DDI-EMP-003 after DDI-EMP-001 and DDI-EMP-002 exist', () => {
        const existing = [
          { id: 'DDI-EMP-001', brand: 'Device Doctor India' as const },
          { id: 'DDI-EMP-002', brand: 'Device Doctor India' as const },
        ];
        const nextId = storageService.generateId('EMP', 'Device Doctor India', existing);
        expect(nextId).toBe('DDI-EMP-003');
      });

      it('correctly increments past non-contiguous sequence numbers without collision', () => {
        const existing = [
          { id: 'DDI-EMP-001', brand: 'Device Doctor India' as const },
          { id: 'DDI-EMP-005', brand: 'Device Doctor India' as const },
        ];
        const nextId = storageService.generateId('EMP', 'Device Doctor India', existing);
        expect(nextId).toBe('DDI-EMP-006');
      });

      it('maintains brand isolation in employee ID generation prefixes', () => {
        const ddiId = storageService.generateId('EMP', 'Device Doctor India', []);
        const fxlId = storageService.generateId('EMP', 'FX Launch Pad', []);
        const cdsId = storageService.generateId('EMP', 'Codestro', []);

        expect(ddiId).toBe('DDI-EMP-001');
        expect(fxlId).toBe('FXL-EMP-001');
        expect(cdsId).toBe('CDS-EMP-001');
      });
    });

    describe('2. Multi-Employee Creation & Separation of POST vs PUT', () => {
      it('creating two consecutive employees produces two distinct sequential records', async () => {
        const emp1Payload = {
          brand: 'Device Doctor India',
          name: 'Rohit Sharma',
          roleId: 'DDI-ROL-001',
          email: 'rohit.s@devicedoctor.in',
          status: 'Active',
          costOfEmployee: 60000,
        };

        const res1 = await request(app)
          .post('/api/employees')
          .set('Authorization', authHeader)
          .send(emp1Payload);

        expect(res1.status).toBe(200);
        expect(res1.body.success).toBe(true);
        const emp1Id = res1.body.employee.id;
        expect(emp1Id).toBeDefined();

        const emp2Payload = {
          brand: 'Device Doctor India',
          name: 'Pooja Verma',
          roleId: 'DDI-ROL-001',
          email: 'pooja.v@devicedoctor.in',
          status: 'Active',
          costOfEmployee: 62000,
        };

        const res2 = await request(app)
          .post('/api/employees')
          .set('Authorization', authHeader)
          .send(emp2Payload);

        expect(res2.status).toBe(200);
        expect(res2.body.success).toBe(true);
        const emp2Id = res2.body.employee.id;
        expect(emp2Id).toBeDefined();

        // Must be two distinct sequential records
        expect(emp1Id).not.toBe(emp2Id);

        // Verify both employees exist simultaneously in GET /api/employees
        const listRes = await request(app)
          .get('/api/employees')
          .set('Authorization', authHeader);

        expect(listRes.status).toBe(200);
        const ids = listRes.body.map((e: any) => e.id);
        expect(ids).toContain(emp1Id);
        expect(ids).toContain(emp2Id);
      });

      it('POST with an already-existing employee ID returns 409 Conflict and does NOT overwrite original', async () => {
        // Retrieve existing employee
        const initialRes = await request(app)
          .get('/api/employees')
          .set('Authorization', authHeader);
        const originalEmp = initialRes.body[0];
        expect(originalEmp).toBeDefined();
        const existingId = originalEmp.id;
        const originalName = originalEmp.name;

        // Attempt to POST with existing ID
        const conflictingPayload = {
          id: existingId,
          brand: 'Device Doctor India',
          name: 'Imposter Employee Overwrite Attempt',
          roleId: 'DDI-ROL-001',
          email: 'imposter@devicedoctor.in',
          costOfEmployee: 999999,
        };

        const conflictRes = await request(app)
          .post('/api/employees')
          .set('Authorization', authHeader)
          .send(conflictingPayload);

        expect(conflictRes.status).toBe(409);
        expect(conflictRes.body.success).toBe(false);
        expect(conflictRes.body.error).toContain('already exists');

        // Confirm original employee was NOT mutated
        const verifyRes = await request(app)
          .get('/api/employees')
          .set('Authorization', authHeader);
        const currentEmp = verifyRes.body.find((e: any) => e.id === existingId);
        expect(currentEmp.name).toBe(originalName);
        expect(currentEmp.name).not.toBe('Imposter Employee Overwrite Attempt');
      });

      it('PUT with an existing employee ID updates the employee successfully', async () => {
        const updatePayload = {
          name: 'Amit Trivedi - Senior Lead',
          costOfEmployee: 85000,
          notes: 'Promoted to Technical Lead',
        };

        const res = await request(app)
          .put('/api/employees/DDI-EMP-001')
          .set('Authorization', authHeader)
          .send(updatePayload);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.employee.id).toBe('DDI-EMP-001');
        expect(res.body.employee.name).toBe('Amit Trivedi - Senior Lead');
        expect(res.body.employee.costOfEmployee).toBe(85000);
      });

      it('PUT with a non-existent employee ID returns 404 Not Found', async () => {
        const res = await request(app)
          .put('/api/employees/DDI-EMP-999')
          .set('Authorization', authHeader)
          .send({ name: 'Ghost Employee', costOfEmployee: 50000 });

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('not found');
      });
    });

    describe('3. SQL-Backed Sequence Helper (calculateNextEmployeeIdSql)', () => {
      it('calculates next ID based on SQL database rows when pool is active and fallback disabled', async () => {
        const fakePool: any = {
          request: () => {
            const req: any = {
              input: () => req,
              query: vi.fn().mockResolvedValue({
                recordset: [
                  { id: 'DDI-EMP-001' },
                  { id: 'DDI-EMP-002' },
                ],
              }),
            };
            return req;
          },
        };

        // In production mode (fallback disabled), ID is derived strictly from SQL rows
        vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

        const nextId = await calculateNextEmployeeIdSql(fakePool, 'Device Doctor India');
        expect(nextId).toBe('DDI-EMP-003');
      });

      it('fails closed and throws error when SQL query fails and mock fallback is disallowed', async () => {
        const failingPool: any = {
          request: () => {
            const req: any = {
              input: () => req,
              query: vi.fn().mockRejectedValue(new Error('Connection lost to Azure SQL')),
            };
            return req;
          },
        };

        vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

        await expect(
          calculateNextEmployeeIdSql(failingPool, 'Device Doctor India')
        ).rejects.toThrow('Azure SQL employee ID calculation failure');
      });

      it('fails closed when pool is null and mock fallback is disallowed', async () => {
        vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

        await expect(
          calculateNextEmployeeIdSql(null, 'Device Doctor India')
        ).rejects.toThrow('Azure SQL Database is offline. Cannot calculate employee ID.');
      });
    });

    describe('4. Fail-Closed Production Safety (No Mock Mutation on Failure)', () => {
      it('POST /api/employees returns 503 and does not mutate mockStore when pool throws and fallback is disabled', async () => {
        const failingPool: any = {
          request: () => {
            const req: any = {
              input: () => req,
              output: () => req,
              query: vi.fn().mockRejectedValue(new Error('Azure SQL connection timeout')),
            };
            return req;
          },
        };

        vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(failingPool);
        vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

        const initialCount = mockStore.getEmployees().length;

        const res = await request(app)
          .post('/api/employees')
          .set('Authorization', authHeader)
          .send({
            brand: 'Device Doctor India',
            name: 'Unpersisted Candidate',
            costOfEmployee: 50000,
          });

        expect(res.status).toBe(503);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe('Azure SQL Database Unavailable');
        // Ensure mockStore was NOT mutated
        expect(mockStore.getEmployees().length).toBe(initialCount);
      });
    });
  });
});
