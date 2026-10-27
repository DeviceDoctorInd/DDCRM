import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import * as azureSqlModule from '../server/db/azureSql';

const app = createTestApp();

describe('GET /api/services SQL JOIN Type Conversion & Semantic ID Regression Tests (Step 7)', () => {
  let capturedSqlQueries: { sqlText: string; inputs: Record<string, any> }[] = [];

  beforeEach(() => {
    capturedSqlQueries = [];
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockPool(options: {
    mockRows?: any[];
    simulateConversionError?: boolean;
    simulateTimeout?: boolean;
  } = {}) {
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

            if (options.simulateConversionError) {
              throw new Error('Conversion failed when converting from a character string to uniqueidentifier.');
            }

            if (options.simulateTimeout) {
              throw new Error('operation timed out for an unknown reason');
            }

            if (sqlText.includes('FROM services s') && sqlText.includes('LEFT JOIN service_categories c')) {
              return {
                recordset: options.mockRows ?? [
                  {
                    id: 'DDI-SRV-001',
                    brand: 'Device Doctor India',
                    name: 'Full Stack Web Development',
                    categoryId: 'DDI-CAT-001',
                    categoryName: 'Development',
                    category_name: 'Development',
                    description: 'Enterprise web app engineering',
                    status: 'Active',
                    createdAt: '2026-10-24 10:00:00',
                    updatedAt: '2026-10-24 10:00:00',
                  },
                ],
              };
            }

            return { recordset: [] };
          },
        };
        return req;
      },
    };
  }

  describe('1. SQL Query Structure & Type Safety Verification', () => {
    it('executes a safe LEFT JOIN with explicit string CAST on both sides, avoiding uncast uniqueidentifier comparisons', async () => {
      const mockPool = createMockPool();
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .get('/api/services')
        .set('X-Active-Brand', 'Device Doctor India');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      // Verify the query was captured
      const serviceQuery = capturedSqlQueries.find((q) => q.sqlText.includes('FROM services s'));
      expect(serviceQuery).toBeDefined();

      const sql = serviceQuery!.sqlText;

      // 1. Must use explicit string CAST on both sides of the join condition
      expect(sql).toContain('CAST(s.category_id AS NVARCHAR(150)) = CAST(c.id AS NVARCHAR(150))');
      expect(sql).toContain('CAST(s.category_id AS NVARCHAR(150)) = CAST(c.category_id_code AS NVARCHAR(150))');

      // 2. Unsafe uncast comparisons that trigger SQL Server uniqueidentifier conversion errors must NOT exist
      // e.g. "s.category_id = c.id" without CAST
      const hasUnsafeIdComparison = /\bs\.category_id\s*=\s*c\.id\b/.test(sql);
      const hasUnsafeCodeComparison = /\bs\.category_id\s*=\s*c\.category_id_code\b/.test(sql);
      expect(hasUnsafeIdComparison).toBe(false);
      expect(hasUnsafeCodeComparison).toBe(false);

      // 3. Verify brand parameter passed safely
      expect(serviceQuery!.inputs.brandFilter).toBe('Device Doctor India');
    });
  });

  describe('2. Semantic Category ID Resolution (e.g. DDI-CAT-001)', () => {
    it('successfully returns services mapped to semantic category codes without conversion failure', async () => {
      const mockServicesWithSemanticCat = [
        {
          id: 'DDI-SRV-001',
          brand: 'Device Doctor India',
          name: 'SEO and SMM Optimization',
          categoryId: 'DDI-CAT-008',
          categoryName: 'Marketing',
          category_name: 'Marketing',
          description: 'Digital marketing and search engine presence',
          status: 'Active',
          createdAt: '2026-10-24 12:00:00',
          updatedAt: '2026-10-24 12:00:00',
        },
        {
          id: 'DDI-SRV-002',
          brand: 'Device Doctor India',
          name: 'Annual Maintenance Contract (AMC)',
          categoryId: 'DDI-CAT-009',
          categoryName: 'AMC',
          category_name: 'AMC',
          description: 'Hardware and server maintenance support',
          status: 'Active',
          createdAt: '2026-10-24 12:30:00',
          updatedAt: '2026-10-24 12:30:00',
        },
      ];

      const mockPool = createMockPool({ mockRows: mockServicesWithSemanticCat });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app).get('/api/services');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe('DDI-SRV-001');
      expect(res.body[0].categoryId).toBe('DDI-CAT-008');
      expect(res.body[0].categoryName).toBe('Marketing');
      expect(res.body[1].id).toBe('DDI-SRV-002');
      expect(res.body[1].categoryId).toBe('DDI-CAT-009');
      expect(res.body[1].categoryName).toBe('AMC');
    });
  });

  describe('3. Legacy GUID-Style Category ID Compatibility', () => {
    it('successfully returns services mapped to legacy GUID category IDs without conversion failure', async () => {
      const legacyGuid = 'e4a1b2c3-d4e5-4f6a-8b7c-1d2e3f4a5b6c';
      const mockServicesWithGuid = [
        {
          id: 'DDI-SRV-003',
          brand: 'Device Doctor India',
          name: 'Legacy Cloud Infrastructure',
          categoryId: legacyGuid,
          categoryName: 'Cloud Services',
          category_name: 'Cloud Services',
          description: 'Legacy Azure infrastructure management',
          status: 'Active',
          createdAt: '2026-10-20 09:00:00',
          updatedAt: '2026-10-20 09:00:00',
        },
      ];

      const mockPool = createMockPool({ mockRows: mockServicesWithGuid });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app).get('/api/services');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('DDI-SRV-003');
      expect(res.body[0].categoryId).toBe(legacyGuid);
      expect(res.body[0].categoryName).toBe('Cloud Services');
    });
  });

  describe('4. Fail-Closed Production Behavior (No Mock Fallback)', () => {
    it('returns HTTP 503 and never returns fabricated mock store services when SQL fails in production', async () => {
      const mockPool = createMockPool({ simulateConversionError: true });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      // Simulate production policy
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app).get('/api/services');

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(res.body.message).toContain('Cannot complete fetch services');
      expect(res.body.details).toContain('Conversion failed when converting from a character string to uniqueidentifier.');

      // Response must NOT be an array of fabricated mock services
      expect(Array.isArray(res.body)).toBe(false);
    });

    it('returns HTTP 503 and never returns fabricated mock store services on connection timeout in production', async () => {
      const mockPool = createMockPool({ simulateTimeout: true });
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(mockPool as any);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app).get('/api/services');

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(res.body.details).toContain('operation timed out');
      expect(Array.isArray(res.body)).toBe(false);
    });
  });
});
