import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('Employees Module - CRUD & Input Validation Tests', () => {
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
});
