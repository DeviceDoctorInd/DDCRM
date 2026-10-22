import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('Projects Module - CRUD & Input Validation Tests', () => {
  describe('Normal CRUD Operations', () => {
    let createdProjectId = '';

    it('should read (GET) all projects list successfully', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('contract');
    });

    it('should create (POST) a new valid project', async () => {
      const payload = {
        brand: 'Device Doctor India',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
        clientName: 'TechCorp Infotech Pvt Ltd',
        serviceId: 'DDI-SRV-001',
        proposalDate: '2026-01-10',
        contractDate: '2026-01-15',
        startDate: '2026-01-20',
        committedDays: 60,
        committedEndDate: '2026-03-20',
        status: 'In Progress',
        paymentMode: 'GST Invoice',
        currency: 'INR',
        contract: 200000,
        exchangeRate: 1,
        contractValue: 200000,
        totalReceived: 0,
        balance: 200000,
        projectManager: 'Karthik Rao',
      };

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.project).toBeDefined();
      expect(res.body.project.contract).toBe(200000);
      expect(res.body.project.id).toBeDefined();
      createdProjectId = res.body.project.id;
    });

    it('should update (PUT) an existing project', async () => {
      const updatePayload = {
        notes: 'Updated project scope & milestone notes',
        status: 'Completed',
      };

      const res = await request(app)
        .put(`/api/projects/${createdProjectId}`)
        .set('Authorization', authHeader)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.project.status).toBe('Completed');
      expect(res.body.project.notes).toBe('Updated project scope & milestone notes');
    });

    it('should delete (DELETE) the project', async () => {
      const res = await request(app)
        .delete(`/api/projects/${createdProjectId}`)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe(createdProjectId);
    });
  });

  describe('Galat Input & Validation Handling', () => {
    it('should reject project creation with negative contract amount (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          clientName: 'TechCorp Infotech Pvt Ltd',
          contract: -75000, // Invalid negative contract amount
          currency: 'INR',
          startDate: '2026-01-01',
        });

      // API should reject negative monetary amounts
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject project creation with invalid start date (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          clientName: 'TechCorp Infotech Pvt Ltd',
          contract: 100000,
          currency: 'INR',
          startDate: 'not-a-valid-date-string', // Invalid date format
        });

      // API should reject invalid date string
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject project creation with missing client identity (expect 400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          contract: 50000,
          currency: 'INR',
          // Missing both clientId and clientName
        });

      // API should enforce mandatory client linkage
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
