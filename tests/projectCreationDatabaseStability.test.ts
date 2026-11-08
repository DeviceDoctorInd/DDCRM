import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import { mockStore } from '../server/db/mockStore';
import * as azureSqlModule from '../server/db/azureSql';
import { buildProjectSaveQuery, calculateNextProjectSequenceSql } from '../server/routes/api';
import { classifyDbError, isTransientError } from '../server/db/db.config';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('FIX 21: Permanent Azure SQL Database Stability & Project Creation Fix', () => {
  beforeEach(() => {
    mockStore.seedDefaultData();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Global Azure SQL Error Classification & HTTP Mapping', () => {
    it('classifies SQL Server conversion errors (8169, 245) as DATATYPE_CONVERSION_ERROR and non-transient', () => {
      const err8169 = new Error('Conversion failed when converting from a character string to uniqueidentifier.');
      (err8169 as any).number = 8169;

      expect(isTransientError(err8169)).toBe(false);
      const classified = classifyDbError(err8169);
      expect(classified.category).toBe('DATATYPE_CONVERSION_ERROR');
      expect(classified.isTransient).toBe(false);
    });

    it('classifies SQL Server conversion syntax errors (245) as DATATYPE_CONVERSION_ERROR and non-transient', () => {
      const err245 = new Error('Conversion failed when converting the varchar value to data type int.');
      (err245 as any).number = 245;

      expect(isTransientError(err245)).toBe(false);
      const classified = classifyDbError(err245);
      expect(classified.category).toBe('DATATYPE_CONVERSION_ERROR');
      expect(classified.isTransient).toBe(false);
    });

    it('never reports constraint violations (2627, 2601) as transient or database unavailable', () => {
      const errPk = new Error("Violation of PRIMARY KEY constraint 'PK_projects'. Cannot insert duplicate key in object 'dbo.projects'.");
      (errPk as any).number = 2627;

      expect(isTransientError(errPk)).toBe(false);
      const classified = classifyDbError(errPk);
      expect(classified.category).toBe('CONSTRAINT_VIOLATION');
      expect(classified.isTransient).toBe(false);
    });

    it('accurately identifies genuine transient connection and pool timeout errors as TRANSIENT_CONNECTION', () => {
      const socketErr = new Error('Connection lost - socket closed unexpectedly');
      (socketErr as any).code = 'ECONNRESET';

      expect(isTransientError(socketErr)).toBe(true);
      const classified = classifyDbError(socketErr);
      expect(classified.category).toBe('TRANSIENT_CONNECTION');
      expect(classified.isTransient).toBe(true);
    });
  });

  describe('2. Project Save Query T-SQL Atomicity & Dynamic Type Safety', () => {
    it('buildProjectSaveQuery(false) contains strict transaction boundaries and rollback protection', () => {
      const insertSql = buildProjectSaveQuery(false);

      expect(insertSql).toContain('SET XACT_ABORT ON;');
      expect(insertSql).toContain('BEGIN TRY');
      expect(insertSql).toContain('BEGIN TRANSACTION;');
      expect(insertSql).toContain('INSERT INTO projects');
      expect(insertSql).toContain('COMMIT TRANSACTION;');
      expect(insertSql).toContain('BEGIN CATCH');
      expect(insertSql).toContain('IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;');
      expect(insertSql).toContain('THROW;');
      expect(insertSql).toContain('END CATCH');
    });

    it('buildProjectSaveQuery(true) contains strict transaction boundaries and rollback protection for update', () => {
      const updateSql = buildProjectSaveQuery(true);

      expect(updateSql).toContain('SET XACT_ABORT ON;');
      expect(updateSql).toContain('BEGIN TRY');
      expect(updateSql).toContain('BEGIN TRANSACTION;');
      expect(updateSql).toContain('UPDATE projects SET');
      expect(updateSql).toContain('COMMIT TRANSACTION;');
      expect(updateSql).toContain('BEGIN CATCH');
      expect(updateSql).toContain('IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;');
      expect(updateSql).toContain('THROW;');
      expect(updateSql).toContain('END CATCH');
    });

    it('dynamically queries sys.columns and uses TRY_CAST for uniqueidentifier compatibility', () => {
      const insertSql = buildProjectSaveQuery(false);

      expect(insertSql).toContain("OBJECT_ID('projects') AND c.name = 'id'");
      expect(insertSql).toContain("OBJECT_ID('projects') AND c.name = 'client_id'");
      expect(insertSql).toContain("OBJECT_ID('projects') AND c.name = 'service_id'");
      expect(insertSql).toContain('TRY_CAST(@guidId AS UNIQUEIDENTIFIER)');
      expect(insertSql).toContain('TRY_CAST(@guidClientId AS UNIQUEIDENTIFIER)');
      expect(insertSql).toContain('TRY_CAST(@guidServiceId AS UNIQUEIDENTIFIER)');
    });
  });

  describe('3. Project Creation End-to-End Tracing (Uniqueidentifier Azure SQL Schema)', () => {
    it('creates a project successfully when database id is UNIQUEIDENTIFIER without conversion error', async () => {
      const capturedSqlQueries: { sqlText: string; inputs: Record<string, any> }[] = [];

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

              // If sequence query
              if (sqlText.includes('WHERE (@brand IS NULL OR brand = @brand)') && sqlText.includes('basePattern')) {
                return { recordset: [] };
              }

              // Existing project check query
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM projects')) {
                return { recordset: [] };
              }

              // INSERT projects query
              if (sqlText.includes('INSERT INTO projects')) {
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

      const projectPayload = {
        isNew: true,
        brand: 'Device Doctor India',
        clientId: 'DDI-MUKUNDARA-ROARING-TIGERS',
        clientName: 'Mukundara Roaring Tigers',
        serviceId: 'DDI-SRV-SEO-SMM',
        serviceName: 'SEO & SMM',
        proposalDate: '2026-07-01',
        contractDate: '2026-07-05',
        startDate: '2026-07-10',
        committedDays: 30,
        committedEndDate: '2026-08-09',
        status: 'In Progress',
        paymentMode: 'GST Invoice',
        currency: 'INR',
        contract: 25000,
        exchangeRate: 1,
        contractValue: 25000,
        projectManager: 'Karthik Rao',
        notes: 'Monthly digital marketing retainer.',
        paymentPhases: [
          { id: 'ph-1', name: 'Phase 1 - Advance', percentage: 50, amount: 12500, amountINR: 12500, dueDate: '2026-07-15', status: 'Pending' },
        ],
      };

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send(projectPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.project).toBeDefined();
      expect(res.body.project.id).toMatch(/^DDI-MUKUNDARA-ROARING-TIGERS-SEO-SMM-\d+$/);
      expect(res.body.project.contractValue).toBe(25000);
      expect(res.body.project.projectManager).toBe('Karthik Rao');

      // Verify that the query executed was INSERT with proper parameters
      const insertExecution = capturedSqlQueries.find((q) => q.sqlText.includes('INSERT INTO projects'));
      expect(insertExecution).toBeDefined();
      expect(insertExecution!.inputs.guidId).toBeDefined();
      expect(insertExecution!.inputs.rawId).toBe(res.body.project.id);
      expect(insertExecution!.inputs.project_id_code).toBe(res.body.project.id);
    });

    it('creates multiple consecutive projects for the same client with different service types', async () => {
      const createdIds: string[] = [];

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
              if (sqlText.includes('WHERE (@brand IS NULL OR brand = @brand)') && sqlText.includes('basePattern')) {
                const matched = createdIds.filter((id) => id.includes(req.inputs.basePattern.replace('-%', '')));
                return { recordset: matched.map((id) => ({ id, project_id_code: id })) };
              }
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM projects')) {
                return { recordset: [] };
              }
              if (sqlText.includes('INSERT INTO projects')) {
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

      // Project 1: SEO
      const res1 = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'DDI-CLIENT-ALPHA',
          clientName: 'Alpha Tech',
          serviceId: 'DDI-SRV-SEO',
          serviceName: 'SEO',
          contract: 10000,
          projectManager: 'Vikram',
        });

      expect(res1.status).toBe(200);
      createdIds.push(res1.body.project.id);

      // Project 2: Web Dev
      const res2 = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'DDI-CLIENT-ALPHA',
          clientName: 'Alpha Tech',
          serviceId: 'DDI-SRV-DEV',
          serviceName: 'Web Development',
          contract: 50000,
          projectManager: 'Vikram',
        });

      expect(res2.status).toBe(200);
      createdIds.push(res2.body.project.id);

      expect(res1.body.project.id).not.toBe(res2.body.project.id);
      expect(res1.body.project.id).toContain('SEO');
      expect(res2.body.project.id).toContain('DEV');
    });
  });

  describe('4. Error Mapping Verification: Never Misclassify Database Errors as 503', () => {
    it('returns HTTP 409 Conflict when a non-retryable duplicate constraint occurs', async () => {
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
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM projects')) {
                return { recordset: [] };
              }
              if (sqlText.includes('WHERE (@brand IS NULL OR brand = @brand)')) {
                return { recordset: [] };
              }
              if (sqlText.includes('INSERT INTO projects')) {
                const constraintErr = new Error("Violation of UNIQUE KEY constraint 'UQ_projects_code'.");
                (constraintErr as any).number = 2627;
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
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'DDI-CLIENT-UNIQUE-TEST',
          clientName: 'Unique Client Test',
          serviceId: 'DDI-SRV-01',
          serviceName: 'Consulting',
          contract: 10000,
          projectManager: 'Vikram',
        });

      // Constraint violation MUST return 409, NEVER 503!
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Database Constraint Violation');
      expect(res.body.error).not.toBe('Azure SQL Database Unavailable');
    });

    it('returns HTTP 503 Azure SQL Database Unavailable only when pool is completely null/offline', async () => {
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(null);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'DDI-CLIENT-OFFLINE',
          clientName: 'Offline Client',
          serviceId: 'DDI-SRV-01',
          serviceName: 'Consulting',
          contract: 10000,
        });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(res.body.message).toContain('Azure SQL database is offline');
    });
  });

  describe('5. Project Sequence Calculation Integrity with AutoMigration', () => {
    it('calculateNextProjectSequenceSql queries projects table without type conversion crashes', async () => {
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              // Ensure query casts id, project_id_code, client_id and service_id to NVARCHAR(150)
              expect(sqlText).toContain('CAST(id AS NVARCHAR(150))');
              expect(sqlText).toContain('CAST(project_id_code AS NVARCHAR(150))');
              expect(sqlText).toContain('CAST(client_id AS NVARCHAR(150))');
              expect(sqlText).toContain('CAST(service_id AS NVARCHAR(150))');
              return {
                recordset: [
                  { id: 'DDI-ALPHA-CORP-SEO-1', project_id_code: 'DDI-ALPHA-CORP-SEO-1' },
                  { id: 'DDI-ALPHA-CORP-SEO-2', project_id_code: 'DDI-ALPHA-CORP-SEO-2' },
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
        'Alpha Corp',
        'SEO',
        'CLI-ALPHA-01',
        'SRV-SEO-01'
      );

      expect(result.nextSequence).toBe(3);
      expect(result.projectId).toBe('DDI-ALPHA-CORP-SEO-3');
    });
  });

  describe('6. Strict Column Datatype Exact Matching & WHERE Clause Safety', () => {
    it('never returns NVARCHAR from CASE expressions for UNIQUEIDENTIFIER columns', () => {
      const insertSql = buildProjectSaveQuery(false);
      const updateSql = buildProjectSaveQuery(true);

      // Verify no CASE expressions return NVARCHAR(36) for client_id or service_id
      expect(insertSql).not.toContain('AS NVARCHAR(36))');
      expect(updateSql).not.toContain('AS NVARCHAR(36))');

      // Verify explicit UNIQUEIDENTIFIER variables are declared and assigned
      expect(insertSql).toContain('DECLARE @guidClientIdVal UNIQUEIDENTIFIER');
      expect(insertSql).toContain('DECLARE @guidServiceIdVal UNIQUEIDENTIFIER');
      expect(updateSql).toContain('DECLARE @guidClientIdVal UNIQUEIDENTIFIER');
      expect(updateSql).toContain('DECLARE @guidServiceIdVal UNIQUEIDENTIFIER');
    });

    it('UPDATE WHERE clause uses string CAST comparisons and avoids type precedence conversion crashes', () => {
      const updateSql = buildProjectSaveQuery(true);

      // Ensure no raw id = TRY_CAST(@guidTargetId AS UNIQUEIDENTIFIER) without CAST(id AS NVARCHAR)
      expect(updateSql).not.toContain('id = TRY_CAST');
      expect(updateSql).toContain('CAST(id AS NVARCHAR(150)) = @targetId');
      expect(updateSql).toContain('CAST(id AS NVARCHAR(150)) = @guidTargetId');
    });

    it('captures @@ROWCOUNT immediately into @affectedRows and errors when UPDATE affects zero rows', () => {
      const updateSql = buildProjectSaveQuery(true);

      expect(updateSql).toContain('DECLARE @affectedRows INT = @@ROWCOUNT;');
      expect(updateSql).toContain('IF @affectedRows = 0');
      expect(updateSql).toContain('IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;');
      expect(updateSql).toContain('RAISERROR(\'Project record not found or no rows updated in database.\', 16, 1);');
    });

    it('rolls back transaction and errors when UPDATE affects more than one row using @affectedRows', () => {
      const updateSql = buildProjectSaveQuery(true);

      expect(updateSql).toContain('DECLARE @affectedRows INT = @@ROWCOUNT;');
      expect(updateSql).toContain('IF @affectedRows > 1');
      expect(updateSql).toContain('IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;');
      expect(updateSql).toContain('RAISERROR(\'Validation error: More than one project record matched target identifier during update. Transaction rolled back to prevent corruption.\', 16, 1);');
    });

    it('uses row locking and resolves target to single primary key before UPDATE', () => {
      const updateSql = buildProjectSaveQuery(true);

      expect(updateSql).toContain('WITH (UPDLOCK, HOLDLOCK)');
      expect(updateSql).toContain('WITH (UPDLOCK, ROWLOCK)');
      expect(updateSql).toContain('WHERE CAST(id AS NVARCHAR(150)) = @resolvedTargetId');
    });

    it('validates relationships and never silently converts invalid client_id or service_id to NULL', () => {
      const insertSql = buildProjectSaveQuery(false);
      const updateSql = buildProjectSaveQuery(true);

      expect(insertSql).toContain('Validation error: client_id cannot be resolved to a valid GUID');
      expect(insertSql).toContain('Validation error: service_id cannot be resolved to a valid GUID');
      expect(updateSql).toContain('Validation error: client_id cannot be resolved to a valid GUID');
      expect(updateSql).toContain('Validation error: service_id cannot be resolved to a valid GUID');
    });
  });

  describe('7. End-to-End Client/Service Relationship Preservation & Zero-Row UPDATE Handling', () => {
    it('queries clients table to resolve database primary key GUID for semantic client identifier', async () => {
      const queriedSql: string[] = [];

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
              queriedSql.push(sqlText);

              // Client resolution query
              if (sqlText.includes('FROM clients') && sqlText.includes('WHERE')) {
                return {
                  recordset: [
                    {
                      id: 'd71a8bc4-3b7d-4bad-9bdd-2b0d7b3dcb6d',
                      client_id_code: 'DDI-MUKUNDARA-ROARING-TIGERS',
                      name: 'Mukundara Roaring Tigers',
                    },
                  ],
                };
              }

              // Service resolution query
              if (sqlText.includes('FROM services') && sqlText.includes('WHERE')) {
                return {
                  recordset: [
                    {
                      id: 'e82b9cd5-4c8e-5cbe-aced-3c1e8c4edb7e',
                      name: 'SEO & SMM',
                    },
                  ],
                };
              }

              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM projects')) {
                return { recordset: [] };
              }

              if (sqlText.includes('INSERT INTO projects')) {
                // Verify that the resolved GUID from clients table was passed to guidClientId
                expect(req.inputs.guidClientId).toBe('d71a8bc4-3b7d-4bad-9bdd-2b0d7b3dcb6d');
                expect(req.inputs.guidServiceId).toBe('e82b9cd5-4c8e-5cbe-aced-3c1e8c4edb7e');
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

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'DDI-MUKUNDARA-ROARING-TIGERS',
          serviceId: 'DDI-SRV-SEO-SMM',
          contract: 30000,
          projectManager: 'Karthik Rao',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(queriedSql.some((s) => s.includes('FROM clients'))).toBe(true);
      expect(queriedSql.some((s) => s.includes('FROM services'))).toBe(true);
    });

    it('returns HTTP 400 when relationship cannot be resolved to a GUID for uniqueidentifier column', async () => {
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
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM projects')) {
                return { recordset: [] };
              }
              if (sqlText.includes('INSERT INTO projects')) {
                const validationErr = new Error('Validation error: client_id cannot be resolved to a valid GUID for UNIQUEIDENTIFIER column.');
                (validationErr as any).number = 50000;
                throw validationErr;
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
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'NON-EXISTENT-CLIENT',
          clientName: 'Non Existent Client',
          serviceId: 'DDI-SRV-01',
          contract: 15000,
          projectManager: 'Karthik Rao',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Database Validation Error');
      expect(res.body.message).toContain('Validation error: client_id cannot be resolved to a valid GUID');
    });

    it('returns HTTP 404 when UPDATE matches zero rows in database', async () => {
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
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM projects')) {
                // Existing check returns a row initially
                return {
                  recordset: [
                    {
                      id: 'DDI-PROJECT-TO-UPDATE',
                      project_id_code: 'DDI-PROJECT-TO-UPDATE',
                      brand: 'Device Doctor India',
                    },
                  ],
                };
              }
              if (sqlText.includes('UPDATE projects SET')) {
                // Simulate @@ROWCOUNT = 0 triggering RAISERROR
                const noRowsErr = new Error('Project record not found or no rows updated in database.');
                (noRowsErr as any).number = 50000;
                throw noRowsErr;
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
        .put('/api/projects/DDI-PROJECT-TO-UPDATE')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-PROJECT-TO-UPDATE',
          status: 'Completed',
          isUpdate: true,
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Not Found');
      expect(res.body.message).toContain('Project record not found or no rows updated');
    });
  });

  describe('8. Relationship Precedence, Ambiguity Validation & Error Propagation (Final Review)', () => {
    it('1. returns HTTP 400 when duplicate client names exist and no exact ID is specified', async () => {
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('FROM clients') && sqlText.includes('WHERE name = @cname')) {
                // Simulate two clients with the exact same name
                return {
                  recordset: [
                    { id: 'CLI-001', client_id_code: 'CODE-001', name: 'Duplicate Client Inc' },
                    { id: 'CLI-002', client_id_code: 'CODE-002', name: 'Duplicate Client Inc' },
                  ],
                };
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
          isNew: true,
          brand: 'Device Doctor India',
          clientName: 'Duplicate Client Inc',
          serviceId: 'SRV-01',
          contract: 10000,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Database Validation Error');
      expect(res.body.message).toContain('Ambiguous client relationship');
      expect(res.body.message).toContain('Multiple client records found with name \'Duplicate Client Inc\'');
    });

    it('2. returns HTTP 400 when duplicate service names exist and no exact ID is specified', async () => {
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('FROM clients') && sqlText.includes('WHERE CAST(id AS NVARCHAR(150)) = @cid')) {
                return {
                  recordset: [{ id: 'CLI-SINGLE-01', client_id_code: 'CLI-SINGLE-01', name: 'Single Client' }],
                };
              }
              if (sqlText.includes('FROM services') && sqlText.includes('WHERE name = @sname')) {
                // Simulate two services with the exact same name
                return {
                  recordset: [
                    { id: 'SRV-001', name: 'Ambiguous Web Development' },
                    { id: 'SRV-002', name: 'Ambiguous Web Development' },
                  ],
                };
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
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'CLI-SINGLE-01',
          serviceName: 'Ambiguous Web Development',
          contract: 20000,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Database Validation Error');
      expect(res.body.message).toContain('Ambiguous service relationship');
      expect(res.body.message).toContain('Multiple service records found with name \'Ambiguous Web Development\'');
    });

    it('3. does not swallow Azure SQL lookup failures and stops project save with HTTP 503', async () => {
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('FROM clients')) {
                const connErr = new Error('Connection lost - socket closed unexpectedly');
                (connErr as any).code = 'ECONNRESET';
                throw connErr;
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
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'CLI-LOOKUP-FAIL',
          serviceId: 'SRV-01',
          contract: 10000,
        });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(res.body.message).toContain('Cannot complete save project: Azure SQL database is offline or unreachable');
    });

    it('4. resolves relationships using exact ID precedence over name lookup', async () => {
      const queriedQueries: string[] = [];
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              queriedQueries.push(sqlText);

              // Exact primary key match
              if (sqlText.includes('FROM clients') && sqlText.includes('WHERE CAST(id AS NVARCHAR(150)) = @cid')) {
                return {
                  recordset: [
                    { id: 'CLI-PRIMARY-1', client_id_code: 'CODE-PRIMARY-1', name: 'Primary Client Name' },
                  ],
                };
              }
              if (sqlText.includes('FROM services') && sqlText.includes('WHERE CAST(id AS NVARCHAR(150)) = @sid')) {
                return {
                  recordset: [{ id: 'SRV-PRIMARY-1', name: 'Primary Service' }],
                };
              }
              if (sqlText.includes('WHERE (@brand IS NULL OR brand = @brand)') && sqlText.includes('basePattern')) {
                return { recordset: [] };
              }
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM projects')) {
                return { recordset: [] };
              }
              if (sqlText.includes('INSERT INTO projects')) {
                // Verify that primary key match won over name lookup
                expect(req.inputs.client_id).toBe('CODE-PRIMARY-1');
                expect(req.inputs.client_name).toBe('Primary Client Name');
                expect(req.inputs.service_id).toBe('SRV-PRIMARY-1');
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

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', authHeader)
        .send({
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'CLI-PRIMARY-1',
          clientName: 'Different Name That Should Be Ignored Because Exact ID Matched',
          serviceId: 'SRV-PRIMARY-1',
          serviceName: 'Different Service Name',
          contract: 10000,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Ensure name queries were NOT executed because exact ID match took precedence!
      expect(queriedQueries.some((q) => q.includes('WHERE name = @cname'))).toBe(false);
      expect(queriedQueries.some((q) => q.includes('WHERE name = @sname'))).toBe(false);
    });

    it('5. strictly preserves existing client and service relationships when updating without explicit changes', async () => {
      let executedUpdateInputs: Record<string, any> = {};

      const existingRecord = {
        id: 'EXISTING-PROJECT-GUID-99',
        project_id_code: 'DDI-PRESERVE-TEST-1',
        brand: 'Device Doctor India',
        client_id: 'CLI-PRESERVED-CLIENT',
        client_name: 'Preserved Client Corp',
        service_id: 'SRV-PRESERVED-SERVICE',
        status: 'In Progress',
        contract: 50000,
        contract_value: 50000,
      };

      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('SELECT TOP 1') && sqlText.includes('FROM projects')) {
                return { recordset: [existingRecord] };
              }
              if (sqlText.includes('UPDATE projects SET')) {
                executedUpdateInputs = { ...req.inputs };
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

      // Send update modifying ONLY status and notes (no clientId, no clientName, no serviceId)
      const res = await request(app)
        .put('/api/projects/DDI-PRESERVE-TEST-1')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-PRESERVE-TEST-1',
          status: 'Completed',
          notes: 'Status updated to Completed without changing client or service.',
          isUpdate: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.project.clientId).toBe('CLI-PRESERVED-CLIENT');
      expect(res.body.project.clientName).toBe('Preserved Client Corp');
      expect(res.body.project.serviceId).toBe('SRV-PRESERVED-SERVICE');
      expect(res.body.project.status).toBe('Completed');

      // Verify that the UPDATE SQL inputs strictly preserved the existing values
      expect(executedUpdateInputs.client_id).toBe('CLI-PRESERVED-CLIENT');
      expect(executedUpdateInputs.client_name).toBe('Preserved Client Corp');
      expect(executedUpdateInputs.service_id).toBe('SRV-PRESERVED-SERVICE');
      expect(executedUpdateInputs.status).toBe('Completed');
    });

    it('6. rejects ambiguous project identifiers when UPDATE matches multiple distinct projects', async () => {
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('FROM projects')) {
                // Return two distinct projects matched by cleanId and bodyCode
                return {
                  recordset: [
                    { id: 'PROJECT-A-GUID', project_id_code: 'DDI-PRJ-A', brand: 'Device Doctor India' },
                    { id: 'PROJECT-B-GUID', project_id_code: 'DDI-PRJ-B', brand: 'Device Doctor India' },
                  ],
                };
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
        .put('/api/projects/DDI-PRJ-A')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-PRJ-A',
          projectCode: 'DDI-PRJ-B', // Conflicting identifiers pointing to different records
          status: 'Completed',
          isUpdate: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Ambiguous project identifiers');
      expect(res.body.error).toContain('PROJECT-A-GUID, PROJECT-B-GUID');
    });

    it('7. returns HTTP 400 when duplicate client business codes exist in database', async () => {
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('FROM clients') && sqlText.includes('WHERE CAST(id AS NVARCHAR(150)) = @cid')) {
                // Primary key query returns 0 rows
                return { recordset: [] };
              }
              if (sqlText.includes('FROM clients') && sqlText.includes('client_id_code IS NOT NULL')) {
                // Business code query returns multiple duplicate records
                return {
                  recordset: [
                    { id: 'CLI-PK-1', client_id_code: 'CLI-DUP-CODE', name: 'First Client' },
                    { id: 'CLI-PK-2', client_id_code: 'CLI-DUP-CODE', name: 'Second Client' },
                  ],
                };
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
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'CLI-DUP-CODE',
          serviceId: 'SRV-01',
          contract: 10000,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Ambiguous client relationship: Multiple client records found with business code');
    });

    it('8. returns HTTP 400 when duplicate service business codes exist in database', async () => {
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('FROM clients')) {
                return { recordset: [{ id: 'CLI-1', name: 'Valid Client' }] };
              }
              if (sqlText.includes('FROM services') && sqlText.includes('WHERE CAST(id AS NVARCHAR(150)) = @sid')) {
                return { recordset: [] };
              }
              if (sqlText.includes('FROM services') && sqlText.includes('service_id_code')) {
                // Business code query returns duplicate rows
                return {
                  recordset: [
                    { id: 'SRV-PK-1', name: 'Service Variant 1' },
                    { id: 'SRV-PK-2', name: 'Service Variant 2' },
                  ],
                };
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
          isNew: true,
          brand: 'Device Doctor India',
          clientId: 'CLI-1',
          serviceId: 'SRV-DUP-CODE',
          contract: 10000,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Ambiguous service relationship: Multiple service records found with business code');
    });

    it('9. returns HTTP 400 when preserved client relationship matches multiple records by business code', async () => {
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('FROM projects') && sqlText.includes('SELECT TOP 1')) {
                return {
                  recordset: [
                    {
                      id: 'PRJ-PRESERVE-DUP-CLI',
                      project_id_code: 'PRJ-PRESERVE-DUP-CLI',
                      brand: 'Device Doctor India',
                      client_id: 'CLI-DUP-CODE-PRESERVE',
                      service_id: 'SRV-01',
                    },
                  ],
                };
              }
              if (sqlText.includes('FROM clients') && sqlText.includes('WHERE CAST(id AS NVARCHAR(150)) = @cid')) {
                return { recordset: [] };
              }
              if (sqlText.includes('FROM clients') && sqlText.includes('client_id_code IS NOT NULL')) {
                return {
                  recordset: [
                    { id: 'CLI-1', name: 'Client 1' },
                    { id: 'CLI-2', name: 'Client 2' },
                  ],
                };
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
        .put('/api/projects/PRJ-PRESERVE-DUP-CLI')
        .set('Authorization', authHeader)
        .send({
          id: 'PRJ-PRESERVE-DUP-CLI',
          status: 'Completed',
          isUpdate: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Ambiguous preserved client relationship: Multiple client records found with business code');
    });

    it('10. returns HTTP 400 when preserved service relationship matches multiple records by business code', async () => {
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('FROM projects') && sqlText.includes('SELECT TOP 1')) {
                return {
                  recordset: [
                    {
                      id: 'PRJ-PRESERVE-DUP-SRV',
                      project_id_code: 'PRJ-PRESERVE-DUP-SRV',
                      brand: 'Device Doctor India',
                      client_id: 'CLI-VALID-1',
                      client_name: 'Valid Client',
                      service_id: 'SRV-DUP-CODE-PRESERVE',
                    },
                  ],
                };
              }
              if (sqlText.includes('FROM services') && sqlText.includes('WHERE CAST(id AS NVARCHAR(150)) = @sid')) {
                return { recordset: [] };
              }
              if (sqlText.includes('FROM services') && sqlText.includes('service_id_code')) {
                return {
                  recordset: [
                    { id: 'SRV-1', name: 'Service 1' },
                    { id: 'SRV-2', name: 'Service 2' },
                  ],
                };
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
        .put('/api/projects/PRJ-PRESERVE-DUP-SRV')
        .set('Authorization', authHeader)
        .send({
          id: 'PRJ-PRESERVE-DUP-SRV',
          status: 'Completed',
          isUpdate: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Ambiguous preserved service relationship: Multiple service records found with business code');
    });
  });

  describe('9. Project Identifier Compatibility Scenarios (Final Review)', () => {
    const mockDbRow = {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      project_id_code: 'DDI-MUKUNDRA-ROARING-TIGERS-SEO-SMM-1',
      brand: 'Device Doctor India',
      client_id: 'CLI-MUKUNDRA',
      client_name: 'Mukundara Roaring Tigers',
      service_id: 'SRV-SEO-SMM',
      status: 'In Progress',
      contract: 20000,
      contract_value: 20000,
    };

    const mockSemanticDbRow = {
      id: 'DDI-MUKUNDRA-ROARING-TIGERS-SEO-SMM-1',
      project_id_code: 'DDI-MUKUNDRA-ROARING-TIGERS-SEO-SMM-1',
      brand: 'Device Doctor India',
      client_id: 'CLI-MUKUNDRA',
      client_name: 'Mukundara Roaring Tigers',
      service_id: 'SRV-SEO-SMM',
      status: 'In Progress',
      contract: 20000,
      contract_value: 20000,
    };

    it('Scenario 1: updates successfully using a database GUID as the project ID', async () => {
      let capturedInputs: Record<string, any> = {};
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('FROM projects') && sqlText.includes('SELECT TOP 1')) {
                return { recordset: [mockDbRow] };
              }
              if (sqlText.includes('UPDATE projects SET')) {
                capturedInputs = { ...req.inputs };
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

      const res = await request(app)
        .put(`/api/projects/${mockDbRow.id}`)
        .set('Authorization', authHeader)
        .send({
          id: mockDbRow.id,
          status: 'Completed',
          isUpdate: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.project.id).toBe(mockDbRow.project_id_code);
      expect(res.body.project.status).toBe('Completed');
      expect(capturedInputs.targetId).toBe(mockDbRow.id);
      expect(capturedInputs.guidTargetId).toBe(mockDbRow.id);
    });

    it('Scenario 2: updates successfully using a semantic project code stored in project_id_code', async () => {
      let capturedInputs: Record<string, any> = {};
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('FROM projects') && sqlText.includes('SELECT TOP 1')) {
                return { recordset: [mockSemanticDbRow] };
              }
              if (sqlText.includes('UPDATE projects SET')) {
                capturedInputs = { ...req.inputs };
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

      const res = await request(app)
        .put(`/api/projects/${mockSemanticDbRow.project_id_code}`)
        .set('Authorization', authHeader)
        .send({
          id: mockSemanticDbRow.project_id_code,
          status: 'Completed',
          isUpdate: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.project.status).toBe('Completed');
      expect(capturedInputs.targetId).toBe(mockSemanticDbRow.id);
      expect(capturedInputs.guidTargetId).toBeNull();
      expect(capturedInputs.project_id_code).toBe(mockSemanticDbRow.project_id_code);
    });

    it('Scenario 3: updates successfully when @targetId is a semantic project code and @guidTargetId is the database GUID', async () => {
      const updateSql = buildProjectSaveQuery(true);

      // Verify the query supports both identifiers simultaneously and resolves distinct rows
      expect(updateSql).toContain('COUNT(DISTINCT CAST(id AS NVARCHAR(150)))');
      expect(updateSql).toContain('CAST(id AS NVARCHAR(150)) = @targetId');
      expect(updateSql).toContain('project_id_code IS NOT NULL AND CAST(project_id_code AS NVARCHAR(150)) = @targetId');
      expect(updateSql).toContain('CAST(id AS NVARCHAR(150)) = @guidTargetId');
      expect(updateSql).toContain('project_id_code IS NOT NULL AND CAST(project_id_code AS NVARCHAR(150)) = @guidTargetId');
      // Verify no naive string inequality check that would falsely reject different formats for the same row
      expect(updateSql).not.toContain('@guidTargetId <> @targetId');

      // Now verify route bindings: Semantic DB ID + GUID candidate in request
      let capturedInputs: Record<string, any> = {};
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('FROM projects') && sqlText.includes('SELECT TOP 1')) {
                return { recordset: [mockSemanticDbRow] };
              }
              if (sqlText.includes('UPDATE projects SET')) {
                capturedInputs = { ...req.inputs };
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

      const targetGuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const res = await request(app)
        .put(`/api/projects/${mockSemanticDbRow.project_id_code}`)
        .set('Authorization', authHeader)
        .send({
          id: mockSemanticDbRow.project_id_code,
          guid: targetGuid,
          status: 'Completed',
          isUpdate: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(capturedInputs.targetId).toBe(mockSemanticDbRow.id);
      expect(capturedInputs.guidTargetId).toBe(targetGuid);
    });

    it('Scenario 4: updates successfully when both semantic code and GUID are supplied in request for the same project', async () => {
      let capturedInputs: Record<string, any> = {};
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('FROM projects') && sqlText.includes('SELECT TOP 1')) {
                return { recordset: [mockDbRow] };
              }
              if (sqlText.includes('UPDATE projects SET')) {
                capturedInputs = { ...req.inputs };
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

      const res = await request(app)
        .put(`/api/projects/${mockDbRow.project_id_code}`)
        .set('Authorization', authHeader)
        .send({
          id: mockDbRow.project_id_code,
          guid: mockDbRow.id,
          projectCode: mockDbRow.project_id_code,
          status: 'Completed',
          isUpdate: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.project.id).toBe(mockDbRow.project_id_code);
      expect(res.body.project.guid).toBe(mockDbRow.id);
      expect(res.body.project.status).toBe('Completed');
      expect(capturedInputs.targetId).toBe(mockDbRow.id);
      expect(capturedInputs.guidTargetId).toBe(mockDbRow.id);
    });

    it('Scenario 5: rejects with HTTP 400 when identifiers genuinely resolve to different projects', async () => {
      const fakePool: any = {
        request: () => {
          const req: any = {
            inputs: {} as Record<string, any>,
            input(name: string, value: any) {
              req.inputs[name] = value;
              return req;
            },
            async query(sqlText: string) {
              if (sqlText.includes('FROM projects')) {
                // Two distinct project records matched by the conflicting identifiers
                return {
                  recordset: [
                    { id: '11111111-1111-1111-1111-111111111111', project_id_code: 'DDI-PRJ-1', brand: 'Device Doctor India' },
                    { id: '22222222-2222-2222-2222-222222222222', project_id_code: 'DDI-PRJ-2', brand: 'Device Doctor India' },
                  ],
                };
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
        .put('/api/projects/DDI-PRJ-1')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-PRJ-1',
          guid: '22222222-2222-2222-2222-222222222222', // Points to project 2
          projectCode: 'DDI-PRJ-1', // Points to project 1
          status: 'Completed',
          isUpdate: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Ambiguous project identifiers');
      expect(res.body.error).toContain('11111111-1111-1111-1111-111111111111, 22222222-2222-2222-2222-222222222222');
    });
  });
});
