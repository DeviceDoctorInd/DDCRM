import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import { mockStore } from '../server/db/mockStore';
import * as azureSqlModule from '../server/db/azureSql';
import { storageService } from '../src/services/storageService';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('FIX 18: Project Update API Identifier Mismatch Resolution', () => {
  const mukundraSemanticCode = 'DDI-MUKUNDRA-ROARING-TIGERS-SEO-SMM-1';
  const mukundraDbGuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  beforeEach(() => {
    mockStore.seedDefaultData();
    mockStore.saveProject({
      id: mukundraSemanticCode,
      guid: mukundraDbGuid,
      projectCode: mukundraSemanticCode,
      project_id_code: mukundraSemanticCode,
      brand: 'Device Doctor India',
      clientId: 'CLI-MUKUNDRA',
      clientName: 'Mukundara Roaring Tigers',
      serviceId: 'SRV-SEO-SMM',
      proposalDate: '2026-06-25',
      contractDate: '2026-06-28',
      startDate: '2026-07-01',
      committedDays: 30,
      committedEndDate: '2026-07-31',
      status: 'In Progress',
      paymentMode: 'GST Invoice',
      currency: 'INR',
      contract: 20000,
      exchangeRate: 1,
      contractValue: 20000,
      totalReceived: 0,
      balance: 20000,
      projectManager: 'Karthik Rao',
      notes: 'Initial monthly SEO & SMM project.',
      paymentPhases: [
        { id: 'phase-1', name: 'Phase 1 - Advance', percentage: 50, amount: 10000, amountINR: 10000, dueDate: '2026-07-05', status: 'Pending' },
        { id: 'phase-2', name: 'Phase 2 - Completion', percentage: 50, amount: 10000, amountINR: 10000, dueDate: '2026-07-31', status: 'Pending' },
      ],
      createdAt: '2026-06-25T00:00:00.000Z',
      updatedAt: '2026-06-28T00:00:00.000Z',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Update an existing project using its GUID
  it('1. updates an existing project using its database primary key GUID', async () => {
    const existingGuid = 'c3a4f6d8-1122-3344-5566-778899aabbcc';
    const projectCode = 'DDI-GUID-TEST-PROJECT-1';

    // Seed test project with GUID primary key and semantic project code
    mockStore.saveProject({
      id: existingGuid,
      guid: existingGuid,
      projectCode: projectCode,
      project_id_code: projectCode,
      brand: 'Device Doctor India',
      clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
      clientName: 'TechCorp Infotech Pvt Ltd',
      serviceId: 'DDI-SRV-001',
      proposalDate: '2026-02-01',
      contractDate: '2026-02-05',
      startDate: '2026-02-10',
      committedDays: 45,
      committedEndDate: '2026-03-27',
      status: 'In Progress',
      paymentMode: 'GST Invoice',
      currency: 'INR',
      contract: 100000,
      exchangeRate: 1,
      contractValue: 100000,
      totalReceived: 0,
      balance: 100000,
      projectManager: 'Karthik Rao',
      notes: 'Initial GUID test project.',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-05T00:00:00.000Z',
    });

    const updatePayload = {
      id: projectCode,
      guid: existingGuid,
      projectCode: projectCode,
      status: 'Completed',
      notes: 'Updated successfully via GUID primary key route.',
      isUpdate: true,
    };

    const res = await request(app)
      .put(`/api/projects/${existingGuid}`)
      .set('Authorization', authHeader)
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.project).toBeDefined();
    expect(res.body.project.status).toBe('Completed');
    expect(res.body.project.notes).toBe('Updated successfully via GUID primary key route.');
    expect(res.body.project.guid).toBe(existingGuid);
  });

  // 2. Update an existing project using its supported legacy identifier
  it('2. updates an existing project using its supported legacy identifier', async () => {
    const legacyId = 'PRJ-LEGACY-001';

    mockStore.saveProject({
      id: legacyId,
      guid: legacyId,
      projectCode: legacyId,
      project_id_code: legacyId,
      brand: 'Device Doctor India',
      clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
      clientName: 'TechCorp Infotech Pvt Ltd',
      serviceId: 'DDI-SRV-001',
      proposalDate: '2025-10-01',
      contractDate: '2025-10-05',
      startDate: '2025-10-10',
      committedDays: 30,
      committedEndDate: '2025-11-10',
      status: 'In Progress',
      paymentMode: 'GST Invoice',
      currency: 'INR',
      contract: 50000,
      exchangeRate: 1,
      contractValue: 50000,
      totalReceived: 0,
      balance: 50000,
      projectManager: 'Karthik Rao',
      notes: 'Legacy project record.',
      createdAt: '2025-10-01T00:00:00.000Z',
      updatedAt: '2025-10-05T00:00:00.000Z',
    });

    const updatePayload = {
      id: legacyId,
      status: 'On Hold',
      notes: 'Updated via legacy identifier route.',
      isUpdate: true,
    };

    const res = await request(app)
      .put(`/api/projects/${legacyId}`)
      .set('Authorization', authHeader)
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.project.id).toBe(legacyId);
    expect(res.body.project.status).toBe('On Hold');
    expect(res.body.project.notes).toBe('Updated via legacy identifier route.');
  });

  // 3. Update the Mukundra project with semantic code DDI-MUKUNDRA-ROARING-TIGERS-SEO-SMM-1
  // and verify SQL UNIQUEIDENTIFIER safety
  it('3. updates the Mukundra project with semantic code DDI-MUKUNDRA-ROARING-TIGERS-SEO-SMM-1 in Azure SQL mode without conversion error', async () => {
    const mukundraSemanticCode = 'DDI-MUKUNDRA-ROARING-TIGERS-SEO-SMM-1';
    const mukundraDbGuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    const capturedSqlQueries: { sqlText: string; inputs: Record<string, any> }[] = [];

    const mockDbRow = {
      id: mukundraDbGuid,
      project_id_code: mukundraSemanticCode,
      brand: 'Device Doctor India',
      client_id: 'CLI-MUKUNDRA',
      client_name: 'Mukundara Roaring Tigers',
      service_id: 'SRV-SEO-SMM',
      proposal_date: '2026-06-25',
      contract_date: '2026-06-28',
      start_date: '2026-07-01',
      committed_days: 30,
      committed_end_date: '2026-07-31',
      actual_end_date: '',
      status: 'In Progress',
      payment_mode: 'GST Invoice',
      currency: 'INR',
      contract: 20000,
      exchange_rate: 1,
      contract_value: 20000,
      total_received: 0,
      balance: 20000,
      project_manager: 'Karthik Rao',
      notes: 'Initial monthly SEO & SMM project.',
      proposal_document: null,
      contract_document: null,
      payment_phases: JSON.stringify([
        { id: 'phase-1', name: 'Phase 1 - Advance', percentage: 50, amount: 10000, amountINR: 10000, status: 'Pending' },
        { id: 'phase-2', name: 'Phase 2 - Completion', percentage: 50, amount: 10000, amountINR: 10000, status: 'Pending' },
      ]),
      created_at: '2026-06-28T10:00:00.000Z',
      updated_at: '2026-06-28T10:00:00.000Z',
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

            // Simulate Azure SQL UNIQUEIDENTIFIER conversion failure if WHERE id = @id without CAST
            // when comparing string literal against UNIQUEIDENTIFIER column
            if (sqlText.includes('WHERE id = @') && !sqlText.includes('CAST(id AS NVARCHAR')) {
              throw new Error('Conversion failed when converting from a character string to uniqueidentifier.');
            }

            // Project lookup by semantic ID or GUID
            if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM projects')) {
              const matchesCleanId = req.inputs.cleanId === mukundraSemanticCode || req.inputs.rawId === mukundraSemanticCode;
              const matchesBodyCode = req.inputs.bodyCode === mukundraSemanticCode;
              const matchesGuid = req.inputs.guidCandidate === mukundraDbGuid || req.inputs.cleanId === mukundraDbGuid;

              if (matchesCleanId || matchesBodyCode || matchesGuid) {
                return { recordset: [mockDbRow] };
              }
              return { recordset: [] };
            }

            // UPDATE projects query
            if (sqlText.includes('UPDATE projects SET')) {
              return { recordset: [], rowsAffected: [1] };
            }

            return { recordset: [] };
          },
        };
        return req;
      },
    };

    vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(fakePool);
    vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

    // Call PUT /api/projects/:id passing semantic code (exactly as Edit Project modal did)
    const res = await request(app)
      .put(`/api/projects/${mukundraSemanticCode}`)
      .set('Authorization', authHeader)
      .send({
        id: mukundraSemanticCode,
        guid: mukundraDbGuid,
        projectCode: mukundraSemanticCode,
        project_id_code: mukundraSemanticCode,
        brand: 'Device Doctor India',
        clientId: 'CLI-MUKUNDRA',
        clientName: 'Mukundara Roaring Tigers',
        serviceId: 'SRV-SEO-SMM',
        status: 'In Progress',
        notes: 'Updated deliverables for Mukundra Roaring Tigers.',
        contract: 20000,
        contractValue: 20000,
        isUpdate: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.project).toBeDefined();
    expect(res.body.project.id).toBe(mukundraSemanticCode);
    expect(res.body.project.projectCode).toBe(mukundraSemanticCode);
    expect(res.body.project.notes).toBe('Updated deliverables for Mukundra Roaring Tigers.');

    // Verify that UPDATE query was executed with correct targetId matching existing primary key
    const updateQuery = capturedSqlQueries.find((q) => q.sqlText.includes('UPDATE projects SET'));
    expect(updateQuery).toBeDefined();
    expect(updateQuery!.inputs.targetId).toBe(mukundraDbGuid);
    expect(updateQuery!.inputs.project_id_code).toBe(mukundraSemanticCode);
  });

  // 4. Update project name, contract value and payment milestones
  it('4. updates project name, contract value and payment milestones successfully', async () => {
    const projectId = 'DDI-MUKUNDRA-ROARING-TIGERS-SEO-SMM-1';

    mockStore.saveProject({
      id: projectId,
      guid: 'uuid-mukundra-1',
      projectCode: projectId,
      project_id_code: projectId,
      brand: 'Device Doctor India',
      clientId: 'CLI-MUKUNDRA',
      clientName: 'Mukundara Roaring Tigers',
      serviceId: 'SRV-SEO-SMM',
      proposalDate: '2026-06-25',
      contractDate: '2026-06-28',
      startDate: '2026-07-01',
      committedDays: 30,
      committedEndDate: '2026-07-31',
      status: 'In Progress',
      paymentMode: 'GST Invoice',
      currency: 'INR',
      contract: 20000,
      exchangeRate: 1,
      contractValue: 20000,
      totalReceived: 0,
      balance: 20000,
      projectManager: 'Karthik Rao',
      notes: 'Original scope.',
      paymentPhases: [
        { id: 'phase-1', name: 'Initial Advance', percentage: 50, amount: 10000, amountINR: 10000, dueDate: '2026-07-05', status: 'Pending' },
        { id: 'phase-2', name: 'Final Payment', percentage: 50, amount: 10000, amountINR: 10000, dueDate: '2026-07-31', status: 'Pending' },
      ],
      createdAt: '2026-06-25T00:00:00.000Z',
      updatedAt: '2026-06-28T00:00:00.000Z',
    });

    const updatedPhases = [
      { id: 'phase-1', name: 'Advance Milestone 1', percentage: 40, amount: 12000, amountINR: 12000, dueDate: '2026-07-10', status: 'Received' as const },
      { id: 'phase-2', name: 'Midway Milestone 2', percentage: 30, amount: 9000, amountINR: 9000, dueDate: '2026-07-20', status: 'Pending' as const },
      { id: 'phase-3', name: 'Final Handover Milestone 3', percentage: 30, amount: 9000, amountINR: 9000, dueDate: '2026-07-31', status: 'Pending' as const },
    ];

    const updatePayload = {
      id: projectId,
      clientName: 'Mukundra Roaring Tigers Sports Club',
      contract: 30000,
      contractValue: 30000,
      balance: 18000,
      totalReceived: 12000,
      notes: 'Scope expanded with additional social media channels.',
      paymentPhases: updatedPhases,
      isUpdate: true,
    };

    const res = await request(app)
      .put(`/api/projects/${projectId}`)
      .set('Authorization', authHeader)
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.project.clientName).toBe('Mukundra Roaring Tigers Sports Club');
    expect(res.body.project.contract).toBe(30000);
    expect(res.body.project.contractValue).toBe(30000);
    expect(res.body.project.paymentPhases).toHaveLength(3);
    expect(res.body.project.paymentPhases[0].name).toBe('Advance Milestone 1');
    expect(res.body.project.paymentPhases[0].amount).toBe(12000);
  });

  // 5. Confirm project ID and project code remain unchanged
  it('5. confirms project ID and project code remain unchanged after update', async () => {
    const originalId = 'DDI-MUKUNDRA-ROARING-TIGERS-SEO-SMM-1';

    const existingProject = mockStore.getProjectById(originalId);
    expect(existingProject).toBeDefined();

    const res = await request(app)
      .put(`/api/projects/${originalId}`)
      .set('Authorization', authHeader)
      .send({
        id: originalId,
        status: 'Completed',
        notes: 'Deliverables verified and accepted.',
        isUpdate: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.project.id).toBe(originalId);
    expect(res.body.project.projectCode).toBe(originalId);
    expect(res.body.project.project_id_code).toBe(originalId);

    // Confirm it did not become a sequence-2 or random UUID
    expect(res.body.project.id).not.toContain('SEO-SMM-2');
    expect(res.body.project.id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  // 6. Confirm other projects are not modified
  it('6. confirms other projects are not modified when updating one project', async () => {
    const techCorpId = 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1';
    const techCorpBefore = { ...mockStore.getProjectById(techCorpId)! };
    expect(techCorpBefore).toBeDefined();

    const mukundraId = 'DDI-MUKUNDRA-ROARING-TIGERS-SEO-SMM-1';

    const res = await request(app)
      .put(`/api/projects/${mukundraId}`)
      .set('Authorization', authHeader)
      .send({
        id: mukundraId,
        contract: 999999,
        contractValue: 999999,
        status: 'Completed',
        isUpdate: true,
      });

    expect(res.status).toBe(200);

    // Verify TechCorp project is completely untouched
    const techCorpAfter = mockStore.getProjectById(techCorpId);
    expect(techCorpAfter).toBeDefined();
    expect(techCorpAfter!.contract).toBe(techCorpBefore.contract);
    expect(techCorpAfter!.contractValue).toBe(techCorpBefore.contractValue);
    expect(techCorpAfter!.status).toBe(techCorpBefore.status);
    expect(techCorpAfter!.clientName).toBe(techCorpBefore.clientName);
  });

  // 7. Confirm a genuinely nonexistent project returns 404
  it('7. confirms a genuinely nonexistent project returns 404', async () => {
    const nonExistentId = 'DDI-GENUINELY-NONEXISTENT-PROJECT-999';

    const res = await request(app)
      .put(`/api/projects/${nonExistentId}`)
      .set('Authorization', authHeader)
      .send({
        id: nonExistentId,
        status: 'Completed',
        notes: 'Updating ghost record',
        isUpdate: true,
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain(`Project '${nonExistentId}' not found for update.`);
  });

  // 8. Confirm project creation and semantic ID sequencing from FIX 17 still work
  it('8. confirms project creation and semantic ID sequencing from FIX 17 still work without regression', async () => {
    // 1st project for new client
    const res1 = await request(app)
      .post('/api/projects')
      .set('Authorization', authHeader)
      .send({
        brand: 'Device Doctor India',
        clientId: 'DDI-SEQUENCING-TEST-CLIENT',
        clientName: 'Sequencing Test Client',
        serviceId: 'DDI-SRV-SEO-SMM',
        serviceName: 'SEO & SMM',
        startDate: '2026-07-01',
        contract: 15000,
        status: 'In Progress',
        isNew: true,
      });

    expect(res1.status).toBe(200);
    expect(res1.body.project.id).toContain('1');
    const firstSeqId = res1.body.project.id;

    // 2nd monthly project for same client + service
    const res2 = await request(app)
      .post('/api/projects')
      .set('Authorization', authHeader)
      .send({
        id: firstSeqId, // Form defaulted to first ID
        brand: 'Device Doctor India',
        clientId: 'DDI-SEQUENCING-TEST-CLIENT',
        clientName: 'Sequencing Test Client',
        serviceId: 'DDI-SRV-SEO-SMM',
        serviceName: 'SEO & SMM',
        startDate: '2026-08-01',
        contract: 15000,
        status: 'In Progress',
        isNew: true,
      });

    expect(res2.status).toBe(200);
    expect(res2.body.project.id).not.toBe(firstSeqId);
    expect(res2.body.project.id).toContain('2');
  });

  // 9. Verify no duplicate project is created during updates
  it('9. verifies no duplicate project is created during updates in mockStore or Azure SQL', async () => {
    const projectId = 'DDI-MUKUNDRA-ROARING-TIGERS-SEO-SMM-1';
    const initialProjects = mockStore.getProjects(null);
    const initialCount = initialProjects.length;

    const res = await request(app)
      .put(`/api/projects/${projectId}`)
      .set('Authorization', authHeader)
      .send({
        id: projectId,
        notes: 'Testing duplicate prevention during update.',
        status: 'In Progress',
        isUpdate: true,
      });

    expect(res.status).toBe(200);

    const afterProjects = mockStore.getProjects(null);
    expect(afterProjects.length).toBe(initialCount);

    const matches = afterProjects.filter((p) => p.id === projectId || p.projectCode === projectId);
    expect(matches).toHaveLength(1);
  });

  // 10. Frontend storageService.saveProject updates existing project seamlessly
  it('10. storageService.saveProject routes to PUT /api/projects/:id with preserved identifiers', async () => {
    const existing = mockStore.getProjectById(mukundraSemanticCode)!;
    expect(existing).toBeDefined();

    // Mock apiCall on storageService to verify payload & endpoint
    const apiCallSpy = vi.spyOn(storageService as any, 'apiCall').mockResolvedValue({
      success: true,
      project: {
        ...existing,
        notes: 'Updated via storageService',
      },
    });

    const result = await storageService.saveProject(
      {
        ...existing,
        notes: 'Updated via storageService',
      },
      true // isUpdate = true
    );

    expect(result.success).toBe(true);
    expect(result.project?.notes).toBe('Updated via storageService');
    expect(apiCallSpy).toHaveBeenCalledWith(
      `/api/projects/${encodeURIComponent(mukundraDbGuid)}`,
      'PUT',
      expect.objectContaining({
        id: mukundraSemanticCode,
        guid: mukundraDbGuid,
        projectCode: mukundraSemanticCode,
        isUpdate: true,
      })
    );
  });

  // 11. Preserves documents, milestones and client info when updating
  it('11. preserves documents, payment phases, and financial balance upon update', async () => {
    const projectWithDocs = mockStore.saveProject({
      id: 'DDI-DOC-TEST-PROJECT-1',
      guid: 'doc-test-guid-1234',
      projectCode: 'DDI-DOC-TEST-PROJECT-1',
      brand: 'Device Doctor India',
      clientId: 'CLI-DOCS',
      clientName: 'Document Test Client',
      serviceId: 'SRV-DOCS',
      proposalDate: '2026-01-01',
      contractDate: '2026-01-02',
      startDate: '2026-01-05',
      committedDays: 30,
      committedEndDate: '2026-02-05',
      actualEndDate: '',
      status: 'In Progress',
      paymentMode: 'GST Invoice',
      currency: 'INR',
      contract: 50000,
      exchangeRate: 1,
      contractValue: 50000,
      totalReceived: 20000,
      balance: 30000,
      projectManager: 'Karthik Rao',
      notes: 'Initial doc test notes',
      proposalDocument: { name: 'Proposal_v1.pdf', url: 'https://example.com/prop.pdf', uploadedAt: '2026-01-01' } as any,
      contractDocument: { name: 'Contract_signed.pdf', url: 'https://example.com/contract.pdf', uploadedAt: '2026-01-02' } as any,
      paymentPhases: [
        { id: 'p1', name: 'Milestone 1', amount: 20000, amountINR: 20000, dueDate: '2026-01-15', percentage: 40, status: 'Received' as const },
        { id: 'p2', name: 'Milestone 2', amount: 30000, amountINR: 30000, dueDate: '2026-02-15', percentage: 60, status: 'Pending' as const },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const res = await request(app)
      .put('/api/projects/DDI-DOC-TEST-PROJECT-1')
      .set('Authorization', authHeader)
      .send({
        id: 'DDI-DOC-TEST-PROJECT-1',
        status: 'In Progress',
        notes: 'Only updating status and notes',
        isUpdate: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.project.proposalDocument).toEqual(projectWithDocs.proposalDocument);
    expect(res.body.project.contractDocument).toEqual(projectWithDocs.contractDocument);
    expect(res.body.project.paymentPhases).toEqual(projectWithDocs.paymentPhases);
    expect(res.body.project.totalReceived).toBe(20000);
    expect(res.body.project.balance).toBe(30000);
    expect(res.body.project.contractValue).toBe(50000);
  });
});
