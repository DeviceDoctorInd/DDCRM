import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { isMockFallbackAllowed } from '../server/db/db.config';
import { mockStore } from '../server/db/mockStore';
import * as azureSqlModule from '../server/db/azureSql';

const app = createTestApp();

function createFailingPool(): any {
  return {
    request: () => {
      const req: any = {
        input: () => req,
        output: () => req,
        query: vi.fn().mockRejectedValue(new Error('Azure SQL query execution failed: Connection lost / Timeout')),
        execute: vi.fn().mockRejectedValue(new Error('Azure SQL query execution failed: Connection lost / Timeout')),
      };
      return req;
    },
  };
}

describe('Mock Fallback Policy & Production Safety Tests', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowFallback = process.env.ALLOW_MOCK_FALLBACK;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAllowFallback !== undefined) {
      process.env.ALLOW_MOCK_FALLBACK = originalAllowFallback;
    } else {
      delete process.env.ALLOW_MOCK_FALLBACK;
    }
  });

  describe('1. Centralized isMockFallbackAllowed() Policy Evaluation', () => {
    it('should ALWAYS return false in production, even if ALLOW_MOCK_FALLBACK=true', () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_MOCK_FALLBACK = 'true';
      expect(isMockFallbackAllowed()).toBe(false);
    });

    it('should return false in production when ALLOW_MOCK_FALLBACK is false or unset', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_MOCK_FALLBACK;
      expect(isMockFallbackAllowed()).toBe(false);

      process.env.ALLOW_MOCK_FALLBACK = 'false';
      expect(isMockFallbackAllowed()).toBe(false);
    });

    it('should return false in development by default (when ALLOW_MOCK_FALLBACK is unset or false)', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.ALLOW_MOCK_FALLBACK;
      expect(isMockFallbackAllowed()).toBe(false);

      process.env.ALLOW_MOCK_FALLBACK = 'false';
      expect(isMockFallbackAllowed()).toBe(false);
    });

    it('should return true in development only with explicit ALLOW_MOCK_FALLBACK=true', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_MOCK_FALLBACK = 'true';
      expect(isMockFallbackAllowed()).toBe(true);
    });

    it('should return true in test mode (NODE_ENV=test) for automated test compatibility', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.ALLOW_MOCK_FALLBACK;
      expect(isMockFallbackAllowed()).toBe(true);
    });
  });

  describe('2. Authentication Security when Azure SQL is Unavailable', () => {
    beforeEach(() => {
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('POST /api/auth/login must reject with HTTP 503 and NEVER authenticate against mockStore or issue JWT', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'rathorehemant114@gmail.com',
          password: 'Admin@2026',
        });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(res.body.message).toContain('Database connection is offline');
      expect(res.body.token).toBeUndefined();
      expect(res.body.user).toBeUndefined();
    });

    it('PUT /api/auth/update-credentials must reject with HTTP 503 when fallback is disabled', async () => {
      const res = await request(app)
        .put('/api/auth/update-credentials')
        .send({
          email: 'rathorehemant114@gmail.com',
          newPassword: 'NewSecurePassword@2026',
        });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(res.body.token).toBeUndefined();
    });

    it('GET /api/auth/me must reject with HTTP 503 when Azure SQL is unavailable and fallback disabled', async () => {
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(true);
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'rathorehemant114@gmail.com',
          password: 'Admin@2026',
        });
      const token = loginRes.body.token;

      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(503);
      expect(meRes.body.success).toBe(false);
      expect(meRes.body.error).toBe('Azure SQL Database Unavailable');
    });
  });

  describe('3. Production Fallback Disabled: CRUD & Mutation Blocking without RAM Pollution (Pool Null)', () => {
    let superAdminToken: string;

    beforeEach(async () => {
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(true);
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'devicedoctorindia.in@gmail.com',
          password: 'Admin@2026',
        });
      superAdminToken = loginRes.body.token;

      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('GET /api/clients must return HTTP 503 and NOT return mockStore clients', async () => {
      const res = await request(app)
        .get('/api/clients')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(Array.isArray(res.body)).toBe(false);
    });

    it('POST /api/clients must return HTTP 503 and MUST NOT mutate mockStore', async () => {
      const initialClientCount = mockStore.getClients().length;
      const testClientId = 'DDI-CL-PROD-TEST-UNSAFE';

      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          id: testClientId,
          name: 'Should Not Be Persisted Corp',
          brand: 'Device Doctor India',
        });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');

      const afterClientCount = mockStore.getClients().length;
      expect(afterClientCount).toBe(initialClientCount);
      const foundInMock = mockStore.getClients().find((c) => c.id === testClientId);
      expect(foundInMock).toBeUndefined();
    });

    it('POST /api/projects must return HTTP 503 and MUST NOT mutate mockStore', async () => {
      const initialProjectsCount = mockStore.getProjects().length;
      const testProjId = 'DDI-PRJ-UNSAFE-TEST-001';

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          id: testProjId,
          projectName: 'Unsaved Ghost Project',
          brand: 'Device Doctor India',
          clientId: 'CL-001',
          serviceId: 'SRV-001',
          totalAmount: 50000,
        });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');

      const afterProjectsCount = mockStore.getProjects().length;
      expect(afterProjectsCount).toBe(initialProjectsCount);
      const foundInMock = mockStore.getProjects().find((p) => p.id === testProjId);
      expect(foundInMock).toBeUndefined();
    });

    it('DELETE /api/clients/:id must return HTTP 503 and MUST NOT delete from mockStore', async () => {
      mockStore.saveClient({
        id: 'DDI-CL-PROTECTED',
        name: 'Protected Client',
        brand: 'Device Doctor India',
        preferredCurrency: 'INR',
        clientSince: '2026-01-01',
        status: 'Active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .delete('/api/clients/DDI-CL-PROTECTED')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');

      const clientStillExists = mockStore.getClientById('DDI-CL-PROTECTED');
      expect(clientStillExists).toBeDefined();
    });

    it('POST /api/db/clear-demo must return HTTP 503 when fallback is disabled', async () => {
      const res = await request(app)
        .post('/api/db/clear-demo')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
    });
  });

  describe('4. Input Validation & Authorization Errors Preserved (NOT converted to 503)', () => {
    let superAdminToken: string;

    beforeEach(async () => {
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(true);
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'devicedoctorindia.in@gmail.com',
          password: 'Admin@2026',
        });
      superAdminToken = loginRes.body.token;

      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('Unauthenticated requests without token must return 401, NOT 503', async () => {
      const res = await request(app).get('/api/clients');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('No authentication token provided');
    });

    it('Invalid client payload (missing name) must return 400 Bad Request, NOT 503', async () => {
      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          phone: '9876543210',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Client name is required');
    });
  });

  describe('5. Step 2B: Mutation Catch Blocks Return HTTP 503 on Azure SQL Failure (Zero RAM Fallback)', () => {
    let superAdminToken: string;

    beforeEach(async () => {
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(true);
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'devicedoctorindia.in@gmail.com',
          password: 'Admin@2026',
        });
      superAdminToken = loginRes.body.token;

      // Lock down fallback to simulate production
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);
      // Simulate connected pool that encounters query failure
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(createFailingPool());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('1. POST /api/categories catch block returns 503 and does NOT write to mockStore', async () => {
      const initialCount = mockStore.getCategories().length;
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Failing Category', code: 'FC-01' });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(mockStore.getCategories().length).toBe(initialCount);
    });

    it('2. POST /api/services catch block returns 503 and does NOT write to mockStore', async () => {
      const initialCount = mockStore.getServices().length;
      const res = await request(app)
        .post('/api/services')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Failing Service', categoryId: 'CAT-01', basePrice: 1500 });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(mockStore.getServices().length).toBe(initialCount);
    });

    it('3. POST /api/projects catch block returns 503 and does NOT write to mockStore', async () => {
      const initialCount = mockStore.getProjects().length;
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          id: 'PRJ-FAIL-01',
          projectName: 'Failing Project',
          brand: 'Device Doctor India',
          clientId: 'CL-001',
          serviceId: 'SRV-001',
          totalAmount: 12000,
        });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(mockStore.getProjects().length).toBe(initialCount);
    });

    it('4. POST /api/bank-accounts catch block returns 503 and does NOT write to mockStore', async () => {
      const initialCount = mockStore.getBankAccounts().length;
      const res = await request(app)
        .post('/api/bank-accounts')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          bankName: 'Failing Bank',
          accountNumber: '998877665544',
          ifscCode: 'FAIL0001234',
          branchName: 'Main',
        });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(mockStore.getBankAccounts().length).toBe(initialCount);
    });

    it('5. POST /api/gst-invoices/sync catch block returns 503 and does NOT write to mockStore', async () => {
      const res = await request(app)
        .post('/api/gst-invoices/sync')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ paymentId: 'PAY-FAIL-01' });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
    });

    it('6. POST /api/gst-invoices catch block returns 503 and does NOT write to mockStore', async () => {
      const initialCount = mockStore.getGstInvoices().length;
      const res = await request(app)
        .post('/api/gst-invoices')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          invoiceNumber: 'INV-FAIL-01',
          clientId: 'CL-001',
          projectId: 'PRJ-001',
          invoiceDate: '2026-03-01',
          subtotal: 10000,
          cgst: 900,
          sgst: 900,
          igst: 0,
          amount: 11800,
          totalAmount: 11800,
        });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(mockStore.getGstInvoices().length).toBe(initialCount);
    });

    it('7. POST /api/roles catch block returns 503 and does NOT write to mockStore', async () => {
      const initialCount = mockStore.getRoles().length;
      const res = await request(app)
        .post('/api/roles')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Failing Role', description: 'Testing catch block', permissions: ['read'] });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(mockStore.getRoles().length).toBe(initialCount);
    });

    it('8. POST /api/employees catch block returns 503 and does NOT write to mockStore', async () => {
      const initialCount = mockStore.getEmployees().length;
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Failing Employee', email: 'fail.emp@example.com', roleId: 'ROLE-01' });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(mockStore.getEmployees().length).toBe(initialCount);
    });

    it('9. POST /api/assignments catch block returns 503 and does NOT write to mockStore', async () => {
      const initialCount = mockStore.getAssignments().length;
      const res = await request(app)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ projectId: 'PRJ-001', employeeId: 'EMP-001', role: 'Support' });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(mockStore.getAssignments().length).toBe(initialCount);
    });

    it('10. POST /api/employee-payments catch block returns 503 and does NOT write to mockStore', async () => {
      const initialCount = mockStore.getEmployeePayments().length;
      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ employeeId: 'EMP-001', amount: 15000, paymentDate: '2026-03-01', paymentMethod: 'Bank Transfer' });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(mockStore.getEmployeePayments().length).toBe(initialCount);
    });

    it('11. POST /api/expense-categories catch block returns 503 and does NOT write to mockStore', async () => {
      const initialCount = mockStore.getExpenseCategories().length;
      const res = await request(app)
        .post('/api/expense-categories')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Failing Exp Category', description: 'Test' });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(mockStore.getExpenseCategories().length).toBe(initialCount);
    });

    it('12. POST /api/expenses catch block returns 503 and does NOT write to mockStore', async () => {
      const initialCount = mockStore.getExpenses().length;
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ title: 'Failing Expense', categoryId: 'EC-01', amount: 500, vendor: 'Office Supplies Inc', expenseDate: '2026-03-01' });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(mockStore.getExpenses().length).toBe(initialCount);
    });

    it('13. POST /api/db/clear-demo catch block returns 503 when SQL throws error', async () => {
      const res = await request(app)
        .post('/api/db/clear-demo')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
    });

    it('14. POST /api/audit catch block returns 503 when SQL throws error', async () => {
      const res = await request(app)
        .post('/api/audit')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ action: 'TEST_AUDIT', entityType: 'SYSTEM', details: 'Failing audit' });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
    });
  });

  describe('6. Step 2B: Unguarded Read Paths Fail Closed (HTTP 503 on pool null or SQL error)', () => {
    let superAdminToken: string;

    beforeEach(async () => {
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(true);
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'devicedoctorindia.in@gmail.com',
          password: 'Admin@2026',
        });
      superAdminToken = loginRes.body.token;

      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('GET /api/payments returns 503 when pool is null', async () => {
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(null);
      const res = await request(app)
        .get('/api/payments')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
    });

    it('GET /api/payments returns 503 when query execution throws', async () => {
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(createFailingPool());
      const res = await request(app)
        .get('/api/payments')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
    });

    it('GET /api/employee-payments returns 503 when pool is null', async () => {
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(null);
      const res = await request(app)
        .get('/api/employee-payments')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
    });

    it('GET /api/employee-payments returns 503 when query execution throws', async () => {
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(createFailingPool());
      const res = await request(app)
        .get('/api/employee-payments')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
    });

    it('GET /api/expense-categories returns 503 when pool is null', async () => {
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(null);
      const res = await request(app)
        .get('/api/expense-categories')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
    });

    it('GET /api/expense-categories returns 503 when query execution throws', async () => {
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(createFailingPool());
      const res = await request(app)
        .get('/api/expense-categories')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
    });

    it('GET /api/payments/:id/proof returns 503 when pool is null or query throws', async () => {
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(createFailingPool());
      const res = await request(app)
        .get('/api/payments/PAY-001/proof')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
    });

    it('GET /api/projects/:id/documents/proposal returns 503 when pool throws error', async () => {
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(createFailingPool());
      const res = await request(app)
        .get('/api/projects/PRJ-001/documents/proposal')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
    });
  });

  describe('7. Development Mode Explicit Opt-In', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('allows mock fallback in development when ALLOW_MOCK_FALLBACK=true', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_MOCK_FALLBACK = 'true';

      // Login succeeds against mock credentials when fallback allowed
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'devicedoctorindia.in@gmail.com',
          password: 'Admin@2026',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.token).toBeDefined();
    });
  });
});
