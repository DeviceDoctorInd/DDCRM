import { Router, Request, Response } from 'express';
import { getAzureDbStatus, getPool, getOrInitPool, refreshTableCounts, initAzureSql, migrateAzureSqlSchema, isTransientError } from '../db/azureSql';
import sql from 'mssql';
import crypto from 'crypto';
import {
  Client,
  ServiceCategory,
  Service,
  Project,
  Payment,
  GstInvoice,
  EmployeeRole,
  Employee,
  Assignment,
  EmployeePayment,
  ExpenseCategory,
  Expense,
  AppUser,
  BankAccount,
  ProjectDocument,
  PaymentProofDocument,
} from '../../src/types/crm';
import { mockStore } from '../db/mockStore';
import authRoutes from './auth.routes';
import { authController } from '../controllers/auth.controller';
import { authenticateToken, optionalAuthenticateToken, AuthenticatedRequest, hashPassword } from '../middleware/auth';

const router = Router();

export function toGuid(str: string | undefined | null): string {
  if (!str) return crypto.randomUUID();
  const trimmed = str.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }
  const hash = crypto.createHash('md5').update(trimmed).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    '8' + hash.substring(17, 20),
    hash.substring(20, 32),
  ].join('-');
}

export function toGuidOrNull(str: string | undefined | null): string | null {
  if (!str) return null;
  const trimmed = str.trim();
  if (!trimmed || trimmed === 'NA' || trimmed === 'undefined' || trimmed === 'null' || trimmed === '') return null;
  return toGuid(trimmed);
}

export const VALID_BRANDS = ['Device Doctor India', 'Codestro', 'FX Launch Pad', 'DUNS'] as const;
export type ValidBrand = typeof VALID_BRANDS[number];

export function getBrandContext(req: Request): string | null {
  const headerBrand = (req.headers['x-active-brand'] as string | undefined || '').trim();
  const queryBrand = (req.query.brand as string | undefined || '').trim();
  const rawBrand = headerBrand || queryBrand;
  if (!rawBrand || rawBrand === 'All' || rawBrand === 'All Brands' || rawBrand === 'All Brands (Consolidated View)') {
    return null;
  }
  if (VALID_BRANDS.includes(rawBrand as ValidBrand)) {
    return rawBrand;
  }
  return null;
}

export function sanitizeBrand(brand: any, fallbackBrand: string | null = 'Device Doctor India'): string {
  if (brand && VALID_BRANDS.includes(brand)) {
    return brand;
  }
  if (fallbackBrand && VALID_BRANDS.includes(fallbackBrand as any)) {
    return fallbackBrand;
  }
  return 'Device Doctor India';
}

import {
  getBrandSemanticPrefix,
  slugifySemantic,
  generateSemanticClientId,
  generateSemanticProjectId,
  extractProjectSequence,
  getBaseProjectPrefix,
  generateSemanticEntityId,
} from '../utils/semanticId';

/**
 * Robust JSON parser and deserializer for Azure SQL NVARCHAR(MAX) payment_proof column
 */
export function parsePaymentProof(rawProof: any): PaymentProofDocument | undefined {
  if (!rawProof) return undefined;
  if (typeof rawProof === 'object') {
    return { ...rawProof };
  }
  if (typeof rawProof === 'string' && rawProof.trim()) {
    try {
      let parsed = JSON.parse(rawProof);
      // Guard against nested double-serialized JSON strings
      while (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          break;
        }
      }
      if (parsed && typeof parsed === 'object') {
        return {
          id: parsed.id || `proof-${Date.now()}`,
          name: parsed.name || 'Payment_Proof',
          size: typeof parsed.size === 'number' ? parsed.size : 0,
          type: parsed.type || 'image/png',
          uploadedAt: parsed.uploadedAt || new Date().toISOString(),
          url: parsed.url || '',
          externalUrl: parsed.externalUrl || '',
          notes: parsed.notes || '',
        };
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Safe serializer for Azure SQL NVARCHAR(MAX) payment_proof column
 */
export function serializePaymentProof(proof: any): string {
  if (!proof) return '';
  if (typeof proof === 'string') {
    try {
      const parsed = JSON.parse(proof);
      return JSON.stringify(parsed);
    } catch {
      return proof;
    }
  }
  if (typeof proof === 'object') {
    return JSON.stringify(proof);
  }
  return '';
}

/**
 * Calculates next sequence integer for a client/service project combination against Azure SQL or mockStore
 */
export async function calculateNextProjectSequenceSql(
  pool: sql.ConnectionPool | null,
  brand: string,
  clientName: string,
  serviceName: string,
  clientId?: string,
  serviceId?: string
): Promise<{ nextSequence: number; projectId: string; basePrefix: string }> {
  const basePrefix = getBaseProjectPrefix(brand, clientName, serviceName);

  if (!pool) {
    const nextSeq = mockStore.getNextProjectSequence(brand, clientName, serviceName, clientId, serviceId);
    const projectId = generateSemanticProjectId(brand, clientName, serviceName, nextSeq);
    return { nextSequence: nextSeq, projectId, basePrefix };
  }

  try {
    const basePattern = `${basePrefix}-%`;
    const spacePattern = `%${slugifySemantic(clientName)}%${slugifySemantic(serviceName)}%`;
    const clientGuid = toGuidOrNull(clientId);
    const serviceGuid = toGuidOrNull(serviceId);

    const result = await pool.request()
      .input('brand', brand)
      .input('basePattern', basePattern)
      .input('spacePattern', spacePattern)
      .input('clientId', clientGuid)
      .input('rawClientId', clientId || '')
      .input('serviceId', serviceGuid)
      .input('rawServiceId', serviceId || '')
      .query(`
        SELECT CAST(id AS NVARCHAR(150)) as id,
               ISNULL(CAST(project_id_code AS NVARCHAR(150)), '') as project_id_code
        FROM projects
        WHERE (@brand IS NULL OR brand = @brand)
          AND (
            id LIKE @basePattern
            OR project_id_code LIKE @basePattern
            OR id LIKE @spacePattern
            OR (@clientId IS NOT NULL AND (client_id = @clientId OR client_id = @rawClientId) AND (service_id = @serviceId OR service_id = @rawServiceId))
          )
      `);

    const records = result.recordset || [];
    let maxSeq = 0;

    for (const r of records) {
      const seq1 = extractProjectSequence(r.id, basePrefix);
      const seq2 = r.project_id_code ? extractProjectSequence(r.project_id_code, basePrefix) : null;
      const found = Math.max(seq1 || 0, seq2 || 0);
      if (found > maxSeq) {
        maxSeq = found;
      }
    }

    const mockSeq = mockStore.getNextProjectSequence(brand, clientName, serviceName, clientId, serviceId);
    const nextSequence = Math.max(maxSeq + 1, mockSeq > 1 ? mockSeq : 1);
    const projectId = generateSemanticProjectId(brand, clientName, serviceName, nextSequence);

    return { nextSequence, projectId, basePrefix };
  } catch (err) {
    console.warn('[calculateNextProjectSequenceSql] Error querying DB sequence, using mockStore:', err);
    const nextSeq = mockStore.getNextProjectSequence(brand, clientName, serviceName, clientId, serviceId);
    const projectId = generateSemanticProjectId(brand, clientName, serviceName, nextSeq);
    return { nextSequence: nextSeq, projectId, basePrefix };
  }
}

/**
 * Calculates next semantic Client ID against Azure SQL or mockStore
 */
export async function calculateNextClientIdSql(
  pool: sql.ConnectionPool | null,
  brand: string,
  clientName: string
): Promise<string> {
  const baseId = generateSemanticClientId(brand, clientName);

  if (!pool) {
    return mockStore.getNextClientId(brand, clientName);
  }

  try {
    const basePattern = `${baseId}-%`;
    const res = await pool.request()
      .input('brand', brand)
      .input('baseId', baseId)
      .input('basePattern', basePattern)
      .query(`
        SELECT CAST(id AS NVARCHAR(150)) as id,
               ISNULL(CAST(client_id_code AS NVARCHAR(150)), '') as client_id_code
        FROM clients
        WHERE id = @baseId OR client_id_code = @baseId OR id LIKE @basePattern OR client_id_code LIKE @basePattern
      `);

    const rows = res.recordset || [];
    if (rows.length === 0) {
      return baseId;
    }

    let maxSeq = 1;
    for (const row of rows) {
      const rowId = row.client_id_code || row.id || '';
      if (rowId === baseId) continue;
      const match = rowId.match(new RegExp(`^${baseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`));
      if (match && match[1]) {
        const seq = parseInt(match[1], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }

    return `${baseId}-${maxSeq + 1}`;
  } catch (err) {
    console.warn('[calculateNextClientIdSql] Error, using mockStore fallback:', err);
    return mockStore.getNextClientId(brand, clientName);
  }
}

// Auto-healing and transient-retry query executor
async function executeSqlWithAutoMigration<T>(
  pool: sql.ConnectionPool,
  queryFn: (activePool?: sql.ConnectionPool) => Promise<T>,
  tableName?: string
): Promise<T> {
  try {
    return await (queryFn.length > 0 ? queryFn(pool) : (queryFn as any)());
  } catch (err: any) {
    const msg = String(err?.message || err);

    // 1. Transient connection retry using global pool reconnection
    if (isTransientError(err)) {
      console.warn(`[Azure SQL Transient Retry] Network glitch detected: ${msg}. Re-acquiring connection pool...`);
      const reconnectedPool = await getOrInitPool();
      if (reconnectedPool) {
        try {
          return await (queryFn.length > 0 ? queryFn(reconnectedPool) : (queryFn as any)());
        } catch (retryErr) {
          console.warn('[Azure SQL Transient Retry] Retry attempt failed:', retryErr);
        }
      }
    }

    // 2. Targeted column auto-heal
    if (msg.includes('Invalid column name') && tableName) {
      const colMatch = msg.match(/Invalid column name '([^']+)'/i);
      if (colMatch && colMatch[1]) {
        const colName = colMatch[1];
        try {
          console.warn(`[Azure SQL Auto-Heal] Auto-adding missing column [${colName}] to table [${tableName}]...`);
          const activePool = getPool() || pool;
          await activePool.request().query(`
            IF EXISTS (SELECT * FROM sys.tables WHERE name = '${tableName}') 
            AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('${tableName}') AND name = '${colName}')
            ALTER TABLE [${tableName}] ADD [${colName}] NVARCHAR(MAX);
          `);
          return await (queryFn.length > 0 ? queryFn(activePool) : (queryFn as any)());
        } catch {
          // If auto-heal fails, rethrow original error
        }
      }
    }

    throw err;
  }
}

function handleDbError(res: Response, err: unknown, context: string) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[Azure SQL][${context}] Error:`, msg);
  return res.status(500).json({
    success: false,
    error: msg,
    message: `Azure SQL Error during ${context}: ${msg}`,
  });
}

// --- Status & Diagnostics Route ---
router.get('/db/status', async (_req: Request, res: Response) => {
  const pool = await getOrInitPool();
  if (pool) {
    try {
      const counts = await refreshTableCounts();
      const status = getAzureDbStatus();
      return res.json({
        status: 'ok',
        ...status,
        connected: true,
        isMock: false,
        tableCounts: counts,
      });
    } catch (err) {
      console.warn('[db/status] refreshTableCounts error:', err);
    }
  }

  const status = getAzureDbStatus();
  return res.json({
    status: 'ok',
    connected: false,
    isMock: true,
    server: status.server,
    database: status.database,
    authType: status.authType,
    user: status.user,
    error: status.error || 'Operating with high-availability in-memory store',
    lastChecked: new Date().toISOString(),
    tableCounts: mockStore.getTableCounts(),
  });
});

router.post('/db/reconnect', async (_req: Request, res: Response) => {
  const success = await initAzureSql();
  const pool = getPool();
  if (pool && success) {
    await migrateAzureSqlSchema(pool);
    const counts = await refreshTableCounts();
    const status = getAzureDbStatus();
    return res.json({
      success: true,
      status: {
        ...status,
        connected: true,
        isMock: false,
        tableCounts: counts,
      },
    });
  }

  const status = getAzureDbStatus();
  return res.json({
    success: false,
    status: {
      ...status,
      connected: false,
      isMock: true,
      tableCounts: mockStore.getTableCounts(),
    },
  });
});

// Auto-seeding route
router.post('/db/sync-seed', async (_req: Request, res: Response) => {
  return res.json({
    success: true,
    message: 'CRM database store active.',
  });
});

// --- Clear Demo Data ---
router.post('/db/clear-demo', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.role !== 'Super Admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Only Super Admin can clear demo data.',
    });
  }
  const pool = await getOrInitPool();
  if (!pool) {
    const resData = mockStore.clearDemo();
    return res.json({
      success: true,
      message: 'Demo data cleared from in-memory database. Protected admin accounts preserved.',
      remainingUsers: resData.remainingUsers,
      clearedTables: resData.clearedTables,
      tableCounts: mockStore.getTableCounts(),
    });
  }

  try {
    const tablesToClear = [
      'employee_payments',
      'assignments',
      'other_expenses',
      'expense_categories',
      'employees',
      'employee_roles',
      'gst_invoices',
      'payments',
      'projects',
      'services',
      'service_categories',
      'clients',
      'crm_audit_log',
    ];

    for (const table of tablesToClear) {
      await pool.request().query(`IF EXISTS (SELECT * FROM sys.tables WHERE name = '${table}') DELETE FROM ${table};`);
    }

    await pool.request().query(`
      IF EXISTS (SELECT * FROM sys.tables WHERE name = 'app_users')
      DELETE FROM app_users 
      WHERE LOWER(email) NOT IN ('rathorehemant114@gmail.com', 'devicedoctorindia.in@gmail.com');
    `);

    const nowIso = new Date().toISOString();
    await pool.request()
      .input('u1_id', 'USR-001')
      .input('u1_name', 'Hemant Rathore')
      .input('u1_email', 'rathorehemant114@gmail.com')
      .input('u1_pass', 'Hemant@1318')
      .input('u1_role', 'Super Admin')
      .input('u1_brand', 'All')
      .input('u1_status', 'Active')
      .input('now1', nowIso)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM app_users WHERE LOWER(email) = 'rathorehemant114@gmail.com')
        INSERT INTO app_users (id, name, email, password_hash, role, brand, status, created_at, updated_at)
        VALUES (@u1_id, @u1_name, @u1_email, @u1_pass, @u1_role, @u1_brand, @u1_status, @now1, @now1);
      `);

    await pool.request()
      .input('u2_id', 'USR-002')
      .input('u2_name', 'Device Doctor India')
      .input('u2_email', 'devicedoctorindia.in@gmail.com')
      .input('u2_pass', 'Admin@2026')
      .input('u2_role', 'Super Admin')
      .input('u2_brand', 'All')
      .input('u2_status', 'Active')
      .input('now2', nowIso)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM app_users WHERE LOWER(email) = 'devicedoctorindia.in@gmail.com')
        INSERT INTO app_users (id, name, email, password_hash, role, brand, status, created_at, updated_at)
        VALUES (@u2_id, @u2_name, @u2_email, @u2_pass, @u2_role, @u2_brand, @u2_status, @now2, @now2);
      `);

    const tableCounts = await refreshTableCounts();
    const remainingUsers = (await pool.request().query('SELECT id, name, email, role, brand, status, avatar, created_at as createdAt, updated_at as updatedAt FROM app_users')).recordset;

    return res.json({
      success: true,
      message: 'Demo data permanently deleted from live Azure SQL Database. Protected admin accounts preserved.',
      remainingUsers,
      clearedTables: tablesToClear,
      tableCounts,
    });
  } catch (err) {
    const resData = mockStore.clearDemo();
    return res.json({
      success: true,
      message: 'Demo data cleared from store.',
      remainingUsers: resData.remainingUsers,
      clearedTables: resData.clearedTables,
      tableCounts: mockStore.getTableCounts(),
    });
  }
});

// --- Authentication & RBAC Routes ---
router.use('/auth', authRoutes);

// Direct endpoint bindings for auth
router.post('/auth/login', (req: Request, res: Response) => {
  authController.login(req, res);
});
router.put('/auth/update-credentials', optionalAuthenticateToken, (req: Request, res: Response) => {
  authController.updateCredentials(req as AuthenticatedRequest, res);
});
router.post('/auth/update-credentials', optionalAuthenticateToken, (req: Request, res: Response) => {
  authController.updateCredentials(req as AuthenticatedRequest, res);
});

// --- CLIENTS ---
router.get('/clients/next-semantic-id', authenticateToken, async (req: Request, res: Response) => {
  const brand = sanitizeBrand(req.query.brand as string || getBrandContext(req));
  const clientName = (req.query.name as string || '').trim();
  if (!clientName) {
    return res.status(400).json({ success: false, error: 'Client name is required.' });
  }

  const pool = await getOrInitPool();
  const clientId = await calculateNextClientIdSql(pool, brand, clientName);
  return res.json({ success: true, clientId, brand });
});

router.get('/clients', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getClients(brand));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT ISNULL(NULLIF(CAST(client_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as id, 
               ISNULL(NULLIF(CAST(client_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as client_id,
               ISNULL(NULLIF(CAST(client_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as client_id_code,
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand_id,
               ISNULL(CAST(name AS NVARCHAR(255)), ISNULL(CAST(client_name AS NVARCHAR(255)), '')) as name, 
               ISNULL(CAST(name AS NVARCHAR(255)), ISNULL(CAST(client_name AS NVARCHAR(255)), '')) as client_name, 
               ISNULL(CAST(contact_person AS NVARCHAR(255)), '') as contactPerson, 
               ISNULL(CAST(phone AS NVARCHAR(50)), '') as phone, 
               ISNULL(CAST(email AS NVARCHAR(255)), '') as email, 
               ISNULL(CAST(city AS NVARCHAR(100)), '') as city, 
               ISNULL(CAST(country AS NVARCHAR(100)), '') as country,
               ISNULL(CAST(gst_number AS NVARCHAR(50)), '') as gstNumber, 
               ISNULL(CAST(preferred_currency AS NVARCHAR(20)), 'INR') as preferredCurrency, 
               ISNULL(CAST(client_since AS NVARCHAR(50)), '') as clientSince,
               ISNULL(CAST(status AS NVARCHAR(50)), 'Active') as status, 
               ISNULL(CAST(notes AS NVARCHAR(MAX)), '') as notes, 
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt
        FROM clients 
        WHERE (@brandFilter IS NULL OR brand = @brandFilter)
        ORDER BY created_at DESC
      `),
      'clients'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /clients] Falling back to mock store:', err);
    return res.json(mockStore.getClients(brand));
  }
});

async function handleSaveClientRoute(req: Request, res: Response) {
  const client: Client = req.body;
  const brandContext = getBrandContext(req);
  client.brand = sanitizeBrand(client.brand, brandContext) as any;
  const now = new Date().toISOString();
  client.updatedAt = now;
  client.createdAt = client.createdAt || now;

  const pool = await getOrInitPool();

  // Enforce semantic Client ID only if missing (new client onboarding)
  if (!client.id) {
    client.id = await calculateNextClientIdSql(pool, client.brand || 'Device Doctor India', client.name);
  }

  if (!pool) {
    const saved = mockStore.saveClient(client);
    mockStore.addAuditLog({
      brand: client.brand || 'All',
      module: 'Clients',
      action: 'SAVE',
      entityId: client.id,
      details: `Saved client ${client.name} (${client.id}) under ${client.brand}`,
      performedBy: 'User',
    });
    return res.json({ success: true, client: saved });
  }

  try {
    const guidId = toGuid(client.id);
    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', client.id)
          .input('guidId', guidId)
          .input('rawId', client.id || '')
          .input('brand', client.brand || 'Device Doctor India')
          .input('name', client.name)
          .input('contact_person', client.contactPerson || '')
          .input('phone', client.phone || '')
          .input('email', client.email || '')
          .input('city', client.city || '')
          .input('country', client.country || '')
          .input('gst_number', client.gstNumber || '')
          .input('preferred_currency', client.preferredCurrency || 'INR')
          .input('client_since', client.clientSince || '')
          .input('status', client.status || 'Active')
          .input('notes', client.notes || '')
          .input('created_at', client.createdAt)
          .input('updated_at', client.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM clients WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR client_id_code = @rawId OR id = @guidId)
              UPDATE clients SET brand=@brand, name=@name, client_name=@name, contact_person=@contact_person, phone=@phone, email=@email,
                                 city=@city, country=@country, gst_number=@gst_number, preferred_currency=@preferred_currency,
                                 client_since=@client_since, status=@status, notes=@notes, updated_at=@updated_at,
                                 client_id_code=@rawId
              WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR client_id_code = @rawId OR id = @guidId
            ELSE
              INSERT INTO clients (id, client_id_code, brand, name, client_name, contact_person, phone, email, city, country, gst_number, preferred_currency, client_since, status, notes, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @name, @name, @contact_person, @phone, @email, @city, @country, @gst_number, @preferred_currency, @client_since, @status, @notes, @created_at, @updated_at)
          `),
      'clients'
    );
    mockStore.saveClient(client);
    return res.json({ success: true, client });
  } catch (err: any) {
    const errMsg = String(err?.message || err);
    if (errMsg.includes('uniqueidentifier') || errMsg.includes('Conversion failed')) {
      try {
        const guidId = toGuid(client.id);
        await executeSqlWithAutoMigration(
          pool,
          () =>
            pool.request()
              .input('id', guidId)
              .input('rawId', client.id || '')
              .input('brand', client.brand || 'Device Doctor India')
              .input('name', client.name)
              .input('contact_person', client.contactPerson || '')
              .input('phone', client.phone || '')
              .input('email', client.email || '')
              .input('city', client.city || '')
              .input('country', client.country || '')
              .input('gst_number', client.gstNumber || '')
              .input('preferred_currency', client.preferredCurrency || 'INR')
              .input('client_since', client.clientSince || '')
              .input('status', client.status || 'Active')
              .input('notes', client.notes || '')
              .input('created_at', client.createdAt)
              .input('updated_at', client.updatedAt)
              .query(`
                IF EXISTS (SELECT 1 FROM clients WHERE id = @id OR client_id_code = @rawId)
                  UPDATE clients SET brand=@brand, name=@name, client_name=@name, contact_person=@contact_person, phone=@phone, email=@email,
                                     city=@city, country=@country, gst_number=@gst_number, preferred_currency=@preferred_currency,
                                     client_since=@client_since, status=@status, notes=@notes, updated_at=@updated_at,
                                     client_id_code=@rawId
                  WHERE id = @id OR client_id_code = @rawId
                ELSE
                  INSERT INTO clients (id, client_id_code, brand, name, client_name, contact_person, phone, email, city, country, gst_number, preferred_currency, client_since, status, notes, created_at, updated_at)
                  VALUES (@id, @rawId, @brand, @name, @name, @contact_person, @phone, @email, @city, @country, @gst_number, @preferred_currency, @client_since, @status, @notes, @created_at, @updated_at)
              `),
          'clients'
        );
        mockStore.saveClient(client);
        return res.json({ success: true, client });
      } catch (innerErr) {
        console.warn('[POST /clients] Uniqueidentifier fallback error:', innerErr);
      }
    }
    console.warn('[POST /clients] Falling back to mock store:', err);
    const saved = mockStore.saveClient(client);
    return res.json({ success: true, client: saved });
  }
}

router.post('/clients', authenticateToken, handleSaveClientRoute);
router.put('/clients/:id', authenticateToken, (req: Request, res: Response) => {
  req.body.id = req.params.id;
  return handleSaveClientRoute(req, res);
});

router.delete('/clients/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const brand = getBrandContext(req);
  const brandFilter = (brand && brand !== 'All') ? brand : null;
  const pool = await getOrInitPool();

  if (!pool) {
    const deleted = mockStore.deleteClient(id, brandFilter);
    if (!deleted) {
      return res.status(403).json({
        success: false,
        error: 'Deletion prevented: Client belongs to another workspace brand or does not exist.',
      });
    }
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    const checkRes = await pool.request()
      .input('id', guidId)
      .input('rawId', id)
      .query(`
        SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id, 
                     ISNULL(CAST(client_id_code AS NVARCHAR(150)), '') as client_id_code,
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand,
                     ISNULL(CAST(name AS NVARCHAR(255)), ISNULL(CAST(client_name AS NVARCHAR(255)), '')) as client_name
        FROM clients 
        WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR client_id_code = @rawId
      `);

    const existing = checkRes.recordset?.[0];
    if (existing && brandFilter && existing.brand && existing.brand !== 'All' && existing.brand !== brandFilter) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: Client belongs to workspace "${existing.brand}", but current workspace is "${brandFilter}".`
      });
    }

    if (existing) {
      const depRes = await pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('clientName', existing.client_name || '')
        .query(`
          SELECT 
            (SELECT COUNT(1) FROM projects WHERE client_id = @id OR client_id = @rawId OR client_name = @clientName) as projectCount,
            (SELECT COUNT(1) FROM payments WHERE client_id = @id OR client_id = @rawId OR client_name = @clientName) as paymentCount
        `);
      const deps = depRes.recordset?.[0];
      const projCount = Number(deps?.projectCount || 0);
      const payCount = Number(deps?.paymentCount || 0);
      if (projCount > 0 || payCount > 0) {
        return res.status(409).json({
          success: false,
          error: `Cannot delete client "${existing.client_name || id}": ${projCount} project(s) and ${payCount} payment(s) are linked to it.`
        });
      }
    }

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .query(`
          DELETE FROM clients 
          WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR client_id_code = @rawId)
            AND (@brandFilter IS NULL OR brand = @brandFilter)
        `),
      'clients'
    );
    mockStore.deleteClient(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DELETE /clients/${id}] Falling back to mock store:`, errMsg);
    mockStore.deleteClient(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- SERVICE CATEGORIES ---
router.get('/categories', async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getServiceCategories(brand));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT ISNULL(NULLIF(CAST(category_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as id, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(name AS NVARCHAR(255)), ISNULL(CAST(category_name AS NVARCHAR(255)), '')) as name, 
               ISNULL(CAST(description AS NVARCHAR(MAX)), '') as description, 
               ISNULL(CAST(status AS NVARCHAR(50)), 'Active') as status, 
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt 
        FROM service_categories 
        WHERE (@brandFilter IS NULL OR brand = @brandFilter)
        ORDER BY created_at DESC
      `),
      'service_categories'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /categories] Falling back to mock store:', err);
    return res.json(mockStore.getServiceCategories(brand));
  }
});

async function handleSaveCategoryRoute(req: Request, res: Response) {
  const cat: ServiceCategory = req.body;
  const brandContext = getBrandContext(req);
  cat.brand = sanitizeBrand(cat.brand, brandContext) as any;
  const now = new Date().toISOString();
  cat.updatedAt = now;
  cat.createdAt = cat.createdAt || now;

  cat.id = (cat.id || '').trim() || generateSemanticEntityId('CAT', cat.brand, mockStore.getServiceCategories(cat.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveServiceCategory(cat);
    return res.json({ success: true, category: saved });
  }

  try {
    const guidId = toGuid(cat.id);
    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', cat.id || '')
          .input('brand', cat.brand || 'Device Doctor India')
          .input('name', cat.name)
          .input('description', cat.description || '')
          .input('status', cat.status || 'Active')
          .input('created_at', cat.createdAt)
          .input('updated_at', cat.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM service_categories WHERE id = @id OR (category_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR CAST(id AS NVARCHAR(100)) = @rawId)
              UPDATE service_categories SET brand=@brand, name=@name, category_name=@name, description=@description, status=@status, updated_at=@updated_at, category_id_code=@rawId 
              WHERE id = @id OR (category_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR CAST(id AS NVARCHAR(100)) = @rawId
            ELSE
              INSERT INTO service_categories (id, category_id_code, brand, name, category_name, description, status, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @name, @name, @description, @status, @created_at, @updated_at)
          `),
      'service_categories'
    );
    mockStore.saveServiceCategory(cat);
    return res.json({ success: true, category: cat });
  } catch (err) {
    console.warn('[handleSaveCategoryRoute] Falling back to mock store:', err);
    const saved = mockStore.saveServiceCategory(cat);
    return res.json({ success: true, category: saved });
  }
}

router.post('/categories', handleSaveCategoryRoute);
router.put('/categories/:id', (req: Request, res: Response) => {
  req.body.id = req.params.id;
  return handleSaveCategoryRoute(req, res);
});

router.delete('/categories/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const brand = getBrandContext(req);
  const brandFilter = (brand && brand !== 'All') ? brand : null;
  const pool = await getOrInitPool();

  if (!pool) {
    const deleted = mockStore.deleteServiceCategory(id, brandFilter);
    if (!deleted) {
      return res.status(403).json({
        success: false,
        error: 'Deletion prevented: Category belongs to another workspace brand or does not exist.',
      });
    }
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    const checkRes = await pool.request()
      .input('id', guidId)
      .input('rawId', id)
      .query(`
        SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id,
                     ISNULL(CAST(category_id_code AS NVARCHAR(150)), '') as category_id_code,
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand,
                     ISNULL(CAST(name AS NVARCHAR(255)), ISNULL(CAST(category_name AS NVARCHAR(255)), '')) as name
        FROM service_categories 
        WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR category_id_code = @rawId
      `);

    const existing = checkRes.recordset?.[0];
    if (existing && brandFilter && existing.brand && existing.brand !== 'All' && existing.brand !== brandFilter) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: Service category belongs to workspace "${existing.brand}", but current workspace is "${brandFilter}".`
      });
    }

    if (existing) {
      const depRes = await pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('catName', existing.name || '')
        .query(`
          SELECT COUNT(1) as srvCount 
          FROM services 
          WHERE category_id = @id OR category_id = @rawId OR category_name = @catName
        `);
      const srvCount = Number(depRes.recordset?.[0]?.srvCount || 0);
      if (srvCount > 0) {
        return res.status(409).json({
          success: false,
          error: `Cannot delete category "${existing.name || id}": ${srvCount} service(s) are categorized under it.`
        });
      }
    }

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .query(`
          DELETE FROM service_categories 
          WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR category_id_code = @rawId)
            AND (@brandFilter IS NULL OR brand = @brandFilter)
        `),
      'service_categories'
    );
    mockStore.deleteServiceCategory(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DELETE /categories/${id}] Falling back to mock store:`, errMsg);
    mockStore.deleteServiceCategory(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- SERVICES ---
router.get('/services', async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getServices(brand));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT 
          ISNULL(NULLIF(CAST(s.service_id_code AS NVARCHAR(150)), ''), CAST(s.id AS NVARCHAR(150))) AS id, 
          ISNULL(CAST(s.brand AS NVARCHAR(100)), 'Device Doctor India') AS brand, 
          ISNULL(CAST(s.name AS NVARCHAR(255)), ISNULL(CAST(s.service_name AS NVARCHAR(255)), '')) AS name, 
          ISNULL(NULLIF(CAST(c.category_id_code AS NVARCHAR(150)), ''), ISNULL(NULLIF(CAST(s.category_id AS NVARCHAR(100)), ''), '')) AS categoryId, 
          ISNULL(NULLIF(CAST(c.name AS NVARCHAR(255)), ''), ISNULL(NULLIF(CAST(c.category_name AS NVARCHAR(255)), ''), '')) AS categoryName, 
          ISNULL(NULLIF(CAST(c.name AS NVARCHAR(255)), ''), ISNULL(NULLIF(CAST(c.category_name AS NVARCHAR(255)), ''), '')) AS category_name, 
          ISNULL(CAST(s.description AS NVARCHAR(MAX)), '') AS description, 
          ISNULL(CAST(s.status AS NVARCHAR(50)), 'Active') AS status, 
          ISNULL(CAST(s.created_at AS NVARCHAR(50)), '') AS createdAt, 
          ISNULL(CAST(s.updated_at AS NVARCHAR(50)), ISNULL(CAST(s.created_at AS NVARCHAR(50)), '')) AS updatedAt 
        FROM services s
        LEFT JOIN service_categories c ON (
          s.category_id = c.id
          OR s.category_id = c.category_id_code
          OR CAST(s.category_id AS NVARCHAR(100)) = CAST(c.id AS NVARCHAR(100))
          OR CAST(s.category_id AS NVARCHAR(100)) = CAST(c.category_id_code AS NVARCHAR(100))
        )
        WHERE (@brandFilter IS NULL OR s.brand = @brandFilter)
        ORDER BY s.created_at DESC
      `),
      'services'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /services] Falling back to mock store:', err);
    return res.json(mockStore.getServices(brand));
  }
});

async function handleSaveServiceRoute(req: Request, res: Response) {
  const srv: Service = req.body;
  const brandContext = getBrandContext(req);
  srv.brand = sanitizeBrand(srv.brand, brandContext) as any;
  const now = new Date().toISOString();
  srv.updatedAt = now;
  srv.createdAt = srv.createdAt || now;

  srv.id = (srv.id || '').trim() || generateSemanticEntityId('SRV', srv.brand, mockStore.getServices(srv.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveService(srv);
    return res.json({ success: true, service: saved });
  }

  try {
    const guidId = toGuid(srv.id);
    let catGuid = toGuidOrNull(srv.categoryId);

    // Resolve category from service_categories to ensure exact foreign key matching
    try {
      const catCheck = await pool.request()
        .input('catId', srv.categoryId || '')
        .input('catGuid', catGuid)
        .query(`SELECT TOP 1 id, category_id_code, name, category_name FROM service_categories WHERE id = @catGuid OR id = @catId OR category_id_code = @catId OR CAST(id AS NVARCHAR(100)) = @catId`);
      if (catCheck.recordset && catCheck.recordset.length > 0) {
        const foundCat = catCheck.recordset[0];
        catGuid = foundCat.id || catGuid;
        srv.categoryName = foundCat.name || foundCat.category_name || srv.categoryName;
        srv.category_name = srv.categoryName;
      }
    } catch {
      // Proceed with catGuid
    }

    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', srv.id || '')
          .input('brand', srv.brand || 'Device Doctor India')
          .input('name', srv.name)
          .input('category_id', catGuid)
          .input('description', srv.description || '')
          .input('status', srv.status || 'Active')
          .input('created_at', srv.createdAt)
          .input('updated_at', srv.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM services WHERE id = @id OR (service_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL))
              UPDATE services SET brand=@brand, name=@name, service_name=@name, category_id=@category_id, description=@description, status=@status, updated_at=@updated_at, service_id_code=@rawId 
              WHERE id = @id OR (service_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL)
            ELSE
              INSERT INTO services (id, service_id_code, brand, name, service_name, category_id, description, status, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @name, @name, @category_id, @description, @status, @created_at, @updated_at)
          `),
      'services'
    );
    mockStore.saveService(srv);
    return res.json({ success: true, service: srv });
  } catch (err) {
    console.warn('[handleSaveServiceRoute] Falling back to mock store:', err);
    const saved = mockStore.saveService(srv);
    return res.json({ success: true, service: saved });
  }
}

router.post('/services', handleSaveServiceRoute);
router.put('/services/:id', (req: Request, res: Response) => {
  req.body.id = req.params.id;
  return handleSaveServiceRoute(req, res);
});

router.delete('/services/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const brand = getBrandContext(req);
  const brandFilter = (brand && brand !== 'All') ? brand : null;
  const pool = await getOrInitPool();

  if (!pool) {
    const deleted = mockStore.deleteService(id, brandFilter);
    if (!deleted) {
      return res.status(403).json({
        success: false,
        error: 'Deletion prevented: Service belongs to another workspace brand or does not exist.',
      });
    }
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    const checkRes = await pool.request()
      .input('id', guidId)
      .input('rawId', id)
      .query(`
        SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id,
                     ISNULL(CAST(service_id_code AS NVARCHAR(150)), '') as service_id_code,
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand,
                     ISNULL(CAST(name AS NVARCHAR(255)), ISNULL(CAST(service_name AS NVARCHAR(255)), '')) as name
        FROM services 
        WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR service_id_code = @rawId
      `);

    const existing = checkRes.recordset?.[0];
    if (existing && brandFilter && existing.brand && existing.brand !== 'All' && existing.brand !== brandFilter) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: Service belongs to workspace "${existing.brand}", but current workspace is "${brandFilter}".`
      });
    }

    if (existing) {
      const depRes = await pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('srvName', existing.name || '')
        .query(`
          SELECT COUNT(1) as projCount 
          FROM projects 
          WHERE service_id = @id OR service_id = @rawId OR service_name = @srvName
        `);
      const projCount = Number(depRes.recordset?.[0]?.projCount || 0);
      if (projCount > 0) {
        return res.status(409).json({
          success: false,
          error: `Cannot delete service "${existing.name || id}": ${projCount} project(s) are linked to it.`
        });
      }
    }

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .query(`
          DELETE FROM services 
          WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR service_id_code = @rawId)
            AND (@brandFilter IS NULL OR brand = @brandFilter)
        `),
      'services'
    );
    mockStore.deleteService(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DELETE /services/${id}] Falling back to mock store:`, errMsg);
    mockStore.deleteService(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- PROJECTS ---
router.get('/projects/next-semantic-id', authenticateToken, async (req: Request, res: Response) => {
  const brand = sanitizeBrand(req.query.brand as string || getBrandContext(req));
  let clientName = (req.query.clientName as string || '').trim();
  const clientId = (req.query.clientId as string || '').trim();
  let serviceName = (req.query.serviceName as string || '').trim();
  const serviceId = (req.query.serviceId as string || '').trim();

  const pool = await getOrInitPool();

  if (!clientName && clientId) {
    if (pool) {
      try {
        const cRow = (await pool.request().input('cid', clientId).query(`SELECT name, client_name FROM clients WHERE id = @cid OR client_id_code = @cid`)).recordset[0];
        clientName = cRow?.name || cRow?.client_name || '';
      } catch {}
    }
    if (!clientName) {
      clientName = mockStore.getClientById(clientId)?.name || '';
    }
  }

  if (!serviceName && serviceId) {
    if (pool) {
      try {
        const sRow = (await pool.request().input('sid', serviceId).query(`SELECT name, service_name FROM services WHERE id = @sid`)).recordset[0];
        serviceName = sRow?.name || sRow?.service_name || '';
      } catch {}
    }
    if (!serviceName) {
      serviceName = mockStore.getServices().find((s) => s.id === serviceId)?.name || '';
    }
  }

  clientName = clientName || 'CLIENT';
  serviceName = serviceName || 'SERVICE';

  const calculated = await calculateNextProjectSequenceSql(
    pool,
    brand,
    clientName,
    serviceName,
    clientId,
    serviceId
  );

  return res.json({
    success: true,
    projectId: calculated.projectId,
    sequence: calculated.nextSequence,
    basePrefix: calculated.basePrefix,
    brand,
  });
});

router.get('/projects', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getProjects(brand));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT ISNULL(NULLIF(CAST(project_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as id, 
               ISNULL(NULLIF(CAST(project_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as project_id,
               ISNULL(NULLIF(CAST(project_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as project_id_code,
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(client_id AS NVARCHAR(150)), '') as clientId, 
               ISNULL(CAST(client_name AS NVARCHAR(255)), '') as clientName, 
               ISNULL(CAST(service_id AS NVARCHAR(150)), '') as serviceId,
               ISNULL(CAST(proposal_date AS NVARCHAR(50)), '') as proposalDate, 
               ISNULL(CAST(contract_date AS NVARCHAR(50)), '') as contractDate, 
               ISNULL(CAST(start_date AS NVARCHAR(50)), '') as startDate,
               ISNULL(committed_days, 30) as committedDays, 
               ISNULL(CAST(committed_end_date AS NVARCHAR(50)), '') as committedEndDate,
               ISNULL(CAST(actual_end_date AS NVARCHAR(50)), '') as actualEndDate, 
               ISNULL(CAST(status AS NVARCHAR(50)), 'In Progress') as status, 
               ISNULL(CAST(payment_mode AS NVARCHAR(50)), 'GST Invoice') as paymentMode, 
               ISNULL(CAST(currency AS NVARCHAR(20)), 'INR') as currency,
               ISNULL(contract, 0) as contract, 
               ISNULL(exchange_rate, 1) as exchangeRate, 
               ISNULL(contract_value, 0) as contractValue,
               ISNULL(total_received, 0) as totalReceived, 
               ISNULL(balance, 0) as balance, 
               ISNULL(CAST(project_manager AS NVARCHAR(255)), '') as projectManager,
               ISNULL(CAST(notes AS NVARCHAR(MAX)), '') as notes, 
               ISNULL(CAST(proposal_document AS NVARCHAR(MAX)), '') as proposalDocument, 
               ISNULL(CAST(contract_document AS NVARCHAR(MAX)), '') as contractDocument,
               ISNULL(CAST(payment_phases AS NVARCHAR(MAX)), '[]') as paymentPhases, 
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt
        FROM projects 
        WHERE (@brandFilter IS NULL OR brand = @brandFilter)
        ORDER BY created_at DESC
      `),
      'projects'
    );
    const formatted = (q.recordset || []).map((p: any) => {
      let parsedPhases = [];
      if (p.paymentPhases) {
        try {
          parsedPhases = typeof p.paymentPhases === 'string' ? JSON.parse(p.paymentPhases) : p.paymentPhases;
        } catch {
          parsedPhases = [];
        }
      }
      let proposalDoc = null;
      if (p.proposalDocument) {
        try {
          proposalDoc = typeof p.proposalDocument === 'string' ? JSON.parse(p.proposalDocument) : p.proposalDocument;
        } catch {
          proposalDoc = null;
        }
      }
      let contractDoc = null;
      if (p.contractDocument) {
        try {
          contractDoc = typeof p.contractDocument === 'string' ? JSON.parse(p.contractDocument) : p.contractDocument;
        } catch {
          contractDoc = null;
        }
      }
      return {
        ...p,
        paymentPhases: parsedPhases,
        proposalDocument: proposalDoc,
        contractDocument: contractDoc,
      };
    });
    return res.json(formatted);
  } catch (err) {
    console.warn('[GET /projects] Falling back to mock store:', err);
    return res.json(mockStore.getProjects(brand));
  }
});

async function handleSaveProjectRoute(req: Request, res: Response) {
  const proj: Project = req.body;
  const brandContext = getBrandContext(req);
  proj.brand = sanitizeBrand(proj.brand, brandContext) as any;
  const now = new Date().toISOString();
  proj.updatedAt = now;
  proj.createdAt = proj.createdAt || now;

  const pool = await getOrInitPool();

  // If creating new project (missing ID), calculate strict semantic ID with sequence counter
  if (!proj.id) {
    let clientName = proj.clientName || '';
    let serviceName = (proj as any).serviceName || (proj as any).serviceType || '';

    if (!clientName && proj.clientId) {
      if (pool) {
        try {
          const cRow = (await pool.request().input('cid', proj.clientId).query(`SELECT name, client_name FROM clients WHERE id = @cid OR client_id_code = @cid`)).recordset[0];
          clientName = cRow?.name || cRow?.client_name || '';
        } catch {}
      }
      if (!clientName) {
        clientName = mockStore.getClientById(proj.clientId)?.name || '';
      }
    }

    if (proj.serviceId && !serviceName) {
      if (pool) {
        try {
          const sRow = (await pool.request().input('sid', proj.serviceId).query(`SELECT name, service_name FROM services WHERE id = @sid`)).recordset[0];
          serviceName = sRow?.name || sRow?.service_name || '';
        } catch {}
      }
      if (!serviceName) {
        serviceName = mockStore.getServices().find((s) => s.id === proj.serviceId)?.name || '';
      }
    }

    clientName = clientName || 'CLIENT';
    serviceName = serviceName || 'SERVICE';

    const calculated = await calculateNextProjectSequenceSql(
      pool,
      proj.brand || 'Device Doctor India',
      clientName,
      serviceName,
      proj.clientId,
      proj.serviceId
    );
    proj.id = calculated.projectId;
  }

  if (!pool) {
    const saved = mockStore.saveProject(proj);
    mockStore.addAuditLog({
      brand: proj.brand || 'All',
      module: 'Projects',
      action: 'SAVE',
      entityId: proj.id,
      details: `Saved project ${proj.id} for client ${proj.clientName}`,
      performedBy: 'User',
    });
    return res.json({ success: true, project: saved });
  }

  try {
    const guidId = toGuid(proj.id);
    const clientGuid = toGuidOrNull(proj.clientId);
    const serviceGuid = toGuidOrNull(proj.serviceId);

    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', proj.id)
          .input('guidId', guidId)
          .input('rawId', proj.id || '')
          .input('brand', proj.brand || 'Device Doctor India')
          .input('client_id', proj.clientId || clientGuid)
          .input('client_name', proj.clientName || '')
          .input('service_id', proj.serviceId || serviceGuid)
          .input('proposal_date', proj.proposalDate || '')
          .input('contract_date', proj.contractDate || '')
          .input('start_date', proj.startDate || '')
          .input('committed_days', proj.committedDays || 30)
          .input('committed_end_date', proj.committedEndDate || '')
          .input('actual_end_date', proj.actualEndDate || '')
          .input('status', proj.status || 'In Progress')
          .input('payment_mode', proj.paymentMode || 'GST Invoice')
          .input('currency', proj.currency || 'INR')
          .input('contract', proj.contract || 0)
          .input('exchange_rate', proj.exchangeRate || 1)
          .input('contract_value', proj.contractValue || 0)
          .input('total_received', proj.totalReceived || 0)
          .input('balance', proj.balance || 0)
          .input('project_manager', proj.projectManager || '')
          .input('notes', proj.notes || '')
          .input('proposal_document', proj.proposalDocument ? (typeof proj.proposalDocument === 'string' ? proj.proposalDocument : JSON.stringify(proj.proposalDocument)) : '')
          .input('contract_document', proj.contractDocument ? (typeof proj.contractDocument === 'string' ? proj.contractDocument : JSON.stringify(proj.contractDocument)) : '')
          .input('payment_phases', proj.paymentPhases ? (typeof proj.paymentPhases === 'string' ? proj.paymentPhases : JSON.stringify(proj.paymentPhases)) : '[]')
          .input('created_at', proj.createdAt)
          .input('updated_at', proj.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM projects WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR project_id_code = @rawId OR id = @guidId)
              UPDATE projects SET brand=@brand, client_id=@client_id, client_name=@client_name, service_id=@service_id,
                                 proposal_date=@proposal_date, contract_date=@contract_date, start_date=@start_date,
                                 committed_days=@committed_days, committed_end_date=@committed_end_date,
                                 actual_end_date=@actual_end_date, status=@status, payment_mode=@payment_mode,
                                 currency=@currency, contract=@contract, exchange_rate=@exchange_rate,
                                 contract_value=@contract_value, total_received=@total_received, balance=@balance,
                                 project_manager=@project_manager, notes=@notes, proposal_document=@proposal_document,
                                 contract_document=@contract_document, payment_phases=@payment_phases, updated_at=@updated_at,
                                 project_id_code=@rawId
              WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR project_id_code = @rawId OR id = @guidId
            ELSE
              INSERT INTO projects (id, project_id_code, brand, client_id, client_name, service_id, proposal_date, contract_date, start_date, committed_days, committed_end_date, actual_end_date, status, payment_mode, currency, contract, exchange_rate, contract_value, total_received, balance, project_manager, notes, proposal_document, contract_document, payment_phases, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @client_id, @client_name, @service_id, @proposal_date, @contract_date, @start_date, @committed_days, @committed_end_date, @actual_end_date, @status, @payment_mode, @currency, @contract, @exchange_rate, @contract_value, @total_received, @balance, @project_manager, @notes, @proposal_document, @contract_document, @payment_phases, @created_at, @updated_at)
          `),
      'projects'
    );
    mockStore.saveProject(proj);
    return res.json({ success: true, project: proj });
  } catch (err: any) {
    const errMsg = String(err?.message || err);
    if (errMsg.includes('uniqueidentifier') || errMsg.includes('Conversion failed')) {
      try {
        const guidId = toGuid(proj.id);
        const clientGuid = toGuidOrNull(proj.clientId);
        const serviceGuid = toGuidOrNull(proj.serviceId);
        await executeSqlWithAutoMigration(
          pool,
          () =>
            pool.request()
              .input('id', guidId)
              .input('rawId', proj.id || '')
              .input('brand', proj.brand || 'Device Doctor India')
              .input('client_id', clientGuid)
              .input('client_name', proj.clientName || '')
              .input('service_id', serviceGuid)
              .input('proposal_date', proj.proposalDate || '')
              .input('contract_date', proj.contractDate || '')
              .input('start_date', proj.startDate || '')
              .input('committed_days', proj.committedDays || 30)
              .input('committed_end_date', proj.committedEndDate || '')
              .input('actual_end_date', proj.actualEndDate || '')
              .input('status', proj.status || 'In Progress')
              .input('payment_mode', proj.paymentMode || 'GST Invoice')
              .input('currency', proj.currency || 'INR')
              .input('contract', proj.contract || 0)
              .input('exchange_rate', proj.exchangeRate || 1)
              .input('contract_value', proj.contractValue || 0)
              .input('total_received', proj.totalReceived || 0)
              .input('balance', proj.balance || 0)
              .input('project_manager', proj.projectManager || '')
              .input('notes', proj.notes || '')
              .input('proposal_document', proj.proposalDocument ? (typeof proj.proposalDocument === 'string' ? proj.proposalDocument : JSON.stringify(proj.proposalDocument)) : '')
              .input('contract_document', proj.contractDocument ? (typeof proj.contractDocument === 'string' ? proj.contractDocument : JSON.stringify(proj.contractDocument)) : '')
              .input('payment_phases', proj.paymentPhases ? (typeof proj.paymentPhases === 'string' ? proj.paymentPhases : JSON.stringify(proj.paymentPhases)) : '[]')
              .input('created_at', proj.createdAt)
              .input('updated_at', proj.updatedAt)
              .query(`
                IF EXISTS (SELECT 1 FROM projects WHERE id = @id OR project_id_code = @rawId)
                  UPDATE projects SET brand=@brand, client_id=@client_id, client_name=@client_name, service_id=@service_id,
                                     proposal_date=@proposal_date, contract_date=@contract_date, start_date=@start_date,
                                     committed_days=@committed_days, committed_end_date=@committed_end_date,
                                     actual_end_date=@actual_end_date, status=@status, payment_mode=@payment_mode,
                                     currency=@currency, contract=@contract, exchange_rate=@exchange_rate,
                                     contract_value=@contract_value, total_received=@total_received, balance=@balance,
                                     project_manager=@project_manager, notes=@notes, proposal_document=@proposal_document,
                                     contract_document=@contract_document, payment_phases=@payment_phases, updated_at=@updated_at,
                                     project_id_code=@rawId
                  WHERE id = @id OR project_id_code = @rawId
                ELSE
                  INSERT INTO projects (id, project_id_code, brand, client_id, client_name, service_id, proposal_date, contract_date, start_date, committed_days, committed_end_date, actual_end_date, status, payment_mode, currency, contract, exchange_rate, contract_value, total_received, balance, project_manager, notes, proposal_document, contract_document, payment_phases, created_at, updated_at)
                  VALUES (@id, @rawId, @brand, @client_id, @client_name, @service_id, @proposal_date, @contract_date, @start_date, @committed_days, @committed_end_date, @actual_end_date, @status, @payment_mode, @currency, @contract, @exchange_rate, @contract_value, @total_received, @balance, @project_manager, @notes, @proposal_document, @contract_document, @payment_phases, @created_at, @updated_at)
              `),
          'projects'
        );
        mockStore.saveProject(proj);
        return res.json({ success: true, project: proj });
      } catch (innerErr) {
        console.warn('[handleSaveProjectRoute] Fallback retry failed:', innerErr);
      }
    }
    console.warn('[handleSaveProjectRoute] Falling back to mock store:', err);
    const saved = mockStore.saveProject(proj);
    return res.json({ success: true, project: saved });
  }
}

router.post('/projects', authenticateToken, handleSaveProjectRoute);
router.put('/projects/:id', authenticateToken, (req: Request, res: Response) => {
  req.body.id = req.params.id;
  return handleSaveProjectRoute(req, res);
});

router.delete('/projects/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const brand = getBrandContext(req);
  const brandFilter = (brand && brand !== 'All') ? brand : null;
  const pool = await getOrInitPool();

  if (!pool) {
    const deleted = mockStore.deleteProject(id, brandFilter);
    if (!deleted) {
      return res.status(403).json({
        success: false,
        error: 'Deletion prevented: Project belongs to another workspace brand or does not exist.',
      });
    }
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    const checkRes = await pool.request()
      .input('id', guidId)
      .input('rawId', id)
      .query(`
        SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id,
                     ISNULL(CAST(project_id_code AS NVARCHAR(150)), '') as project_id_code,
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand,
                     ISNULL(CAST(title AS NVARCHAR(255)), ISNULL(CAST(name AS NVARCHAR(255)), '')) as title
        FROM projects 
        WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR project_id_code = @rawId
      `);

    const existing = checkRes.recordset?.[0];
    if (existing && brandFilter && existing.brand && existing.brand !== 'All' && existing.brand !== brandFilter) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: Project belongs to workspace "${existing.brand}", but current workspace is "${brandFilter}".`
      });
    }

    if (existing) {
      const depRes = await pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .query(`
          SELECT 
            (SELECT COUNT(1) FROM payments WHERE project_id = @id OR project_id = @rawId) as payCount,
            (SELECT COUNT(1) FROM assignments WHERE project_id = @id OR project_id = @rawId) as asnCount
        `);
      const deps = depRes.recordset?.[0];
      const payCount = Number(deps?.payCount || 0);
      const asnCount = Number(deps?.asnCount || 0);
      if (payCount > 0 || asnCount > 0) {
        return res.status(409).json({
          success: false,
          error: `Cannot delete project "${existing.title || id}": ${payCount} payment(s) and ${asnCount} assignment(s) are linked to it.`
        });
      }
    }

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .query(`
          DELETE FROM projects 
          WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR project_id_code = @rawId)
            AND (@brandFilter IS NULL OR brand = @brandFilter)
        `),
      'projects'
    );
    mockStore.deleteProject(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DELETE /projects/${id}] Falling back to mock store:`, errMsg);
    mockStore.deleteProject(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- PROJECT DOCUMENTS (Preview & Download API) ---
router.get('/projects/:id/documents/:docType', async (req: Request, res: Response) => {
  const { id, docType } = req.params;
  const download = req.query.download === 'true';
  const pool = await getOrInitPool();

  let project: any;
  if (!pool) {
    project = mockStore.getProjectById(id);
  } else {
    try {
      const guidId = toGuid(id);
      const q = await executeSqlWithAutoMigration(
        pool,
        () =>
          pool.request()
            .input('id', guidId)
            .input('rawId', id)
            .query(`
              SELECT CAST(id AS NVARCHAR(150)) as id, 
                     ISNULL(CAST(proposal_document AS NVARCHAR(MAX)), '') as proposalDocument, 
                     ISNULL(CAST(contract_document AS NVARCHAR(MAX)), '') as contractDocument,
                     client_name as clientName,
                     brand
              FROM projects 
              WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId
            `),
        'projects'
      );
      if (q.recordset && q.recordset.length > 0) {
        const row = q.recordset[0];
        let pDoc = null;
        let cDoc = null;
        if (row.proposalDocument) {
          try {
            pDoc = typeof row.proposalDocument === 'string' ? JSON.parse(row.proposalDocument) : row.proposalDocument;
          } catch {
            pDoc = null;
          }
        }
        if (row.contractDocument) {
          try {
            cDoc = typeof row.contractDocument === 'string' ? JSON.parse(row.contractDocument) : row.contractDocument;
          } catch {
            cDoc = null;
          }
        }
        project = { ...row, proposalDocument: pDoc, contractDocument: cDoc };
      }
    } catch (err) {
      console.warn(`[GET /projects/${id}/documents/${docType}] SQL query error:`, err);
    }
  }

  if (!project) {
    project = mockStore.getProjectById(id);
  }

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const isProposal = docType.toLowerCase().startsWith('prop');
  const doc: ProjectDocument | undefined = isProposal ? project.proposalDocument : project.contractDocument;

  if (!doc) {
    return res.status(404).json({ error: `No ${isProposal ? 'proposal' : 'contract'} document attached to this project` });
  }

  const fileName = doc.name || (isProposal ? `${project.id}_Proposal.pdf` : `${project.id}_Contract.pdf`);

  // If document contains Base64 Data URL
  if (doc.url && doc.url.startsWith('data:')) {
    try {
      const matches = doc.url.match(/^data:([^;]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const fileBuffer = Buffer.from(base64Data, 'base64');

        res.setHeader('Content-Type', mimeType);
        res.setHeader(
          'Content-Disposition',
          `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(fileName)}"`
        );
        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(fileBuffer);
      }
    } catch (e) {
      console.error('[Document Server] Base64 decode error:', e);
    }
  }

  // If document has external URL
  if (doc.externalUrl && !doc.url) {
    return res.redirect(doc.externalUrl);
  }

  // If document only has a filename or cannot be decoded, generate a professional document overview
  const safeTitle = isProposal ? 'Project Proposal Document' : 'Contract & Master Services Agreement';
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${fileName}</title>
  <style>
    body { font-family: Helvetica, "Helvetica Neue", Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 40px; }
    .card { max-width: 700px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .brand { font-size: 18px; font-weight: 700; color: #000000; }
    .doc-type { font-size: 12px; font-weight: 600; text-transform: uppercase; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; border: 1px solid #cbd5e1; }
    .meta-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
    .meta-label { color: #64748b; font-weight: 500; }
    .meta-value { font-weight: 600; color: #0f172a; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #e2e8f0; }
    .notes-box { margin-top: 20px; padding: 14px; background: #f8fafc; border-left: 3px solid #000000; border-radius: 0 6px 6px 0; font-size: 12px; line-height: 1.5; color: #334155; }
    .actions { margin-top: 28px; display: flex; gap: 12px; }
    .btn { background: #000000; color: #ffffff; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-block; border: none; }
    .btn-secondary { background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; }
    .footer { margin-top: 32px; font-size: 10px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div>
        <div class="brand">${project.brand || 'Device Doctor India'}</div>
        <div style="font-size: 14px; color: #64748b; margin-top: 4px;">Institutional Enterprise Services</div>
      </div>
      <div class="doc-type">${safeTitle}</div>
    </div>
    <div class="meta-row">
      <span class="meta-label">Project Identifier</span>
      <span class="meta-value" style="font-family: monospace;">${project.id}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Client Account</span>
      <span class="meta-value">${project.clientName || 'Institutional Client'}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Document Filename</span>
      <span class="meta-value" style="font-family: monospace;">${fileName}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Uploaded / Recorded Date</span>
      <span class="meta-value">${doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('en-IN') : 'Active Verification'}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Compliance & Security Status</span>
      <span class="meta-value"><span class="badge">Verified Enterprise Archive</span></span>
    </div>
    ${doc.notes ? `<div class="notes-box"><strong>Attached Notes / Scope Details:</strong><br/>${doc.notes}</div>` : ''}
    <div class="actions">
      <button class="btn" onclick="window.print()">Print Document</button>
      <button class="btn btn-secondary" onclick="window.close()">Close Preview</button>
    </div>
    <div class="footer">Secure Cloud Storage Reference • Azure App Service & SQL Enterprise Partitioning</div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (download) {
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}.html"`);
  } else {
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}.html"`);
  }
  return res.send(htmlContent);
});

// --- UPLOAD & PAYMENT PROOF ISOLATION PIPELINE ---
router.post('/upload-proof', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { fileName, fileType, fileSize, fileData, transactionId, notes } = req.body;
    if (!fileData || typeof fileData !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid or missing file data payload.' });
    }

    // Safety guard: max 25MB base64 payload size limit (~18MB binary)
    if (fileData.length > 25 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Payment proof file exceeds maximum permissible size (10MB limit).' });
    }

    // MIME verification
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    const mimeMatch = fileData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : (fileType || 'image/png').toLowerCase();

    if (!allowedMimes.includes(mimeType) && !mimeType.startsWith('image/')) {
      return res.status(400).json({ success: false, error: 'Unsupported file format. Please upload PNG, JPG, WEBP, or PDF.' });
    }

    // Validate base64 structure to guarantee uncorrupted payload
    if (mimeMatch) {
      const base64Body = fileData.substring(mimeMatch[0].length);
      if (base64Body.length === 0) {
        return res.status(400).json({ success: false, error: 'Empty file buffer received.' });
      }
    }

    const cleanTxId = transactionId ? String(transactionId).replace(/[^a-zA-Z0-9_-]/g, '') : 'TX';
    const uniqueProofId = `PROOF-${cleanTxId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const proofDocument: PaymentProofDocument = {
      id: uniqueProofId,
      name: fileName ? String(fileName).trim() : `Payment_Proof_${cleanTxId}.${mimeType.includes('pdf') ? 'pdf' : 'png'}`,
      size: typeof fileSize === 'number' ? fileSize : Math.round((fileData.length * 3) / 4),
      type: mimeType,
      uploadedAt: new Date().toISOString(),
      url: fileData,
      notes: notes ? String(notes).trim() : '',
    };

    return res.json({ success: true, proofDocument });
  } catch (err: any) {
    console.error('[POST /upload-proof] Failed to process payment proof:', err);
    return res.status(500).json({ success: false, error: 'Internal server error processing payment proof.' });
  }
});

// --- PAYMENTS ---
router.get('/payments', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    const list = mockStore.getPayments(brand);
    return res.json(list.map((p) => ({ ...p, paymentProof: parsePaymentProof(p.paymentProof) })));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT ISNULL(NULLIF(CAST(payment_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as id, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(project_id AS NVARCHAR(150)), '') as projectId, 
               ISNULL(CAST(client_id AS NVARCHAR(100)), '') as clientId, 
               ISNULL(CAST(client_name AS NVARCHAR(255)), '') as clientName,
               ISNULL(CAST(payment_mode AS NVARCHAR(50)), 'GST Invoice') as paymentMode, 
               ISNULL(CAST(bank_account_id AS NVARCHAR(50)), '') as bankAccountId,
               ISNULL(CAST(bank_account_name AS NVARCHAR(255)), '') as bankAccountName,
               ISNULL(CAST(payment_date AS NVARCHAR(50)), '') as paymentDate, 
               ISNULL(CAST(due_date AS NVARCHAR(50)), '') as dueDate,
               ISNULL(amount_received, 0) as amountReceived, 
               ISNULL(CAST(currency AS NVARCHAR(20)), 'INR') as currency, 
               ISNULL(exchange_rate, 1) as exchangeRate,
               ISNULL(amount_inr, 0) as amountINR, 
               ISNULL(CAST(reference_utr AS NVARCHAR(100)), '') as referenceUtr, 
               ISNULL(CAST(payment_status AS NVARCHAR(50)), 'Received') as paymentStatus,
               ISNULL(days_overdue, 0) as daysOverdue, 
               ISNULL(CAST(notes AS NVARCHAR(MAX)), '') as notes, 
               ISNULL(CAST(payment_proof AS NVARCHAR(MAX)), '') as paymentProof,
               ISNULL(CAST(payment_proof_notes AS NVARCHAR(MAX)), '') as paymentProofNotes, 
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt
        FROM payments 
        WHERE (@brandFilter IS NULL OR brand = @brandFilter)
        ORDER BY created_at DESC
      `),
      'payments'
    );
    const parsedRows = (q.recordset || []).map((row: any) => ({
      ...row,
      paymentProof: parsePaymentProof(row.paymentProof),
    }));
    return res.json(parsedRows);
  } catch (err) {
    console.warn('[GET /payments] Falling back to mock store:', err);
    const list = mockStore.getPayments(brand);
    return res.json(list.map((p) => ({ ...p, paymentProof: parsePaymentProof(p.paymentProof) })));
  }
});

router.get('/payments/:id/proof', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();

  try {
    let payment: any = null;
    if (pool) {
      const guidId = toGuid(id);
      const resDb = await executeSqlWithAutoMigration(
        pool,
        () => pool.request().input('id', guidId).input('rawId', id).query(`
          SELECT TOP 1 id, brand, client_name as clientName, amount_inr as amountINR,
                       payment_date as paymentDate, payment_mode as paymentMode,
                       reference_utr as referenceUtr, payment_proof as paymentProof,
                       payment_proof_notes as paymentProofNotes
          FROM payments
          WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId
        `),
        'payments'
      );
      if (resDb.recordset && resDb.recordset.length > 0) {
        payment = resDb.recordset[0];
      }
    }
    if (!payment) {
      payment = mockStore.getPayments(null).find((p) => p.id === id);
    }

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment transaction record not found.' });
    }

    const proofDoc = parsePaymentProof(payment.paymentProof);
    if (!proofDoc) {
      return res.status(404).json({ success: false, error: 'No payment proof document attached to this record.' });
    }

    return res.json({
      success: true,
      paymentId: payment.id,
      proofDocument: proofDoc,
      paymentProofNotes: payment.paymentProofNotes || proofDoc.notes || '',
    });
  } catch (err: any) {
    console.error(`[GET /payments/${id}/proof] Error:`, err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve payment proof.' });
  }
});

/**
 * Synchronizes a payment record into the gst_invoices table in Azure SQL and mockStore
 * Whenever payment_mode === 'GST Invoice', captures:
 * - Payment ID, Project ID, Client ID, Client Name, Payment Date
 * - Amount Received, Currency, Amount INR
 * - Calculation of 18% GST output tax: Math.round(amountINR * 0.18)
 * - Zoho Invoice number placeholder (e.g., INV-YYYY-SEQ or preserves existing)
 * - Portal status ('No' by default)
 */
export async function syncPaymentToGstInvoiceSql(
  pool: sql.ConnectionPool | null,
  payment: Payment
): Promise<GstInvoice | null> {
  if (payment.paymentMode !== 'GST Invoice') {
    return null;
  }

  const brand = sanitizeBrand(payment.brand, null) || 'Device Doctor India';
  const amountReceived = Number(payment.amountReceived) || 0;
  const currency = payment.currency || 'INR';
  const amountINR = Number(payment.amountINR) || Number(payment.amountReceived) || 0;
  const gstAmountINR = Math.round(amountINR * 0.18);
  const paymentDate = payment.paymentDate || new Date().toISOString().slice(0, 10);
  const year = new Date(paymentDate).getFullYear() || new Date().getFullYear();
  const cleanPaySuffix = (payment.id || '').replace(/^([A-Z]+-)?(PAY-)?/i, '') || '001';
  const defaultInvoiceNum = `INV-${year}-${cleanPaySuffix}`;
  let clientName = payment.clientName || '';
  let clientId = payment.clientId || '';
  let projectId = payment.projectId || '';

  // Synchronize mockStore in-memory cache first
  const mockSynced = mockStore.syncPaymentToGstInvoice(payment);

  if (!pool) {
    return mockSynced;
  }

  try {
    // If client details are missing, lookup from projects table
    if ((!clientName || !clientId) && projectId) {
      try {
        const projRes = await pool.request()
          .input('projectId', projectId)
          .query(`
            SELECT TOP 1 
              ISNULL(CAST(client_name AS NVARCHAR(255)), '') as clientName,
              ISNULL(CAST(client_id AS NVARCHAR(100)), '') as clientId
            FROM projects
            WHERE id = @projectId OR project_id_code = @projectId
          `);
        if (projRes.recordset && projRes.recordset.length > 0) {
          if (!clientName) clientName = projRes.recordset[0].clientName;
          if (!clientId) clientId = projRes.recordset[0].clientId;
        }
      } catch (err) {
        console.warn('[syncPaymentToGstInvoiceSql] Project lookup error:', err);
      }
    }

    const payId = payment.id || '';

    // Check if GST invoice already exists for this payment_id
    const checkRes = await pool.request()
      .input('paymentId', payId)
      .query(`
        SELECT TOP 1 
          CAST(id AS NVARCHAR(100)) as id,
          ISNULL(CAST(invoice_number AS NVARCHAR(100)), '') as invoiceNumber,
          ISNULL(CAST(uploaded_to_gst_portal AS NVARCHAR(10)), 'No') as uploadedToGstPortal,
          ISNULL(CAST(gst_portal_upload_date AS NVARCHAR(50)), '') as gstPortalUploadDate,
          ISNULL(CAST(notes AS NVARCHAR(MAX)), '') as notes
        FROM gst_invoices
        WHERE payment_id = @paymentId
      `);

    const existingRow = checkRes.recordset?.[0];
    const now = new Date().toISOString();

    if (existingRow) {
      const finalInvoiceNumber = (existingRow.invoiceNumber && existingRow.invoiceNumber.trim() !== '')
        ? existingRow.invoiceNumber
        : defaultInvoiceNum;

      await pool.request()
        .input('id', existingRow.id)
        .input('brand', brand)
        .input('payment_id', payId)
        .input('project_id', projectId)
        .input('client_id', clientId)
        .input('client_name', clientName || 'Direct Client')
        .input('payment_date', paymentDate)
        .input('amount_received', amountReceived)
        .input('currency', currency)
        .input('amount_inr', amountINR)
        .input('gst_amount_inr', gstAmountINR)
        .input('invoice_number', finalInvoiceNumber)
        .input('updated_at', now)
        .query(`
          UPDATE gst_invoices
          SET brand=@brand, project_id=@project_id, client_id=@client_id, client_name=@client_name,
              payment_date=@payment_date, amount_received=@amount_received, currency=@currency,
              amount_inr=@amount_inr, gst_amount_inr=@gst_amount_inr, invoice_number=@invoice_number,
              updated_at=@updated_at
          WHERE id = @id OR payment_id = @payment_id
        `);

      const synced: GstInvoice = {
        id: existingRow.id,
        brand: brand as any,
        paymentId: payId,
        projectId,
        clientId,
        clientName: clientName || 'Direct Client',
        paymentDate,
        amountReceived,
        currency: currency as any,
        amountINR,
        gstAmountINR,
        invoiceNumber: finalInvoiceNumber,
        uploadedToGstPortal: existingRow.uploadedToGstPortal,
        gstPortalUploadDate: existingRow.gstPortalUploadDate,
        notes: existingRow.notes,
        createdAt: now,
        updatedAt: now,
      };
      mockStore.saveGstInvoice(synced);
      return synced;
    } else {
      const prefix = getBrandSemanticPrefix(brand);
      const pattern = `${prefix}-GST-%`;
      let nextSeq = 1;

      try {
        const seqRes = await pool.request()
          .input('pattern', pattern)
          .query(`SELECT CAST(id AS NVARCHAR(100)) as id FROM gst_invoices WHERE id LIKE @pattern`);
        const rows = seqRes.recordset || [];
        for (const row of rows) {
          const match = (row.id || '').match(new RegExp(`^${prefix}-GST-(\\d+)`, 'i'));
          if (match) {
            const num = parseInt(match[1], 10);
            if (num >= nextSeq) nextSeq = num + 1;
          }
        }
      } catch (err) {
        console.warn('[syncPaymentToGstInvoiceSql] Sequence calc notice, using fallback:', err);
        nextSeq = mockStore.getNextGstInvoiceSequence(brand);
      }

      const gstId = `${prefix}-GST-${String(nextSeq).padStart(3, '0')}`;
      const autoNotes = payment.notes
        ? `Auto-synced from Payment ${payId} (GST Invoice Mode). ${payment.notes}`
        : `Auto-synced from Payment ${payId} (GST Invoice Mode)`;

      await pool.request()
        .input('id', gstId)
        .input('brand', brand)
        .input('payment_id', payId)
        .input('project_id', projectId)
        .input('client_id', clientId)
        .input('client_name', clientName || 'Direct Client')
        .input('payment_date', paymentDate)
        .input('amount_received', amountReceived)
        .input('currency', currency)
        .input('amount_inr', amountINR)
        .input('gst_amount_inr', gstAmountINR)
        .input('invoice_number', defaultInvoiceNum)
        .input('uploaded_to_gst_portal', 'No')
        .input('gst_portal_upload_date', '')
        .input('notes', autoNotes)
        .input('created_at', now)
        .input('updated_at', now)
        .query(`
          INSERT INTO gst_invoices (
            id, brand, payment_id, project_id, client_id, client_name,
            payment_date, amount_received, currency, amount_inr, gst_amount_inr,
            invoice_number, uploaded_to_gst_portal, gst_portal_upload_date, notes,
            created_at, updated_at
          ) VALUES (
            @id, @brand, @payment_id, @project_id, @client_id, @client_name,
            @payment_date, @amount_received, @currency, @amount_inr, @gst_amount_inr,
            @invoice_number, @uploaded_to_gst_portal, @gst_portal_upload_date, @notes,
            @created_at, @updated_at
          )
        `);

      const createdInv: GstInvoice = {
        id: gstId,
        brand: brand as any,
        paymentId: payId,
        projectId,
        clientId,
        clientName: clientName || 'Direct Client',
        paymentDate,
        amountReceived,
        currency: currency as any,
        amountINR,
        gstAmountINR,
        invoiceNumber: defaultInvoiceNum,
        uploadedToGstPortal: 'No',
        gstPortalUploadDate: '',
        notes: autoNotes,
        createdAt: now,
        updatedAt: now,
      };

      mockStore.saveGstInvoice(createdInv);
      return createdInv;
    }
  } catch (err) {
    console.warn('[syncPaymentToGstInvoiceSql] Error syncing to SQL, returning mockStore copy:', err);
    return mockSynced;
  }
}

async function handleSavePaymentRoute(req: Request, res: Response) {
  const payment: Payment = req.body;
  const brandContext = getBrandContext(req);
  payment.brand = sanitizeBrand(payment.brand, brandContext) as any;
  const now = new Date().toISOString();
  payment.updatedAt = now;
  payment.createdAt = payment.createdAt || now;

  payment.id = (payment.id || '').trim() || generateSemanticEntityId('PAY', payment.brand, mockStore.getPayments(payment.brand));

  // Normalize payment proof into a clean object or undefined
  payment.paymentProof = parsePaymentProof(payment.paymentProof);
  const serializedProof = serializePaymentProof(payment.paymentProof);

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.savePayment(payment);
    const syncedGst = saved.paymentMode === 'GST Invoice' ? mockStore.syncPaymentToGstInvoice(saved) : null;
    return res.json({
      success: true,
      payment: { ...saved, paymentProof: parsePaymentProof(saved.paymentProof) },
      gstInvoiceSynced: !!syncedGst,
      gstInvoice: syncedGst,
    });
  }

  try {
    const guidId = toGuid(payment.id);
    const projGuid = toGuidOrNull(payment.projectId);
    const clientGuid = toGuidOrNull(payment.clientId);
    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', payment.id || '')
          .input('brand', payment.brand || 'Device Doctor India')
          .input('project_id', projGuid)
          .input('client_id', clientGuid)
          .input('client_name', payment.clientName || '')
          .input('payment_mode', payment.paymentMode || 'GST Invoice')
          .input('bank_account_id', payment.bankAccountId || '')
          .input('bank_account_name', payment.bankAccountName || '')
          .input('payment_date', payment.paymentDate || '')
          .input('due_date', payment.dueDate || '')
          .input('amount_received', payment.amountReceived || 0)
          .input('currency', payment.currency || 'INR')
          .input('exchange_rate', payment.exchangeRate || 1)
          .input('amount_inr', payment.amountINR || 0)
          .input('reference_utr', payment.referenceUtr || '')
          .input('payment_status', payment.paymentStatus || 'Received')
          .input('days_overdue', payment.daysOverdue || 0)
          .input('notes', payment.notes || '')
          .input('payment_proof', serializedProof)
          .input('payment_proof_notes', payment.paymentProofNotes || (payment.paymentProof?.notes || ''))
          .input('created_at', payment.createdAt)
          .input('updated_at', payment.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM payments WHERE id = @id OR (payment_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL))
              UPDATE payments SET brand=@brand, project_id=@project_id, client_id=@client_id, client_name=@client_name,
                                 payment_mode=@payment_mode, bank_account_id=@bank_account_id, bank_account_name=@bank_account_name,
                                 payment_date=@payment_date, due_date=@due_date,
                                 amount_received=@amount_received, currency=@currency, exchange_rate=@exchange_rate,
                                 amount_inr=@amount_inr, reference_utr=@reference_utr, payment_status=@payment_status,
                                 days_overdue=@days_overdue, notes=@notes, payment_proof=@payment_proof,
                                 payment_proof_notes=@payment_proof_notes, updated_at=@updated_at,
                                 payment_id_code=@rawId
              WHERE id = @id OR (payment_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL)
            ELSE
              INSERT INTO payments (id, payment_id_code, brand, project_id, client_id, client_name, payment_mode, bank_account_id, bank_account_name, payment_date, due_date, amount_received, currency, exchange_rate, amount_inr, reference_utr, payment_status, days_overdue, notes, payment_proof, payment_proof_notes, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @project_id, @client_id, @client_name, @payment_mode, @bank_account_id, @bank_account_name, @payment_date, @due_date, @amount_received, @currency, @exchange_rate, @amount_inr, @reference_utr, @payment_status, @days_overdue, @notes, @payment_proof, @payment_proof_notes, @created_at, @updated_at)
          `),
      'payments'
    );

    mockStore.savePayment(payment);

    // Automatic GST Invoice synchronization trigger whenever paymentMode === 'GST Invoice'
    let syncedGstInvoice: GstInvoice | null = null;
    if (payment.paymentMode === 'GST Invoice') {
      syncedGstInvoice = await syncPaymentToGstInvoiceSql(pool, payment);
    }

    return res.json({
      success: true,
      payment,
      gstInvoiceSynced: !!syncedGstInvoice,
      gstInvoice: syncedGstInvoice,
    });
  } catch (err) {
    console.warn('[handleSavePaymentRoute] Falling back to mock store:', err);
    const saved = mockStore.savePayment(payment);
    const syncedGst = saved.paymentMode === 'GST Invoice' ? mockStore.syncPaymentToGstInvoice(saved) : null;
    return res.json({
      success: true,
      payment: { ...saved, paymentProof: parsePaymentProof(saved.paymentProof) },
      gstInvoiceSynced: !!syncedGst,
      gstInvoice: syncedGst,
    });
  }
}

router.post('/payments', authenticateToken, handleSavePaymentRoute);
router.put('/payments/:id', authenticateToken, (req: Request, res: Response) => {
  req.body.id = req.params.id;
  return handleSavePaymentRoute(req, res);
});

router.delete('/payments/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const brand = getBrandContext(req);
  const brandFilter = (brand && brand !== 'All') ? brand : null;
  const pool = await getOrInitPool();

  if (!pool) {
    const deleted = mockStore.deletePayment(id, brandFilter);
    if (!deleted) {
      return res.status(403).json({
        success: false,
        error: 'Deletion prevented: Payment voucher belongs to another workspace brand or does not exist.',
      });
    }
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    const checkRes = await pool.request()
      .input('id', guidId)
      .input('rawId', id)
      .query(`
        SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id,
                     ISNULL(CAST(payment_id_code AS NVARCHAR(150)), '') as payment_id_code,
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand
        FROM payments 
        WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR payment_id_code = @rawId
      `);

    const existing = checkRes.recordset?.[0];
    if (existing && brandFilter && existing.brand && existing.brand !== 'All' && existing.brand !== brandFilter) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: Payment voucher belongs to workspace "${existing.brand}", but current workspace is "${brandFilter}".`
      });
    }

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .query(`
          DELETE FROM payments 
          WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR payment_id_code = @rawId)
            AND (@brandFilter IS NULL OR brand = @brandFilter);
          
          DELETE FROM gst_invoices 
          WHERE (payment_id = @id OR payment_id = @rawId) 
            AND (uploaded_to_gst_portal = 'No' OR uploaded_to_gst_portal IS NULL);
        `),
      'payments'
    );
    mockStore.deletePayment(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DELETE /payments/${id}] Falling back to mock store:`, errMsg);
    mockStore.deletePayment(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- BANK ACCOUNTS ---
router.get('/bank-accounts', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getBankAccounts(brand));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT ISNULL(NULLIF(CAST(account_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as id, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(account_name AS NVARCHAR(255)), '') as accountName, 
               ISNULL(CAST(bank_name AS NVARCHAR(255)), '') as bankName, 
               ISNULL(CAST(account_number AS NVARCHAR(150)), '') as accountNumber,
               ISNULL(CAST(ifsc_code AS NVARCHAR(50)), '') as ifscCode, 
               ISNULL(CAST(branch_name AS NVARCHAR(100)), '') as branchName, 
               ISNULL(CAST(upi_id AS NVARCHAR(100)), '') as upiId,
               ISNULL(CAST(account_type AS NVARCHAR(50)), 'Current') as accountType,
               ISNULL(CAST(status AS NVARCHAR(50)), 'Active') as status, 
               ISNULL(CAST(notes AS NVARCHAR(MAX)), '') as notes, 
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt
        FROM bank_accounts 
        WHERE (@brandFilter IS NULL OR brand = @brandFilter)
        ORDER BY created_at DESC
      `),
      'bank_accounts'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /bank-accounts] Falling back to mock store:', err);
    return res.json(mockStore.getBankAccounts(brand));
  }
});

async function handleSaveBankAccountRoute(req: Request, res: Response) {
  const account: BankAccount = req.body;
  const brandContext = getBrandContext(req);
  account.brand = sanitizeBrand(account.brand, brandContext) as any;
  const now = new Date().toISOString();
  account.updatedAt = now;
  account.createdAt = account.createdAt || now;

  account.id = (account.id || '').trim() || generateSemanticEntityId('ACC', account.brand, mockStore.getBankAccounts(account.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveBankAccount(account);
    return res.json({ success: true, bankAccount: saved });
  }

  try {
    const guidId = toGuid(account.id);
    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', account.id || '')
          .input('brand', account.brand || 'Device Doctor India')
          .input('account_name', account.accountName || '')
          .input('bank_name', account.bankName || '')
          .input('account_number', account.accountNumber || '')
          .input('ifsc_code', account.ifscCode || '')
          .input('branch_name', account.branchName || '')
          .input('upi_id', account.upiId || '')
          .input('account_type', account.accountType || 'Current')
          .input('status', account.status || 'Active')
          .input('notes', account.notes || '')
          .input('created_at', account.createdAt)
          .input('updated_at', account.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM bank_accounts WHERE id = @id OR (account_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL))
              UPDATE bank_accounts 
              SET brand=@brand, account_name=@account_name, bank_name=@bank_name, account_number=@account_number,
                  ifsc_code=@ifsc_code, branch_name=@branch_name, upi_id=@upi_id, account_type=@account_type,
                  status=@status, notes=@notes, updated_at=@updated_at, account_id_code=@rawId
              WHERE id = @id OR (account_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL)
            ELSE
              INSERT INTO bank_accounts (id, account_id_code, brand, account_name, bank_name, account_number, ifsc_code, branch_name, upi_id, account_type, status, notes, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @account_name, @bank_name, @account_number, @ifsc_code, @branch_name, @upi_id, @account_type, @status, @notes, @created_at, @updated_at)
          `),
      'bank_accounts'
    );
    mockStore.saveBankAccount(account);
    return res.json({ success: true, bankAccount: account });
  } catch (err) {
    console.warn('[handleSaveBankAccountRoute] Falling back to mock store:', err);
    const saved = mockStore.saveBankAccount(account);
    return res.json({ success: true, bankAccount: saved });
  }
}

router.post('/bank-accounts', authenticateToken, handleSaveBankAccountRoute);
router.put('/bank-accounts/:id', authenticateToken, (req: Request, res: Response) => {
  req.body.id = req.params.id;
  return handleSaveBankAccountRoute(req, res);
});

router.delete('/bank-accounts/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const brand = getBrandContext(req);
  const brandFilter = (brand && brand !== 'All') ? brand : null;
  const pool = await getOrInitPool();

  if (!pool) {
    const deleted = mockStore.deleteBankAccount(id, brandFilter);
    if (!deleted) {
      return res.status(403).json({
        success: false,
        error: 'Deletion prevented: Bank account belongs to another workspace brand or does not exist.',
      });
    }
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    const checkRes = await pool.request()
      .input('id', guidId)
      .input('rawId', id)
      .query(`
        SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id,
                     ISNULL(CAST(account_id_code AS NVARCHAR(150)), '') as account_id_code,
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand,
                     ISNULL(CAST(account_name AS NVARCHAR(255)), '') as account_name
        FROM bank_accounts 
        WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR account_id_code = @rawId
      `);

    const existing = checkRes.recordset?.[0];
    if (existing && brandFilter && existing.brand && existing.brand !== 'All' && existing.brand !== brandFilter) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: Bank account belongs to workspace "${existing.brand}", but current workspace is "${brandFilter}".`
      });
    }

    if (existing) {
      const depRes = await pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('accName', existing.account_name || '')
        .query(`
          SELECT COUNT(1) as payCount 
          FROM payments 
          WHERE bank_account = @rawId OR bank_account = @accName OR bank_account = CAST(@id AS NVARCHAR(150)) OR bank_account_id = @id OR bank_account_id = @rawId
        `);
      const payCount = Number(depRes.recordset?.[0]?.payCount || 0);
      if (payCount > 0) {
        return res.status(409).json({
          success: false,
          error: `Cannot delete bank account "${existing.account_name || id}": ${payCount} payment(s) are linked to it. Please reassign payments first.`
        });
      }
    }

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .query(`
          DELETE FROM bank_accounts 
          WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR account_id_code = @rawId)
            AND (@brandFilter IS NULL OR brand = @brandFilter)
        `),
      'bank_accounts'
    );
    mockStore.deleteBankAccount(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DELETE /bank-accounts/${id}] Falling back to mock store:`, errMsg);
    mockStore.deleteBankAccount(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- GST INVOICES ---
router.get('/gst-invoices', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getGstInvoices(brand));
  }

  try {
    // Self-healing synchronization: auto-sync any payment where payment_mode = 'GST Invoice' lacking a gst_invoices row
    try {
      const unsyncedRes = await pool.request()
        .query(`
          SELECT 
            CAST(p.id AS NVARCHAR(100)) as id,
            ISNULL(CAST(p.payment_id_code AS NVARCHAR(100)), '') as paymentIdCode,
            ISNULL(CAST(p.brand AS NVARCHAR(100)), 'Device Doctor India') as brand,
            ISNULL(CAST(p.project_id AS NVARCHAR(150)), '') as projectId,
            ISNULL(CAST(p.client_id AS NVARCHAR(100)), '') as clientId,
            ISNULL(CAST(p.client_name AS NVARCHAR(255)), '') as clientName,
            ISNULL(CAST(p.payment_date AS NVARCHAR(50)), '') as paymentDate,
            ISNULL(p.amount_received, 0) as amountReceived,
            ISNULL(CAST(p.currency AS NVARCHAR(20)), 'INR') as currency,
            ISNULL(p.amount_inr, 0) as amountINR,
            ISNULL(CAST(p.notes AS NVARCHAR(MAX)), '') as notes
          FROM payments p
          WHERE (p.payment_mode = 'GST Invoice' OR p.payment_mode = N'GST Invoice')
            AND NOT EXISTS (
              SELECT 1 FROM gst_invoices g 
              WHERE g.payment_id = p.id 
                 OR g.payment_id = p.payment_id_code 
                 OR (p.payment_id_code IS NOT NULL AND p.payment_id_code <> '' AND g.payment_id = p.payment_id_code)
            )
        `);

      const unsyncedList = unsyncedRes.recordset || [];
      for (const un of unsyncedList) {
        const dummyPay: Payment = {
          id: un.paymentIdCode || un.id,
          brand: un.brand as any,
          projectId: un.projectId,
          clientId: un.clientId,
          clientName: un.clientName,
          paymentMode: 'GST Invoice',
          paymentDate: un.paymentDate,
          dueDate: un.paymentDate,
          amountReceived: un.amountReceived,
          currency: un.currency as any,
          exchangeRate: 1,
          amountINR: un.amountINR,
          referenceUtr: '',
          paymentStatus: 'Received',
          daysOverdue: 0,
          notes: un.notes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await syncPaymentToGstInvoiceSql(pool, dummyPay);
      }
    } catch (syncErr) {
      console.warn('[GET /gst-invoices] Notice during self-healing payment sync:', syncErr);
    }

    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT ISNULL(NULLIF(CAST(invoice_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as id, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(payment_id AS NVARCHAR(100)), '') as paymentId, 
               ISNULL(CAST(project_id AS NVARCHAR(150)), '') as projectId, 
               ISNULL(CAST(client_id AS NVARCHAR(100)), '') as clientId,
               ISNULL(CAST(client_name AS NVARCHAR(255)), '') as clientName, 
               ISNULL(CAST(payment_date AS NVARCHAR(50)), '') as paymentDate, 
               ISNULL(amount_received, 0) as amountReceived, 
               ISNULL(CAST(currency AS NVARCHAR(20)), 'INR') as currency, 
               ISNULL(amount_inr, 0) as amountINR, 
               ISNULL(gst_amount_inr, 0) as gstAmountINR, 
               ISNULL(CAST(invoice_number AS NVARCHAR(100)), '') as invoiceNumber,
               ISNULL(CAST(uploaded_to_gst_portal AS NVARCHAR(10)), 'No') as uploadedToGstPortal, 
               ISNULL(CAST(gst_portal_upload_date AS NVARCHAR(50)), '') as gstPortalUploadDate,
               ISNULL(CAST(notes AS NVARCHAR(MAX)), '') as notes, 
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt
        FROM gst_invoices 
        WHERE (@brandFilter IS NULL OR brand = @brandFilter)
        ORDER BY created_at DESC
      `),
      'gst_invoices'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /gst-invoices] Falling back to mock store:', err);
    return res.json(mockStore.getGstInvoices(brand));
  }
});

// Explicit Sync endpoint to synchronize all payments where paymentMode === 'GST Invoice'
router.post('/gst-invoices/sync', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();

  if (!pool) {
    const resSync = mockStore.syncAllGstInvoicesFromPayments();
    return res.json({ success: true, count: resSync.count, invoices: mockStore.getGstInvoices(brand) });
  }

  try {
    const paymentsRes = await pool.request()
      .input('brandFilter', brand || null)
      .query(`
        SELECT CAST(id AS NVARCHAR(100)) as id,
               ISNULL(CAST(payment_id_code AS NVARCHAR(100)), '') as paymentIdCode,
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand,
               ISNULL(CAST(project_id AS NVARCHAR(150)), '') as projectId,
               ISNULL(CAST(client_id AS NVARCHAR(100)), '') as clientId,
               ISNULL(CAST(client_name AS NVARCHAR(255)), '') as clientName,
               ISNULL(CAST(payment_date AS NVARCHAR(50)), '') as paymentDate,
               ISNULL(amount_received, 0) as amountReceived,
               ISNULL(CAST(currency AS NVARCHAR(20)), 'INR') as currency,
               ISNULL(amount_inr, 0) as amountINR,
               ISNULL(CAST(notes AS NVARCHAR(MAX)), '') as notes
        FROM payments
        WHERE (payment_mode = 'GST Invoice' OR payment_mode = N'GST Invoice')
          AND (@brandFilter IS NULL OR brand = @brandFilter)
      `);

    const paymentsList = paymentsRes.recordset || [];
    let syncedCount = 0;
    for (const p of paymentsList) {
      const payObj: Payment = {
        id: p.paymentIdCode || p.id,
        brand: p.brand as any,
        projectId: p.projectId,
        clientId: p.clientId,
        clientName: p.clientName,
        paymentMode: 'GST Invoice',
        paymentDate: p.paymentDate,
        dueDate: p.paymentDate,
        amountReceived: p.amountReceived,
        currency: p.currency as any,
        exchangeRate: 1,
        amountINR: p.amountINR,
        referenceUtr: '',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: p.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await syncPaymentToGstInvoiceSql(pool, payObj);
      syncedCount++;
    }

    const allInvoices = await pool.request()
      .input('brandFilter', brand || null)
      .query(`
        SELECT ISNULL(NULLIF(CAST(invoice_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as id, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(payment_id AS NVARCHAR(100)), '') as paymentId, 
               ISNULL(CAST(project_id AS NVARCHAR(150)), '') as projectId, 
               ISNULL(CAST(client_id AS NVARCHAR(100)), '') as clientId,
               ISNULL(CAST(client_name AS NVARCHAR(255)), '') as clientName, 
               ISNULL(CAST(payment_date AS NVARCHAR(50)), '') as paymentDate, 
               ISNULL(amount_received, 0) as amountReceived, 
               ISNULL(CAST(currency AS NVARCHAR(20)), 'INR') as currency, 
               ISNULL(amount_inr, 0) as amountINR, 
               ISNULL(gst_amount_inr, 0) as gstAmountINR, 
               ISNULL(CAST(invoice_number AS NVARCHAR(100)), '') as invoiceNumber,
               ISNULL(CAST(uploaded_to_gst_portal AS NVARCHAR(10)), 'No') as uploadedToGstPortal, 
               ISNULL(CAST(gst_portal_upload_date AS NVARCHAR(50)), '') as gstPortalUploadDate,
               ISNULL(CAST(notes AS NVARCHAR(MAX)), '') as notes, 
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt
        FROM gst_invoices 
        WHERE (@brandFilter IS NULL OR brand = @brandFilter)
        ORDER BY created_at DESC
      `);

    return res.json({ success: true, count: syncedCount, invoices: allInvoices.recordset || [] });
  } catch (err: any) {
    console.warn('[POST /gst-invoices/sync] Error syncing:', err);
    const mockRes = mockStore.syncAllGstInvoicesFromPayments();
    return res.json({ success: true, count: mockRes.count, invoices: mockStore.getGstInvoices(brand) });
  }
});

async function handleSaveGstInvoiceRoute(req: Request, res: Response) {
  const inv: GstInvoice = req.body;
  const brandContext = getBrandContext(req);
  inv.brand = sanitizeBrand(inv.brand, brandContext) as any;
  const now = new Date().toISOString();
  inv.updatedAt = now;
  inv.createdAt = inv.createdAt || now;

  inv.id = (inv.id || '').trim() || generateSemanticEntityId('GST', inv.brand, mockStore.getGstInvoices(inv.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveGstInvoice(inv);
    return res.json({ success: true, invoice: saved });
  }

  try {
    const guidId = toGuid(inv.id);
    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', inv.id || '')
          .input('brand', inv.brand || 'Device Doctor India')
          .input('payment_id', inv.paymentId || '')
          .input('project_id', inv.projectId || '')
          .input('client_id', inv.clientId || '')
          .input('client_name', inv.clientName || '')
          .input('payment_date', inv.paymentDate || '')
          .input('amount_received', inv.amountReceived || 0)
          .input('currency', inv.currency || 'INR')
          .input('amount_inr', inv.amountINR || 0)
          .input('gst_amount_inr', inv.gstAmountINR || 0)
          .input('invoice_number', inv.invoiceNumber || '')
          .input('uploaded_to_gst_portal', inv.uploadedToGstPortal || 'No')
          .input('gst_portal_upload_date', inv.gstPortalUploadDate || '')
          .input('notes', inv.notes || '')
          .input('created_at', inv.createdAt)
          .input('updated_at', inv.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM gst_invoices WHERE id = @id OR (invoice_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (payment_id = @payment_id AND @payment_id <> '' AND @payment_id IS NOT NULL))
              UPDATE gst_invoices SET brand=@brand, payment_id=@payment_id, project_id=@project_id, client_id=@client_id,
                                     client_name=@client_name, payment_date=@payment_date, amount_received=@amount_received,
                                     currency=@currency, amount_inr=@amount_inr, gst_amount_inr=@gst_amount_inr,
                                     invoice_number=@invoice_number, uploaded_to_gst_portal=@uploaded_to_gst_portal,
                                     gst_portal_upload_date=@gst_portal_upload_date, notes=@notes, updated_at=@updated_at,
                                     invoice_id_code=@rawId
              WHERE id = @id OR (invoice_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (payment_id = @payment_id AND @payment_id <> '' AND @payment_id IS NOT NULL)
            ELSE
              INSERT INTO gst_invoices (id, invoice_id_code, brand, payment_id, project_id, client_id, client_name, payment_date, amount_received, currency, amount_inr, gst_amount_inr, invoice_number, uploaded_to_gst_portal, gst_portal_upload_date, notes, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @payment_id, @project_id, @client_id, @client_name, @payment_date, @amount_received, @currency, @amount_inr, @gst_amount_inr, @invoice_number, @uploaded_to_gst_portal, @gst_portal_upload_date, @notes, @created_at, @updated_at)
          `),
      'gst_invoices'
    );
    mockStore.saveGstInvoice(inv);
    return res.json({ success: true, invoice: inv });
  } catch (err) {
    console.warn('[handleSaveGstInvoiceRoute] Falling back to mock store:', err);
    const saved = mockStore.saveGstInvoice(inv);
    return res.json({ success: true, invoice: saved });
  }
}

router.post('/gst-invoices', authenticateToken, handleSaveGstInvoiceRoute);
router.put('/gst-invoices/:id', authenticateToken, (req: Request, res: Response) => {
  req.body.id = req.params.id;
  return handleSaveGstInvoiceRoute(req, res);
});

router.delete('/gst-invoices/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const brand = getBrandContext(req);
  const brandFilter = (brand && brand !== 'All') ? brand : null;
  const pool = await getOrInitPool();

  if (!pool) {
    const deleted = mockStore.deleteGstInvoice(id, brandFilter);
    if (!deleted) {
      return res.status(403).json({
        success: false,
        error: 'Deletion prevented: GST Invoice belongs to another workspace brand or does not exist.',
      });
    }
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    const checkRes = await pool.request()
      .input('id', guidId)
      .input('rawId', id)
      .query(`
        SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id,
                     ISNULL(CAST(invoice_id_code AS NVARCHAR(150)), '') as invoice_id_code,
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand,
                     ISNULL(CAST(invoice_number AS NVARCHAR(150)), '') as invoice_number,
                     ISNULL(CAST(uploaded_to_gst_portal AS NVARCHAR(20)), 'No') as uploaded_to_gst_portal
        FROM gst_invoices 
        WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR invoice_id_code = @rawId
      `);

    const existing = checkRes.recordset?.[0];
    if (existing && brandFilter && existing.brand && existing.brand !== 'All' && existing.brand !== brandFilter) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: GST Invoice belongs to workspace "${existing.brand}", but current workspace is "${brandFilter}".`
      });
    }

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .query(`
          DELETE FROM gst_invoices 
          WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR invoice_id_code = @rawId)
            AND (@brandFilter IS NULL OR brand = @brandFilter)
        `),
      'gst_invoices'
    );
    mockStore.deleteGstInvoice(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DELETE /gst-invoices/${id}] Falling back to mock store:`, errMsg);
    mockStore.deleteGstInvoice(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- EMPLOYEE ROLES ---
router.get('/roles', async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getEmployeeRoles(brand));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT ISNULL(NULLIF(CAST(role_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as id, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(role_name AS NVARCHAR(255)), ISNULL(CAST(name AS NVARCHAR(255)), '')) as roleName, 
               ISNULL(CAST(department AS NVARCHAR(255)), '') as department, 
               ISNULL(CAST(status AS NVARCHAR(50)), 'Active') as status, 
               ISNULL(CAST(description AS NVARCHAR(MAX)), '') as description, 
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt 
        FROM employee_roles 
        WHERE (@brandFilter IS NULL OR brand = @brandFilter)
        ORDER BY created_at DESC
      `),
      'employee_roles'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /roles] Falling back to mock store:', err);
    return res.json(mockStore.getEmployeeRoles(brand));
  }
});

async function handleSaveRoleRoute(req: Request, res: Response) {
  const role: EmployeeRole = req.body;
  const brandContext = getBrandContext(req);
  role.brand = sanitizeBrand(role.brand, brandContext) as any;
  const now = new Date().toISOString();
  role.updatedAt = now;
  role.createdAt = role.createdAt || now;

  role.id = (role.id || '').trim() || generateSemanticEntityId('ROL', role.brand, mockStore.getEmployeeRoles(role.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveEmployeeRole(role);
    return res.json({ success: true, role: saved });
  }

  try {
    const guidId = toGuid(role.id);
    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', role.id || '')
          .input('brand', role.brand || 'Device Doctor India')
          .input('role_name', role.roleName)
          .input('department', role.department || '')
          .input('status', role.status || 'Active')
          .input('description', role.description || '')
          .input('created_at', role.createdAt)
          .input('updated_at', role.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM employee_roles WHERE id = @id OR (role_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL))
              UPDATE employee_roles SET brand=@brand, role_name=@role_name, name=@role_name, department=@department, status=@status, description=@description, updated_at=@updated_at, role_id_code=@rawId 
              WHERE id = @id OR (role_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL)
            ELSE
              INSERT INTO employee_roles (id, role_id_code, brand, role_name, name, department, status, description, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @role_name, @role_name, @department, @status, @description, @created_at, @updated_at)
          `),
      'employee_roles'
    );
    mockStore.saveEmployeeRole(role);
    return res.json({ success: true, role });
  } catch (err) {
    console.warn('[handleSaveRoleRoute] Falling back to mock store:', err);
    const saved = mockStore.saveEmployeeRole(role);
    return res.json({ success: true, role: saved });
  }
}

router.post('/roles', handleSaveRoleRoute);
router.put('/roles/:id', (req: Request, res: Response) => {
  req.body.id = req.params.id;
  return handleSaveRoleRoute(req, res);
});

router.delete('/roles/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const brand = getBrandContext(req);
  const brandFilter = (brand && brand !== 'All') ? brand : null;
  const pool = await getOrInitPool();

  if (!pool) {
    const deleted = mockStore.deleteEmployeeRole(id, brandFilter);
    if (!deleted) {
      return res.status(403).json({
        success: false,
        error: 'Deletion prevented: Role belongs to another workspace brand or does not exist.',
      });
    }
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    const checkRes = await pool.request()
      .input('id', guidId)
      .input('rawId', id)
      .query(`
        SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id,
                     ISNULL(CAST(role_id_code AS NVARCHAR(150)), '') as role_id_code,
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand,
                     ISNULL(CAST(role_name AS NVARCHAR(255)), '') as role_name
        FROM employee_roles 
        WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR role_id_code = @rawId
      `);

    const existing = checkRes.recordset?.[0];
    if (existing && brandFilter && existing.brand && existing.brand !== 'All' && existing.brand !== brandFilter) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: Role belongs to workspace "${existing.brand}", but current workspace is "${brandFilter}".`
      });
    }

    if (existing) {
      const depRes = await pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .query(`
          SELECT COUNT(1) as empCount 
          FROM employees 
          WHERE role_id = @id OR role_id = @rawId
        `);
      const empCount = Number(depRes.recordset?.[0]?.empCount || 0);
      if (empCount > 0) {
        return res.status(409).json({
          success: false,
          error: `Cannot delete role "${existing.role_name || id}": ${empCount} employee(s) are assigned to this role.`
        });
      }
    }

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .query(`
          DELETE FROM employee_roles 
          WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR role_id_code = @rawId)
            AND (@brandFilter IS NULL OR brand = @brandFilter)
        `),
      'employee_roles'
    );
    mockStore.deleteEmployeeRole(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DELETE /roles/${id}] Falling back to mock store:`, errMsg);
    mockStore.deleteEmployeeRole(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- EMPLOYEES ---
router.get('/employees', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getEmployees(brand));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT ISNULL(NULLIF(CAST(employee_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as id, 
               ISNULL(NULLIF(CAST(employee_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as employee_id,
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand_id, 
               ISNULL(CAST(name AS NVARCHAR(255)), ISNULL(CAST(employee_name AS NVARCHAR(255)), '')) as name, 
               ISNULL(CAST(name AS NVARCHAR(255)), ISNULL(CAST(employee_name AS NVARCHAR(255)), '')) as employee_name, 
               ISNULL(CAST(role_id AS NVARCHAR(100)), '') as roleId, 
               ISNULL(CAST(role_id AS NVARCHAR(100)), '') as role_id, 
               ISNULL(CAST(email AS NVARCHAR(255)), '') as email, 
               ISNULL(CAST(status AS NVARCHAR(50)), 'Active') as status, 
               ISNULL(CAST(joining_date AS NVARCHAR(50)), '') as joiningDate,
               ISNULL(cost_of_employee, 0) as costOfEmployee, 
               ISNULL(CAST(employee_type AS NVARCHAR(50)), 'Salary Basis') as employeeType, 
               ISNULL(CAST(comes_under_tds AS NVARCHAR(10)), 'No') as comesUnderTds,
               ISNULL(CAST(notes AS NVARCHAR(MAX)), '') as notes, 
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt
        FROM employees 
        WHERE (@brandFilter IS NULL OR brand = @brandFilter)
        ORDER BY created_at DESC
      `),
      'employees'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /employees] Falling back to mock store:', err);
    return res.json(mockStore.getEmployees(brand));
  }
});

async function handleSaveEmployeeRoute(req: Request, res: Response) {
  const emp: Employee = req.body;
  const brandContext = getBrandContext(req);
  emp.brand = sanitizeBrand(emp.brand, brandContext) as any;
  emp.costOfEmployee = parseFloat(String(emp.costOfEmployee ?? 0)) || 0;
  const now = new Date().toISOString();
  emp.updatedAt = now;
  emp.createdAt = emp.createdAt || now;

  emp.id = (emp.id || '').trim() || generateSemanticEntityId('EMP', emp.brand, mockStore.getEmployees(emp.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveEmployee(emp);
    return res.json({ success: true, employee: saved });
  }

  try {
    const guidId = toGuid(emp.id);
    const roleGuid = toGuidOrNull(emp.roleId);
    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', emp.id || '')
          .input('brand', emp.brand || 'Device Doctor India')
          .input('name', emp.name)
          .input('role_id', roleGuid)
          .input('email', emp.email || '')
          .input('status', emp.status || 'Active')
          .input('joining_date', emp.joiningDate || '')
          .input('cost_of_employee', emp.costOfEmployee || 0)
          .input('employee_type', emp.employeeType || 'Salary Basis')
          .input('comes_under_tds', emp.comesUnderTds || 'No')
          .input('notes', emp.notes || '')
          .input('created_at', emp.createdAt)
          .input('updated_at', emp.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM employees WHERE id = @id OR (employee_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL))
              UPDATE employees SET brand=@brand, name=@name, employee_name=@name, role_id=@role_id, email=@email, status=@status,
                                  joining_date=@joining_date, cost_of_employee=@cost_of_employee,
                                  employee_type=@employee_type, comes_under_tds=@comes_under_tds, notes=@notes, updated_at=@updated_at,
                                  employee_id_code=@rawId
              WHERE id = @id OR (employee_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL)
            ELSE
              INSERT INTO employees (id, employee_id_code, brand, name, employee_name, role_id, email, status, joining_date, cost_of_employee, employee_type, comes_under_tds, notes, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @name, @name, @role_id, @email, @status, @joining_date, @cost_of_employee, @employee_type, @comes_under_tds, @notes, @created_at, @updated_at)
          `),
      'employees'
    );
    mockStore.saveEmployee(emp);
    return res.json({ success: true, employee: emp });
  } catch (err) {
    console.warn('[handleSaveEmployeeRoute] Falling back to mock store:', err);
    const saved = mockStore.saveEmployee(emp);
    return res.json({ success: true, employee: saved });
  }
}

router.post('/employees', authenticateToken, handleSaveEmployeeRoute);
router.put('/employees/:id', authenticateToken, (req: Request, res: Response) => {
  req.body.id = req.params.id;
  return handleSaveEmployeeRoute(req, res);
});

router.delete('/employees/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const brand = getBrandContext(req);
  const brandFilter = (brand && brand !== 'All') ? brand : null;
  const pool = await getOrInitPool();

  if (!pool) {
    const deleted = mockStore.deleteEmployee(id, brandFilter);
    if (!deleted) {
      return res.status(403).json({
        success: false,
        error: 'Deletion prevented: Employee belongs to another workspace brand or does not exist.',
      });
    }
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    const checkRes = await pool.request()
      .input('id', guidId)
      .input('rawId', id)
      .query(`
        SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id,
                     ISNULL(CAST(employee_id_code AS NVARCHAR(150)), '') as employee_id_code,
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand,
                     ISNULL(CAST(name AS NVARCHAR(255)), ISNULL(CAST(employee_name AS NVARCHAR(255)), '')) as name
        FROM employees 
        WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR employee_id_code = @rawId
      `);

    const existing = checkRes.recordset?.[0];
    if (existing && brandFilter && existing.brand && existing.brand !== 'All' && existing.brand !== brandFilter) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: Employee belongs to workspace "${existing.brand}", but current workspace is "${brandFilter}".`
      });
    }

    if (existing) {
      const depRes = await pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .query(`
          SELECT 
            (SELECT COUNT(1) FROM assignments WHERE employee_id = @id OR employee_id = @rawId) as asnCount,
            (SELECT COUNT(1) FROM employee_payments WHERE employee_id = @id OR employee_id = @rawId) as payCount
        `);
      const deps = depRes.recordset?.[0];
      const asnCount = Number(deps?.asnCount || 0);
      const payCount = Number(deps?.payCount || 0);
      if (asnCount > 0 || payCount > 0) {
        return res.status(409).json({
          success: false,
          error: `Cannot delete employee "${existing.name || id}": ${asnCount} assignment(s) and ${payCount} payout voucher(s) are logged.`
        });
      }
    }

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .query(`
          DELETE FROM employees 
          WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR employee_id_code = @rawId)
            AND (@brandFilter IS NULL OR brand = @brandFilter)
        `),
      'employees'
    );
    mockStore.deleteEmployee(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DELETE /employees/${id}] Falling back to mock store:`, errMsg);
    mockStore.deleteEmployee(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- ASSIGNMENTS ---
router.get('/assignments', async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getAssignments(brand));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT ISNULL(NULLIF(CAST(assignment_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as id, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(project_id AS NVARCHAR(150)), '') as projectId, 
               ISNULL(CAST(client_id AS NVARCHAR(100)), '') as clientId, 
               ISNULL(CAST(client_name AS NVARCHAR(255)), '') as clientName,
               ISNULL(CAST(employee_id AS NVARCHAR(100)), '') as employeeId, 
               ISNULL(CAST(employee_name AS NVARCHAR(255)), '') as employeeName, 
               ISNULL(CAST(role_name AS NVARCHAR(255)), '') as roleName,
               ISNULL(CAST(assigned_date AS NVARCHAR(50)), '') as assignedDate, 
               ISNULL(CAST(work_assigned AS NVARCHAR(MAX)), '') as workAssigned, 
               ISNULL(amount, 0) as amount,
               ISNULL(amount_paid, 0) as amountPaid, 
               ISNULL(CAST(payment_status AS NVARCHAR(50)), 'Pending') as paymentStatus, 
               ISNULL(CAST(employee_notes AS NVARCHAR(MAX)), '') as employeeNotes,
               ISNULL(CAST(last_note_update AS NVARCHAR(50)), '') as lastNoteUpdate, 
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt
        FROM assignments 
        WHERE (@brandFilter IS NULL OR brand = @brandFilter)
        ORDER BY created_at DESC
      `),
      'assignments'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /assignments] Falling back to mock store:', err);
    return res.json(mockStore.getAssignments(brand));
  }
});

async function handleSaveAssignmentRoute(req: Request, res: Response) {
  const asn: Assignment = req.body;
  const brandContext = getBrandContext(req);
  asn.brand = sanitizeBrand(asn.brand, brandContext) as any;
  asn.amount = parseFloat(String(asn.amount ?? 0)) || 0;
  asn.amountPaid = parseFloat(String(asn.amountPaid ?? 0)) || 0;
  const now = new Date().toISOString();
  asn.updatedAt = now;
  asn.createdAt = asn.createdAt || now;

  asn.id = (asn.id || '').trim() || generateSemanticEntityId('ASN', asn.brand, mockStore.getAssignments(asn.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveAssignment(asn);
    return res.json({ success: true, assignment: saved });
  }

  try {
    const guidId = toGuid(asn.id);
    const projGuid = toGuidOrNull(asn.projectId);
    const clientGuid = toGuidOrNull(asn.clientId);
    const empGuid = toGuidOrNull(asn.employeeId);
    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', asn.id || '')
          .input('brand', asn.brand || 'Device Doctor India')
          .input('project_id', projGuid)
          .input('client_id', clientGuid)
          .input('client_name', asn.clientName || '')
          .input('employee_id', empGuid)
          .input('employee_name', asn.employeeName || '')
          .input('role_name', asn.roleName || '')
          .input('assigned_date', asn.assignedDate || '')
          .input('work_assigned', asn.workAssigned || '')
          .input('amount', asn.amount || 0)
          .input('amount_paid', asn.amountPaid || 0)
          .input('payment_status', asn.paymentStatus || 'Pending')
          .input('employee_notes', asn.employeeNotes || '')
          .input('last_note_update', asn.lastNoteUpdate || '')
          .input('created_at', asn.createdAt)
          .input('updated_at', asn.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM assignments WHERE id = @id OR (assignment_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL))
              UPDATE assignments SET brand=@brand, project_id=@project_id, client_id=@client_id, client_name=@client_name,
                                     employee_id=@employee_id, employee_name=@employee_name, role_name=@role_name,
                                     assigned_date=@assigned_date, work_assigned=@work_assigned, work_module_assigned=@work_assigned,
                                     amount=@amount, amount_paid=@amount_paid, payment_status=@payment_status,
                                     employee_notes=@employee_notes, last_note_update=@last_note_update, updated_at=@updated_at,
                                     assignment_id_code=@rawId
              WHERE id = @id OR (assignment_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL)
            ELSE
              INSERT INTO assignments (id, assignment_id_code, brand, project_id, client_id, client_name, employee_id, employee_name, role_name, assigned_date, work_assigned, work_module_assigned, amount, amount_paid, payment_status, employee_notes, last_note_update, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @project_id, @client_id, @client_name, @employee_id, @employee_name, @role_name, @assigned_date, @work_assigned, @work_assigned, @amount, @amount_paid, @payment_status, @employee_notes, @last_note_update, @created_at, @updated_at)
          `),
      'assignments'
    );
    mockStore.saveAssignment(asn);
    return res.json({ success: true, assignment: asn });
  } catch (err) {
    console.warn('[handleSaveAssignmentRoute] Falling back to mock store:', err);
    const saved = mockStore.saveAssignment(asn);
    return res.json({ success: true, assignment: saved });
  }
}

router.post('/assignments', handleSaveAssignmentRoute);
router.put('/assignments/:id', (req: Request, res: Response) => {
  req.body.id = req.params.id;
  return handleSaveAssignmentRoute(req, res);
});

router.delete('/assignments/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const brand = getBrandContext(req);
  const brandFilter = (brand && brand !== 'All') ? brand : null;
  const pool = await getOrInitPool();

  if (!pool) {
    const deleted = mockStore.deleteAssignment(id, brandFilter);
    if (!deleted) {
      return res.status(403).json({
        success: false,
        error: 'Deletion prevented: Assignment belongs to another workspace brand or does not exist.',
      });
    }
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    const checkRes = await pool.request()
      .input('id', guidId)
      .input('rawId', id)
      .query(`
        SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id,
                     ISNULL(CAST(assignment_id_code AS NVARCHAR(150)), '') as assignment_id_code,
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand
        FROM assignments 
        WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR assignment_id_code = @rawId
      `);

    const existing = checkRes.recordset?.[0];
    if (existing && brandFilter && existing.brand && existing.brand !== 'All' && existing.brand !== brandFilter) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: Assignment belongs to workspace "${existing.brand}", but current workspace is "${brandFilter}".`
      });
    }

    if (existing) {
      const depRes = await pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .query(`
          SELECT COUNT(1) as payCount 
          FROM employee_payments 
          WHERE assignment_id = @id OR assignment_id = @rawId
        `);
      const payCount = Number(depRes.recordset?.[0]?.payCount || 0);
      if (payCount > 0) {
        return res.status(409).json({
          success: false,
          error: `Cannot delete assignment "${id}": ${payCount} employee payout record(s) are logged against it.`
        });
      }
    }

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .query(`
          DELETE FROM assignments 
          WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR assignment_id_code = @rawId)
            AND (@brandFilter IS NULL OR brand = @brandFilter)
        `),
      'assignments'
    );
    mockStore.deleteAssignment(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DELETE /assignments/${id}] Falling back to mock store:`, errMsg);
    mockStore.deleteAssignment(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- EMPLOYEE PAYMENTS ---
router.get('/employee-payments', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    const list = mockStore.getEmployeePayments(brand);
    return res.json(list.map((p) => ({ ...p, paymentProof: parsePaymentProof(p.paymentProof) })));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT ISNULL(NULLIF(CAST(emp_payment_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as id, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(assignment_id AS NVARCHAR(100)), '') as assignmentId, 
               ISNULL(CAST(project_id AS NVARCHAR(150)), '') as projectId, 
               ISNULL(CAST(employee_id AS NVARCHAR(100)), '') as employeeId,
               ISNULL(CAST(employee_name AS NVARCHAR(255)), '') as employeeName, 
               ISNULL(CAST(payment_date AS NVARCHAR(50)), '') as paymentDate, 
               ISNULL(amount_paid, 0) as amountPaid,
               ISNULL(CAST(payment_mode AS NVARCHAR(50)), 'GST Invoice') as paymentMode, 
               ISNULL(CAST(reference_utr AS NVARCHAR(100)), '') as referenceUtr, 
               ISNULL(CAST(notes AS NVARCHAR(MAX)), '') as notes,
               ISNULL(CAST(payment_proof AS NVARCHAR(MAX)), '') as paymentProof, 
               ISNULL(CAST(payment_proof_notes AS NVARCHAR(MAX)), '') as paymentProofNotes,
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt
        FROM employee_payments 
        WHERE (@brandFilter IS NULL OR brand = @brandFilter)
        ORDER BY created_at DESC
      `),
      'employee_payments'
    );
    const parsedRows = (q.recordset || []).map((row: any) => ({
      ...row,
      paymentProof: parsePaymentProof(row.paymentProof),
    }));
    return res.json(parsedRows);
  } catch (err) {
    console.warn('[GET /employee-payments] Falling back to mock store:', err);
    const list = mockStore.getEmployeePayments(brand);
    return res.json(list.map((p) => ({ ...p, paymentProof: parsePaymentProof(p.paymentProof) })));
  }
});

async function handleSaveEmployeePaymentRoute(req: Request, res: Response) {
  const epay: EmployeePayment = req.body;
  const brandContext = getBrandContext(req);
  epay.brand = sanitizeBrand(epay.brand, brandContext) as any;
  // Parse arbitrary decimal/numeric precision cleanly without truncating fractional or custom monetary figures
  const cleanAmount = typeof epay.amountPaid === 'string'
    ? parseFloat(String(epay.amountPaid).replace(/,/g, '').trim())
    : Number(epay.amountPaid);
  epay.amountPaid = isNaN(cleanAmount) ? 0 : cleanAmount;

  const now = new Date().toISOString();
  epay.updatedAt = now;
  epay.createdAt = epay.createdAt || now;

  epay.id = (epay.id || '').trim() || generateSemanticEntityId('EPAY', epay.brand, mockStore.getEmployeePayments(epay.brand));

  epay.paymentProof = parsePaymentProof(epay.paymentProof);
  const serializedProof = serializePaymentProof(epay.paymentProof);

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveEmployeePayment(epay);
    return res.json({ success: true, payment: { ...saved, paymentProof: parsePaymentProof(saved.paymentProof) } });
  }

  try {
    const guidId = toGuid(epay.id);
    const asnGuid = toGuidOrNull(epay.assignmentId);
    const projGuid = toGuidOrNull(epay.projectId);
    const empGuid = toGuidOrNull(epay.employeeId);
    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', epay.id || '')
          .input('brand', epay.brand || 'Device Doctor India')
          .input('assignment_id', asnGuid)
          .input('project_id', projGuid)
          .input('employee_id', empGuid)
          .input('employee_name', epay.employeeName || '')
          .input('payment_date', epay.paymentDate || '')
          .input('amount_paid', epay.amountPaid || 0)
          .input('payment_mode', epay.paymentMode || 'GST Invoice')
          .input('reference_utr', epay.referenceUtr || '')
          .input('notes', epay.notes || '')
          .input('payment_proof', serializedProof)
          .input('payment_proof_notes', epay.paymentProofNotes || (epay.paymentProof?.notes || ''))
          .input('created_at', epay.createdAt)
          .input('updated_at', epay.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM employee_payments WHERE id = @id OR (emp_payment_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL))
              UPDATE employee_payments SET brand=@brand, assignment_id=@assignment_id, project_id=@project_id,
                                          employee_id=@employee_id, employee_name=@employee_name, payment_date=@payment_date,
                                          amount_paid=@amount_paid, payment_mode=@payment_mode, reference_utr=@reference_utr,
                                          notes=@notes, payment_proof=@payment_proof, payment_proof_notes=@payment_proof_notes,
                                          updated_at=@updated_at, emp_payment_id_code=@rawId
              WHERE id = @id OR (emp_payment_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL)
            ELSE
              INSERT INTO employee_payments (id, emp_payment_id_code, brand, assignment_id, project_id, employee_id, employee_name, payment_date, amount_paid, payment_mode, reference_utr, notes, payment_proof, payment_proof_notes, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @assignment_id, @project_id, @employee_id, @employee_name, @payment_date, @amount_paid, @payment_mode, @reference_utr, @notes, @payment_proof, @payment_proof_notes, @created_at, @updated_at)
          `),
      'employee_payments'
    );
    mockStore.saveEmployeePayment(epay);
    return res.json({ success: true, payment: epay });
  } catch (err) {
    console.warn('[handleSaveEmployeePaymentRoute] Falling back to mock store:', err);
    const saved = mockStore.saveEmployeePayment(epay);
    return res.json({ success: true, payment: { ...saved, paymentProof: parsePaymentProof(saved.paymentProof) } });
  }
}

router.post('/employee-payments', authenticateToken, handleSaveEmployeePaymentRoute);
router.put('/employee-payments/:id', authenticateToken, (req: Request, res: Response) => {
  req.body.id = req.params.id;
  return handleSaveEmployeePaymentRoute(req, res);
});

router.delete('/employee-payments/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const brand = getBrandContext(req);
  const brandFilter = (brand && brand !== 'All') ? brand : null;
  const pool = await getOrInitPool();

  if (!pool) {
    const deleted = mockStore.deleteEmployeePayment(id, brandFilter);
    if (!deleted) {
      return res.status(403).json({
        success: false,
        error: 'Deletion prevented: Payout record belongs to another workspace brand or does not exist.',
      });
    }
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    const checkRes = await pool.request()
      .input('id', guidId)
      .input('rawId', id)
      .query(`
        SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id,
                     ISNULL(CAST(emp_payment_id_code AS NVARCHAR(150)), '') as emp_payment_id_code,
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand
        FROM employee_payments 
        WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR emp_payment_id_code = @rawId
      `);

    const existing = checkRes.recordset?.[0];
    if (existing && brandFilter && existing.brand && existing.brand !== 'All' && existing.brand !== brandFilter) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: Payout voucher belongs to workspace "${existing.brand}", but current workspace is "${brandFilter}".`
      });
    }

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .query(`
          DELETE FROM employee_payments 
          WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR emp_payment_id_code = @rawId)
            AND (@brandFilter IS NULL OR brand = @brandFilter)
        `),
      'employee_payments'
    );
    mockStore.deleteEmployeePayment(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DELETE /employee-payments/${id}] Falling back to mock store:`, errMsg);
    mockStore.deleteEmployeePayment(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- EXPENSE CATEGORIES ---
router.get('/expense-categories', async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getExpenseCategories(brand));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT ISNULL(NULLIF(CAST(exp_category_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as id, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(name AS NVARCHAR(255)), ISNULL(CAST(category_name AS NVARCHAR(255)), '')) as name, 
               ISNULL(CAST(description AS NVARCHAR(MAX)), '') as description, 
               ISNULL(CAST(status AS NVARCHAR(50)), 'Active') as status, 
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt 
        FROM expense_categories 
        WHERE (@brandFilter IS NULL OR brand = @brandFilter)
        ORDER BY created_at DESC
      `),
      'expense_categories'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /expense-categories] Falling back to mock store:', err);
    return res.json(mockStore.getExpenseCategories(brand));
  }
});

async function handleSaveExpenseCategoryRoute(req: Request, res: Response) {
  const cat: ExpenseCategory = req.body;
  const brandContext = getBrandContext(req);
  cat.brand = sanitizeBrand(cat.brand, brandContext) as any;
  const now = new Date().toISOString();
  cat.updatedAt = now;
  cat.createdAt = cat.createdAt || now;

  cat.id = (cat.id || '').trim() || generateSemanticEntityId('EXC', cat.brand, mockStore.getExpenseCategories(cat.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveExpenseCategory(cat);
    return res.json({ success: true, category: saved });
  }

  try {
    const guidId = toGuid(cat.id);
    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', cat.id || '')
          .input('brand', cat.brand || 'Device Doctor India')
          .input('name', cat.name)
          .input('description', cat.description || '')
          .input('status', cat.status || 'Active')
          .input('created_at', cat.createdAt)
          .input('updated_at', cat.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM expense_categories WHERE id = @id OR (exp_category_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL))
              UPDATE expense_categories 
              SET brand=@brand, name=@name, category_name=@name, description=@description, status=@status, updated_at=@updated_at, exp_category_id_code=@rawId 
              WHERE id = @id OR (exp_category_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL)
            ELSE
              INSERT INTO expense_categories (id, exp_category_id_code, brand, name, category_name, description, status, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @name, @name, @description, @status, @created_at, @updated_at)
          `),
      'expense_categories'
    );
    mockStore.saveExpenseCategory(cat);
    return res.json({ success: true, category: cat });
  } catch (err) {
    console.warn('[handleSaveExpenseCategoryRoute] Falling back to mock store:', err);
    const saved = mockStore.saveExpenseCategory(cat);
    return res.json({ success: true, category: saved });
  }
}

router.post('/expense-categories', handleSaveExpenseCategoryRoute);
router.put('/expense-categories/:id', (req: Request, res: Response) => {
  req.body.id = req.params.id;
  return handleSaveExpenseCategoryRoute(req, res);
});

router.delete('/expense-categories/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const brand = getBrandContext(req);
  const brandFilter = (brand && brand !== 'All') ? brand : null;
  const pool = await getOrInitPool();

  if (!pool) {
    const deleted = mockStore.deleteExpenseCategory(id, brandFilter);
    if (!deleted) {
      return res.status(403).json({
        success: false,
        error: 'Deletion prevented: Expense category belongs to another workspace brand or does not exist.',
      });
    }
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    const checkRes = await pool.request()
      .input('id', guidId)
      .input('rawId', id)
      .query(`
        SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id,
                     ISNULL(CAST(exp_category_id_code AS NVARCHAR(150)), '') as exp_category_id_code,
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand,
                     ISNULL(CAST(name AS NVARCHAR(255)), ISNULL(CAST(category_name AS NVARCHAR(255)), '')) as name
        FROM expense_categories 
        WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR exp_category_id_code = @rawId
      `);

    const existing = checkRes.recordset?.[0];
    if (existing && brandFilter && existing.brand && existing.brand !== 'All' && existing.brand !== brandFilter) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: Expense category belongs to workspace "${existing.brand}", but current workspace is "${brandFilter}".`
      });
    }

    if (existing) {
      const depRes = await pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('catName', existing.name || '')
        .query(`
          SELECT COUNT(1) as expCount 
          FROM other_expenses 
          WHERE expense_category_id = @id OR expense_category_id = @rawId OR expense_category_name = @catName
        `);
      const expCount = Number(depRes.recordset?.[0]?.expCount || 0);
      if (expCount > 0) {
        return res.status(409).json({
          success: false,
          error: `Cannot delete expense category "${existing.name || id}": ${expCount} expense(s) are recorded under it.`
        });
      }
    }

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .query(`
          DELETE FROM expense_categories 
          WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR exp_category_id_code = @rawId)
            AND (@brandFilter IS NULL OR brand = @brandFilter)
        `),
      'expense_categories'
    );
    mockStore.deleteExpenseCategory(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DELETE /expense-categories/${id}] Falling back to mock store:`, errMsg);
    mockStore.deleteExpenseCategory(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- OTHER EXPENSES ---
router.get('/expenses', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getExpenses(brand));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT ISNULL(NULLIF(CAST(expense_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as id, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(project_id AS NVARCHAR(150)), '') as projectId, 
               ISNULL(CAST(client_id AS NVARCHAR(100)), '') as clientId, 
               ISNULL(CAST(client_name AS NVARCHAR(255)), '') as clientName,
               ISNULL(CAST(expense_category_id AS NVARCHAR(100)), '') as expenseCategoryId, 
               ISNULL(CAST(expense_category_name AS NVARCHAR(255)), '') as expenseCategoryName,
               ISNULL(CAST(vendor AS NVARCHAR(255)), '') as vendor, 
               ISNULL(CAST(description AS NVARCHAR(MAX)), '') as description, 
               ISNULL(amount, 0) as amount, 
               ISNULL(CAST(currency AS NVARCHAR(20)), 'INR') as currency, 
               ISNULL(exchange_rate, 1) as exchangeRate,
               ISNULL(TRY_CAST(amount_inr AS FLOAT), 0) as amountINR, 
               ISNULL(CAST(expense_date AS NVARCHAR(50)), '') as expenseDate, 
               ISNULL(CAST(payment_status AS NVARCHAR(50)), 'Paid') as paymentStatus,
               ISNULL(CAST(notes AS NVARCHAR(MAX)), '') as notes, 
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt
        FROM other_expenses 
        WHERE (@brandFilter IS NULL OR brand = @brandFilter)
        ORDER BY created_at DESC
      `),
      'other_expenses'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /expenses] Falling back to mock store:', err);
    return res.json(mockStore.getExpenses(brand));
  }
});

async function handleSaveExpenseRoute(req: Request, res: Response) {
  const exp: Expense = req.body;
  const brandContext = getBrandContext(req);
  exp.brand = sanitizeBrand(exp.brand, brandContext) as any;
  const now = new Date().toISOString();
  exp.updatedAt = now;
  exp.createdAt = exp.createdAt || now;

  exp.id = (exp.id || '').trim() || generateSemanticEntityId('EXP', exp.brand, mockStore.getExpenses(exp.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveExpense(exp);
    return res.json({ success: true, expense: saved });
  }

  try {
    const guidId = toGuid(exp.id);
    const projGuid = toGuidOrNull(exp.projectId);
    const isNaProject = (!exp.projectId || exp.projectId === 'NA' || exp.projectId.toUpperCase() === 'NA' || !projGuid) ? 1 : 0;
    const catGuid = toGuid(exp.expenseCategoryId || exp.expenseCategoryName || 'General');
    const catName = exp.expenseCategoryName || 'General Expense';
    const expenseDate = exp.expenseDate ? exp.expenseDate.slice(0, 10) : now.slice(0, 10);
    const amountVal = Number(exp.amount) || 0;
    const rateVal = Number(exp.exchangeRate) || 1;
    const inrVal = Number(exp.amountINR) || (amountVal * rateVal);

    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', exp.id || '')
          .input('brand', exp.brand || 'Device Doctor India')
          .input('project_id', isNaProject ? null : projGuid)
          .input('is_na_project', isNaProject)
          .input('client_id', exp.clientId || '')
          .input('client_name', exp.clientName || '')
          .input('cat_id', catGuid)
          .input('cat_name', catName)
          .input('vendor', exp.vendor || '')
          .input('description', exp.description || '')
          .input('amount', amountVal)
          .input('currency', exp.currency || 'INR')
          .input('exchange_rate', rateVal)
          .input('amount_inr', String(inrVal))
          .input('expense_date', expenseDate)
          .input('payment_status', exp.paymentStatus || 'Paid')
          .input('notes', exp.notes || '')
          .input('created_at', exp.createdAt)
          .input('updated_at', exp.updatedAt)
          .query(`
            -- Ensure expense_categories record exists to satisfy foreign key constraint
            IF NOT EXISTS (SELECT 1 FROM expense_categories WHERE id = @cat_id)
            BEGIN
              INSERT INTO expense_categories (id, exp_category_id_code, brand, name, category_name, description, status, created_at, updated_at)
              VALUES (@cat_id, @cat_name, @brand, @cat_name, @cat_name, 'Auto-provisioned category', 'Active', @created_at, @updated_at);
            END;

            IF EXISTS (SELECT 1 FROM other_expenses WHERE id = @id OR (expense_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL))
              UPDATE other_expenses 
              SET brand=@brand, project_id=@project_id, is_na_project=@is_na_project, client_id=@client_id, client_name=@client_name,
                  expense_category_id=@cat_id, expense_category_name=@cat_name, vendor=@vendor, description=@description,
                  amount=@amount, currency=@currency, exchange_rate=@exchange_rate, amount_inr=@amount_inr,
                  expense_date=@expense_date, payment_status=@payment_status, notes=@notes, updated_at=@updated_at,
                  expense_id_code=@rawId
              WHERE id = @id OR (expense_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL)
            ELSE
              INSERT INTO other_expenses (id, expense_id_code, brand, project_id, is_na_project, client_id, client_name, expense_category_id, expense_category_name, vendor, description, amount, currency, exchange_rate, amount_inr, expense_date, payment_status, notes, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @project_id, @is_na_project, @client_id, @client_name, @cat_id, @cat_name, @vendor, @description, @amount, @currency, @exchange_rate, @amount_inr, @expense_date, @payment_status, @notes, @created_at, @updated_at)
          `),
      'other_expenses'
    );
    mockStore.saveExpense(exp);
    return res.json({ success: true, expense: exp });
  } catch (err) {
    console.warn('[handleSaveExpenseRoute] Falling back to mock store:', err);
    const saved = mockStore.saveExpense(exp);
    return res.json({ success: true, expense: saved });
  }
}

router.post('/expenses', authenticateToken, handleSaveExpenseRoute);
router.put('/expenses/:id', authenticateToken, (req: Request, res: Response) => {
  req.body.id = req.params.id;
  return handleSaveExpenseRoute(req, res);
});

router.delete('/expenses/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const brand = getBrandContext(req);
  const brandFilter = (brand && brand !== 'All') ? brand : null;
  const pool = await getOrInitPool();

  if (!pool) {
    const deleted = mockStore.deleteExpense(id, brandFilter);
    if (!deleted) {
      return res.status(403).json({
        success: false,
        error: 'Deletion prevented: Expense belongs to another workspace brand or does not exist.',
      });
    }
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    const checkRes = await pool.request()
      .input('id', guidId)
      .input('rawId', id)
      .query(`
        SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id,
                     ISNULL(CAST(expense_id_code AS NVARCHAR(150)), '') as expense_id_code,
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand
        FROM other_expenses 
        WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR expense_id_code = @rawId
      `);

    const existing = checkRes.recordset?.[0];
    if (existing && brandFilter && existing.brand && existing.brand !== 'All' && existing.brand !== brandFilter) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: Expense belongs to workspace "${existing.brand}", but current workspace is "${brandFilter}".`
      });
    }

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .query(`
          DELETE FROM other_expenses 
          WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR expense_id_code = @rawId)
            AND (@brandFilter IS NULL OR brand = @brandFilter)
        `),
      'other_expenses'
    );
    mockStore.deleteExpense(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DELETE /expenses/${id}] Falling back to mock store:`, errMsg);
    mockStore.deleteExpense(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- APP USERS (Admin & User Management) ---
router.get('/users', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getUsers(brand));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT CAST(id AS NVARCHAR(100)) as id, 
               ISNULL(CAST(name AS NVARCHAR(255)), ISNULL(CAST(full_name AS NVARCHAR(255)), 'User')) as name, 
               ISNULL(CAST(email AS NVARCHAR(255)), '') as email, 
               ISNULL(CAST(role AS NVARCHAR(50)), 'Super Admin') as role, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'All') as brand, 
               ISNULL(CAST(status AS NVARCHAR(50)), 'Active') as status, 
               ISNULL(CAST(avatar AS NVARCHAR(MAX)), '') as avatar, 
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt 
        FROM app_users 
        WHERE (@brandFilter IS NULL OR brand = 'All' OR brand = @brandFilter)
        ORDER BY created_at ASC
      `),
      'app_users'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /users] Falling back to mock store:', err);
    return res.json(mockStore.getUsers(brand));
  }
});

async function handleSaveUserRoute(req: Request, res: Response) {
  const user: AppUser = req.body;
  const now = new Date().toISOString();
  user.updatedAt = now;
  user.createdAt = user.createdAt || now;

  const rawId = (user.id || `USR-${Date.now().toString().slice(-4)}`).trim();
  const userEmail = (user.email || '').toLowerCase().trim();
  const userName = (user.name || user.email || 'User').trim();
  user.id = rawId;
  user.email = userEmail;
  user.name = userName;

  // Hash new password if provided
  let hashedPassword = '';
  if (user.password && user.password.trim()) {
    hashedPassword = await hashPassword(user.password.trim());
  }

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveUser(user);
    return res.json({ success: true, user: saved });
  }

  try {
    const guidId = toGuid(rawId);
    const fallbackNewPass = hashedPassword || (await hashPassword('Admin@2026'));

    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', rawId)
          .input('name', userName)
          .input('email', userEmail)
          .input('password_hash', hashedPassword)
          .input('fallback_pass', fallbackNewPass)
          .input('role', user.role || 'Viewer')
          .input('brand', user.brand || 'All')
          .input('status', user.status || 'Active')
          .input('avatar', user.avatar || '')
          .input('created_at', user.createdAt)
          .input('updated_at', user.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM app_users WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId OR LOWER(email) = @email)
            BEGIN
              UPDATE app_users 
              SET name = @name,
                  email = @email, 
                  password_hash = CASE WHEN @password_hash IS NOT NULL AND @password_hash <> '' THEN @password_hash ELSE password_hash END,
                  role = @role,
                  brand = @brand,
                  status = @status,
                  avatar = @avatar,
                  updated_at = @updated_at 
              WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId OR LOWER(email) = @email;
            END
            ELSE
            BEGIN
              INSERT INTO app_users (id, name, email, password_hash, role, brand, status, avatar, created_at, updated_at)
              VALUES (@rawId, @name, @email, @fallback_pass, @role, @brand, @status, @avatar, @created_at, @updated_at);
            END
          `),
      'app_users'
    );

    // Keep in-memory store synchronized
    mockStore.saveUser(user);
    return res.json({ success: true, user });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[handleSaveUserRoute] Live Azure SQL Error:', errMsg);
    return res.status(500).json({
      success: false,
      error: `Failed to save user in Azure SQL: ${errMsg}`,
    });
  }
}

router.post('/users', authenticateToken, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.role !== 'Super Admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Only Super Admin can create users or assign roles.',
    });
  }
  return handleSaveUserRoute(req, res);
});
router.put('/users/:id', authenticateToken, (req: Request, res: Response) => {
  req.body.id = req.params.id;
  return handleSaveUserRoute(req, res);
});

router.delete('/users/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const brand = getBrandContext(req);
  const brandFilter = (brand && brand !== 'All') ? brand : null;
  const pool = await getOrInitPool();

  if (!pool) {
    const deleted = mockStore.deleteUser(id, brandFilter);
    if (!deleted) {
      return res.status(403).json({
        success: false,
        error: 'Deletion prevented: User account belongs to another workspace brand or does not exist.',
      });
    }
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    const checkRes = await pool.request()
      .input('id', guidId)
      .input('rawId', id)
      .query(`
        SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id,
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'All') as brand,
                     ISNULL(CAST(role AS NVARCHAR(50)), 'Viewer') as role,
                     ISNULL(CAST(name AS NVARCHAR(255)), '') as name
        FROM app_users 
        WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId
      `);

    const existing = checkRes.recordset?.[0];
    if (existing && brandFilter && existing.brand && existing.brand !== 'All' && existing.brand !== brandFilter) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: User account belongs to workspace "${existing.brand}", but current workspace is "${brandFilter}".`
      });
    }

    // Safety check: ensure at least one Super Admin remains
    const superAdminCheck = await pool.request().query(`
      SELECT COUNT(1) as adminCount FROM app_users WHERE role = 'Super Admin' AND status = 'Active'
    `);
    const adminCount = Number(superAdminCheck.recordset?.[0]?.adminCount || 0);
    if (existing && existing.role === 'Super Admin' && adminCount <= 1) {
      return res.status(400).json({
        success: false,
        error: 'System security protection: Cannot delete the only remaining Super Admin account.'
      });
    }

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .query(`
          DELETE FROM app_users 
          WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId)
            AND (@brandFilter IS NULL OR brand = 'All' OR brand = @brandFilter)
        `),
      'app_users'
    );
    mockStore.deleteUser(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DELETE /users/${id}] Falling back to mock store:`, errMsg);
    mockStore.deleteUser(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- AUDIT LOG ---
router.get('/audit', async (_req: Request, res: Response) => {
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getAuditLog());
  }

  try {
    const q = await executeSqlWithAutoMigration(pool, () =>
      pool.request().query('SELECT TOP 100 * FROM crm_audit_log ORDER BY id DESC')
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /audit] Falling back to mock store:', err);
    return res.json(mockStore.getAuditLog());
  }
});

router.post('/audit', async (req: Request, res: Response) => {
  const { brand, module, action, entityId, details, performedBy } = req.body;
  const now = new Date().toISOString();

  const pool = await getOrInitPool();
  if (!pool) {
    const entry = mockStore.addAuditLog({
      brand: brand || 'All',
      module: module || 'General',
      action: action || 'LOG',
      entityId: entityId || '',
      details: details || '',
      performedBy: performedBy || 'System',
    });
    return res.json({ success: true, entry });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('brand', brand || 'All')
        .input('module', module || 'General')
        .input('action', action || 'LOG')
        .input('entity_id', entityId || '')
        .input('details', details || '')
        .input('performed_by', performedBy || 'System')
        .input('timestamp', now)
        .query(`
          INSERT INTO crm_audit_log (brand, module, action, entity_id, details, performed_by, timestamp)
          VALUES (@brand, @module, @action, @entity_id, @details, @performed_by, @timestamp)
        `)
    );
    return res.json({ success: true });
  } catch (err) {
    console.warn('[POST /audit] Falling back to mock store:', err);
    const entry = mockStore.addAuditLog({
      brand: brand || 'All',
      module: module || 'General',
      action: action || 'LOG',
      entityId: entityId || '',
      details: details || '',
      performedBy: performedBy || 'System',
    });
    return res.json({ success: true, entry });
  }
});

export default router;
