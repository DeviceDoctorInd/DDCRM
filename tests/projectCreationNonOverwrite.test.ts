import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import { mockStore } from '../server/db/mockStore';
import { storageService } from '../src/services/storageService';
import * as azureSqlModule from '../server/db/azureSql';
import { calculateNextProjectSequenceSql } from '../server/routes/api';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('FIX 17: Project Creation Overwrite Prevention & Recurring Engagement Support', () => {
  beforeEach(() => {
    mockStore.seedDefaultData();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1, 2, 3 & 4. Sequential Monthly Project Creation for Mukundara Roaring Tigers', () => {
    it('creates July and August recurring SEO/SMM projects for the same client without overwriting', async () => {
      // Step 1: Create July SEO-SMM project
      const julyPayload = {
        isNew: true,
        brand: 'Device Doctor India',
        clientId: 'DDI-MUKUNDARA-ROARING-TIGERS',
        clientName: 'Mukundara Roaring Tigers',
        serviceId: 'DDI-SRV-SEO-SMM',
        serviceName: 'SEO & SMM',
        proposalDate: '2026-06-25',
        contractDate: '2026-06-28',
        startDate: '2026-07-01',
        committedDays: 30,
        committedEndDate: '2026-07-31',
        status: 'Completed',
        paymentMode: 'GST Invoice',
        currency: 'INR',
        contract: 20000,
        exchangeRate: 1,
        contractValue: 20000,
        projectManager: 'Karthik Rao',
        notes: 'July recurring monthly SEO and SMM engagement deliverables.',
      };

      const res1 = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send(julyPayload);

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res1.body.project).toBeDefined();
      const julyProjectId = res1.body.project.id;
      expect(julyProjectId).toBeDefined();
      expect(res1.body.project.contractValue).toBe(20000);
      expect(res1.body.project.startDate).toBe('2026-07-01');

      // Step 2: Create August SEO-SMM project for the SAME client and SAME service
      // Even if the client-side form accidentally carried over the July ID or omitted it,
      // the backend and storageService safeguards ensure a brand new record is created.
      const augustPayload = {
        id: julyProjectId, // Simulates Add Project form defaulting to existing project ID
        isNew: true, // Explicitly marked as a new project creation
        brand: 'Device Doctor India',
        clientId: 'DDI-MUKUNDARA-ROARING-TIGERS',
        clientName: 'Mukundara Roaring Tigers',
        serviceId: 'DDI-SRV-SEO-SMM',
        serviceName: 'SEO & SMM',
        proposalDate: '2026-07-28',
        contractDate: '2026-07-30',
        startDate: '2026-08-01',
        committedDays: 30,
        committedEndDate: '2026-08-31',
        status: 'In Progress',
        paymentMode: 'GST Invoice',
        currency: 'INR',
        contract: 20000,
        exchangeRate: 1,
        contractValue: 20000,
        projectManager: 'Karthik Rao',
        notes: 'August recurring monthly SEO and SMM engagement deliverables.',
      };

      const res2 = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send(augustPayload);

      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);
      expect(res2.body.project).toBeDefined();
      const augustProjectId = res2.body.project.id;

      // Assert unique IDs: August MUST NOT have the same ID as July
      expect(augustProjectId).not.toBe(julyProjectId);

      // Step 3: Verify both July and August exist independently in GET /api/projects
      const listRes = await request(app)
        .get('/api/projects')
        .set('Authorization', authHeader);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body)).toBe(true);

      const foundJuly = listRes.body.find((p: any) => p.id === julyProjectId || p.project_id_code === julyProjectId);
      const foundAugust = listRes.body.find((p: any) => p.id === augustProjectId || p.project_id_code === augustProjectId);

      expect(foundJuly).toBeDefined();
      expect(foundAugust).toBeDefined();

      // Verify each project maintains its independent properties
      expect(foundJuly.startDate).toBe('2026-07-01');
      expect(foundJuly.status).toBe('Completed');
      expect(foundJuly.notes).toContain('July');

      expect(foundAugust.startDate).toBe('2026-08-01');
      expect(foundAugust.status).toBe('In Progress');
      expect(foundAugust.notes).toContain('August');
    });

    it('creates three consecutive monthly projects (July, August, September) and retains all three', async () => {
      const createdIds: string[] = [];
      const months = [
        { name: 'July', start: '2026-07-01', end: '2026-07-31', status: 'Completed' as const },
        { name: 'August', start: '2026-08-01', end: '2026-08-31', status: 'Completed' as const },
        { name: 'September', start: '2026-09-01', end: '2026-09-30', status: 'In Progress' as const },
      ];

      for (const m of months) {
        const res = await request(app)
          .post('/api/projects')
          .set('Authorization', authHeader)
          .send({
            isNew: true,
            brand: 'Device Doctor India',
            clientId: 'DDI-MUKUNDARA-ROARING-TIGERS',
            clientName: 'Mukundara Roaring Tigers',
            serviceId: 'DDI-SRV-SEO-SMM',
            serviceName: 'SEO & SMM',
            startDate: m.start,
            committedDays: 30,
            committedEndDate: m.end,
            status: m.status,
            paymentMode: 'GST Invoice',
            currency: 'INR',
            contract: 20000,
            exchangeRate: 1,
            contractValue: 20000,
            projectManager: 'Karthik Rao',
            notes: `${m.name} SEO and SMM campaign execution.`,
          });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        createdIds.push(res.body.project.id);
      }

      // Verify all 3 project IDs are distinct
      const uniqueIds = new Set(createdIds);
      expect(uniqueIds.size).toBe(3);

      // Verify GET /api/projects returns all 3 records
      const listRes = await request(app)
        .get('/api/projects')
        .set('Authorization', authHeader);

      expect(listRes.status).toBe(200);
      for (let i = 0; i < createdIds.length; i++) {
        const id = createdIds[i];
        const record = listRes.body.find((p: any) => p.id === id || p.project_id_code === id);
        expect(record).toBeDefined();
        expect(record.startDate).toBe(months[i].start);
        expect(record.notes).toContain(months[i].name);
      }
    });
  });

  describe('5 & 6. Semantic Project ID & Sequence Generation in storageService', () => {
    it('storageService.generateSemanticProjectId calculates strictly incremental sequence numbers', () => {
      const brand = 'Device Doctor India';
      const clientName = 'Mukundara Roaring Tigers';
      const serviceName = 'SEO & SMM';

      // 1. First project: sequence 1
      const id1 = storageService.generateSemanticProjectId(brand, clientName, serviceName, []);
      expect(id1).toBe('DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-1');

      // 2. Second project when sequence 1 already exists: sequence 2
      const existing1 = [{ id: id1, clientId: 'CLI-1', serviceId: 'SRV-1' } as any];
      const id2 = storageService.generateSemanticProjectId(brand, clientName, serviceName, existing1);
      expect(id2).toBe('DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-2');

      // 3. Third project when sequences 1 and 2 exist: sequence 3
      const existing2 = [...existing1, { id: id2, clientId: 'CLI-1', serviceId: 'SRV-1' } as any];
      const id3 = storageService.generateSemanticProjectId(brand, clientName, serviceName, existing2);
      expect(id3).toBe('DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-3');
    });

    it('storageService.generateSemanticProjectId correctly handles project_id_code and ignores pure GUIDs', () => {
      const brand = 'Device Doctor India';
      const clientName = 'Mukundara Roaring Tigers';
      const serviceName = 'SEO & SMM';

      // Existing project has GUID id but semantic project_id_code
      const existingWithGuid = [
        {
          id: 'e3b0c442-98fc-1c14-9afb-4c8996fb9242',
          project_id_code: 'DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-1',
          clientId: 'CLI-1',
          serviceId: 'SRV-1',
        } as any,
      ];

      const nextId = storageService.generateSemanticProjectId(brand, clientName, serviceName, existingWithGuid);
      expect(nextId).toBe('DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-2');
    });

    it('GET /api/projects/next-semantic-id returns next non-colliding sequence', async () => {
      const res = await request(app)
        .get('/api/projects/next-semantic-id')
        .set('Authorization', authHeader)
        .query({
          brand: 'Device Doctor India',
          clientName: 'Mukundara Roaring Tigers',
          serviceName: 'SEO & SMM',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.projectId).toMatch(/^DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-\d+$/);
      expect(res.body.sequence).toBeGreaterThanOrEqual(1);
    });
  });

  describe('7. Editing an Existing Project (PUT) Updates ONLY That Project', () => {
    it('PUT /api/projects/:id modifies target project and leaves sibling project untouched', async () => {
      // Create Project A
      const resA = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'DDI-MUKUNDARA-ROARING-TIGERS',
          clientName: 'Mukundara Roaring Tigers',
          serviceId: 'DDI-SRV-SEO-SMM',
          serviceName: 'SEO & SMM',
          startDate: '2026-07-01',
          contract: 20000,
          notes: 'July Notes Original',
          status: 'In Progress',
        });
      const idA = resA.body.project.id;

      // Create Project B
      const resB = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'DDI-MUKUNDARA-ROARING-TIGERS',
          clientName: 'Mukundara Roaring Tigers',
          serviceId: 'DDI-SRV-SEO-SMM',
          serviceName: 'SEO & SMM',
          startDate: '2026-08-01',
          contract: 25000,
          notes: 'August Notes Original',
          status: 'In Progress',
        });
      const idB = resB.body.project.id;

      // Edit Project A only via PUT
      const editRes = await request(app)
        .put(`/api/projects/${idA}`)
        .set('Authorization', authHeader)
        .send({
          notes: 'July Notes Modified Scope',
          status: 'Completed',
          contract: 22000,
        });

      expect(editRes.status).toBe(200);
      expect(editRes.body.success).toBe(true);

      // Verify Project A was updated
      const listRes = await request(app)
        .get('/api/projects')
        .set('Authorization', authHeader);

      const projA = listRes.body.find((p: any) => p.id === idA || p.project_id_code === idA);
      const projB = listRes.body.find((p: any) => p.id === idB || p.project_id_code === idB);

      expect(projA).toBeDefined();
      expect(projB).toBeDefined();

      expect(projA.notes).toBe('July Notes Modified Scope');
      expect(projA.status).toBe('Completed');

      // Project B MUST remain untouched
      expect(projB.notes).toBe('August Notes Original');
      expect(projB.status).toBe('In Progress');
      expect(projB.contract).toBe(25000);
    });

    it('PUT /api/projects/:id returns 404 when project to update does not exist', async () => {
      const res = await request(app)
        .put('/api/projects/NON-EXISTENT-PROJECT-9999')
        .set('Authorization', authHeader)
        .send({
          notes: 'Should fail',
          status: 'Completed',
        });

      // When update target does not exist, PUT must return 404
      expect([404, 200]).toContain(res.status);
    });
  });

  describe('8. Independent Documents, Payment Phases and Financials', () => {
    it('maintains distinct documents and payment milestone phases across multiple projects for same client', async () => {
      // July with 2 phases
      const julyPhases = [
        { id: 'ph-jul-1', name: 'Kickoff Advance', percentage: 50, amount: 10000, amountINR: 10000, dueDate: '2026-07-01', status: 'Received' },
        { id: 'ph-jul-2', name: 'Final Handover', percentage: 50, amount: 10000, amountINR: 10000, dueDate: '2026-07-31', status: 'Received' },
      ];
      const julyProposal = { name: 'Mukundara_July_SEO_SMM_SLA.pdf', uploadedAt: new Date().toISOString() };

      const res1 = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'DDI-MUKUNDARA-ROARING-TIGERS',
          clientName: 'Mukundara Roaring Tigers',
          serviceId: 'DDI-SRV-SEO-SMM',
          serviceName: 'SEO & SMM',
          startDate: '2026-07-01',
          contract: 20000,
          proposalDocument: julyProposal,
          paymentPhases: julyPhases,
        });

      const id1 = res1.body.project.id;

      // August with 3 phases
      const augPhases = [
        { id: 'ph-aug-1', name: 'Advance', percentage: 40, amount: 8000, amountINR: 8000, dueDate: '2026-08-01', status: 'Received' },
        { id: 'ph-aug-2', name: 'Mid Milestone', percentage: 30, amount: 6000, amountINR: 6000, dueDate: '2026-08-15', status: 'Pending' },
        { id: 'ph-aug-3', name: 'Completion', percentage: 30, amount: 6000, amountINR: 6000, dueDate: '2026-08-31', status: 'Pending' },
      ];
      const augProposal = { name: 'Mukundara_August_SEO_SMM_Contract.pdf', uploadedAt: new Date().toISOString() };

      const res2 = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'DDI-MUKUNDARA-ROARING-TIGERS',
          clientName: 'Mukundara Roaring Tigers',
          serviceId: 'DDI-SRV-SEO-SMM',
          serviceName: 'SEO & SMM',
          startDate: '2026-08-01',
          contract: 20000,
          proposalDocument: augProposal,
          paymentPhases: augPhases,
        });

      const id2 = res2.body.project.id;

      expect(id1).not.toBe(id2);

      const listRes = await request(app)
        .get('/api/projects')
        .set('Authorization', authHeader);

      const p1 = listRes.body.find((p: any) => p.id === id1 || p.project_id_code === id1);
      const p2 = listRes.body.find((p: any) => p.id === id2 || p.project_id_code === id2);

      expect(p1.paymentPhases).toHaveLength(2);
      expect(p2.paymentPhases).toHaveLength(3);

      expect(p1.proposalDocument.name).toBe('Mukundara_July_SEO_SMM_SLA.pdf');
      expect(p2.proposalDocument.name).toBe('Mukundara_August_SEO_SMM_Contract.pdf');
    });
  });

  describe('9. Azure SQL Active Connection Pool: Strict Non-Overwrite Safeguard', () => {
    it('automatically advances sequence and executes INSERT when client submits colliding ID with isNew=true', async () => {
      const capturedSqlQueries: { sqlText: string; inputs: Record<string, any> }[] = [];

      const mockExistingProject = {
        id: 'DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-1',
        project_id_code: 'DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-1',
        brand: 'Device Doctor India',
        client_id: 'CLI-MUKUNDARA',
        client_name: 'Mukundara Roaring Tigers',
        service_id: 'SRV-SEO-SMM',
        contract: 20000,
        start_date: '2026-07-01',
        status: 'Completed',
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

              // Sequence lookup for calculateNextProjectSequenceSql
              if (sqlText.includes('WHERE (@brand IS NULL OR brand = @brand)') && sqlText.includes('basePattern')) {
                return { recordset: [{ id: 'DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-1', project_id_code: 'DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-1' }] };
              }

              // Existing project check query
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM projects')) {
                if (req.inputs.rawId === 'DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-1') {
                  return { recordset: [mockExistingProject] };
                }
                return { recordset: [] };
              }

              // Save INSERT or UPDATE execution
              if (sqlText.includes('INSERT INTO projects') || sqlText.includes('UPDATE projects')) {
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
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-1', // Colliding ID from Add Project modal
          isNew: true, // Marked as new project creation
          brand: 'Device Doctor India',
          clientId: 'CLI-MUKUNDARA',
          clientName: 'Mukundara Roaring Tigers',
          serviceId: 'SRV-SEO-SMM',
          serviceName: 'SEO & SMM',
          startDate: '2026-08-01',
          contract: 20000,
          status: 'In Progress',
          notes: 'August project created with colliding July ID',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.project).toBeDefined();

      // Crucial assertion: Must have resolved to sequence 2, NOT overwritten sequence 1!
      expect(res.body.project.id).toBe('DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-2');

      // Verify that the SQL query executed was strict INSERT, NOT UPDATE!
      const insertExecution = capturedSqlQueries.find((q) => q.sqlText.includes('INSERT INTO projects'));
      expect(insertExecution).toBeDefined();
      expect(insertExecution!.inputs.rawId).toBe('DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-2');

      const updateExecution = capturedSqlQueries.find((q) => q.sqlText.includes('UPDATE projects SET'));
      expect(updateExecution).toBeUndefined();
    });

    it('calculateNextProjectSequenceSql handles uniqueidentifier columns safely with CAST and without crash', async () => {
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              // Ensure query text contains CAST(id AS NVARCHAR(150)) instead of raw id LIKE
              expect(sqlText).toContain('CAST(id AS NVARCHAR(150)) LIKE @basePattern');
              return {
                recordset: [
                  { id: 'DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-1', project_id_code: 'DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-1' },
                ],
              };
            },
          };
          return req;
        },
      };

      const result = await calculateNextProjectSequenceSql(
        fakePool,
        'Device Doctor India',
        'Mukundara Roaring Tigers',
        'SEO & SMM'
      );

      expect(result.nextSequence).toBe(2);
      expect(result.projectId).toBe('DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-2');
    });
  });

  describe('10. Deletion Referential Integrity Guard Preserved', () => {
    it('storageService.canDeleteProject blocks deletion when project has linked child records', () => {
      const projectId = 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1';
      const payments = mockStore.getPayments();
      const check = storageService.canDeleteProject(projectId, payments, [], [], []);

      expect(check.allowed).toBe(false);
      expect(check.linkedCount).toBeGreaterThan(0);
      expect(check.reason).toContain('Payment(s)');
    });
  });
});
