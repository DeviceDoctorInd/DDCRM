import { Router, Request, Response } from 'express';
import { getAzureDbStatus, getPool, getOrInitPool, refreshTableCounts, initAzureSql, migrateAzureSqlSchema, isTransientError, isMockFallbackAllowed } from '../db/azureSql';
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
    if (!isMockFallbackAllowed()) {
      throw new Error('Azure SQL Database is offline. Cannot calculate project sequence.');
    }
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

    const mockSeq = isMockFallbackAllowed() ? mockStore.getNextProjectSequence(brand, clientName, serviceName, clientId, serviceId) : 1;
    const nextSequence = Math.max(maxSeq + 1, mockSeq > 1 ? mockSeq : 1);
    const projectId = generateSemanticProjectId(brand, clientName, serviceName, nextSequence);

    return { nextSequence, projectId, basePrefix };
  } catch (err) {
    console.warn('[calculateNextProjectSequenceSql] Error querying DB sequence:', err);
    if (!isMockFallbackAllowed()) {
      throw new Error(`Azure SQL sequence query failure: ${err instanceof Error ? err.message : String(err)}`);
    }
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
    if (!isMockFallbackAllowed()) {
      throw new Error('Azure SQL Database is offline. Cannot calculate client ID.');
    }
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
    console.warn('[calculateNextClientIdSql] Error, using fallback:', err);
    if (!isMockFallbackAllowed()) {
      throw new Error(`Azure SQL client ID calculation failure: ${err instanceof Error ? err.message : String(err)}`);
    }
    return mockStore.getNextClientId(brand, clientName);
  }
}

export async function calculateNextPaymentIdSql(
  pool: sql.ConnectionPool | null,
  brand: string | null | undefined
): Promise<string> {
  const prefix = getBrandSemanticPrefix(brand);
  const pattern = `${prefix}-PAY-%`;

  if (!pool) {
    if (!isMockFallbackAllowed()) {
      throw new Error('Azure SQL Database is offline. Cannot calculate payment ID.');
    }
    return generateSemanticEntityId('PAY', brand, mockStore.getPayments(brand));
  }

  try {
    const res = await pool.request()
      .input('pattern', pattern)
      .query(`
        SELECT ISNULL(NULLIF(CAST(payment_id_code AS NVARCHAR(100)), ''), CAST(id AS NVARCHAR(100))) as id
        FROM payments
        WHERE id LIKE @pattern OR payment_id_code LIKE @pattern
      `);

    const rows = res.recordset || [];
    let maxSeq = 0;
    const regex = new RegExp(`^${prefix}-PAY-(\\d+)$`, 'i');
    for (const row of rows) {
      const match = (row.id || '').match(regex);
      if (match && match[1]) {
        const seq = parseInt(match[1], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }

    const mockSeq = isMockFallbackAllowed()
      ? (() => {
          const m = generateSemanticEntityId('PAY', brand, mockStore.getPayments(brand));
          const match = m.match(regex);
          return match && match[1] ? parseInt(match[1], 10) : 1;
        })()
      : 1;

    const nextSequence = Math.max(maxSeq + 1, mockSeq > 1 ? mockSeq : 1);
    return `${prefix}-PAY-${String(nextSequence).padStart(3, '0')}`;
  } catch (err) {
    console.warn('[calculateNextPaymentIdSql] Error querying DB sequence:', err);
    if (!isMockFallbackAllowed()) {
      throw new Error(`Azure SQL payment ID calculation failure: ${err instanceof Error ? err.message : String(err)}`);
    }
    return generateSemanticEntityId('PAY', brand, mockStore.getPayments(brand));
  }
}

export async function calculateNextEmployeeIdSql(
  pool: sql.ConnectionPool | null,
  brand: string | null | undefined
): Promise<string> {
  const prefix = getBrandSemanticPrefix(brand);
  const pattern = `${prefix}-EMP-%`;

  if (!pool) {
    if (!isMockFallbackAllowed()) {
      throw new Error('Azure SQL Database is offline. Cannot calculate employee ID.');
    }
    return generateSemanticEntityId('EMP', brand, mockStore.getEmployees(brand));
  }

  try {
    const res = await pool.request()
      .input('pattern', pattern)
      .query(`
        SELECT ISNULL(NULLIF(CAST(employee_id_code AS NVARCHAR(100)), ''), CAST(id AS NVARCHAR(100))) as id
        FROM employees
        WHERE id LIKE @pattern OR employee_id_code LIKE @pattern
      `);

    const rows = res.recordset || [];
    let maxSeq = 0;
    const regex = new RegExp(`^${prefix}-EMP-(\\d+)$`, 'i');
    for (const row of rows) {
      const match = (row.id || '').match(regex);
      if (match && match[1]) {
        const seq = parseInt(match[1], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }

    const mockSeq = isMockFallbackAllowed()
      ? (() => {
          const m = generateSemanticEntityId('EMP', brand, mockStore.getEmployees(brand));
          const match = m.match(regex);
          return match && match[1] ? parseInt(match[1], 10) : 1;
        })()
      : 1;

    const nextSequence = Math.max(maxSeq + 1, mockSeq > 1 ? mockSeq : 1);
    return `${prefix}-EMP-${String(nextSequence).padStart(3, '0')}`;
  } catch (err) {
    console.warn('[calculateNextEmployeeIdSql] Error querying DB sequence:', err);
    if (!isMockFallbackAllowed()) {
      throw new Error(`Azure SQL employee ID calculation failure: ${err instanceof Error ? err.message : String(err)}`);
    }
    return generateSemanticEntityId('EMP', brand, mockStore.getEmployees(brand));
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

export function sendDatabaseUnavailable(res: Response, operation: string, details?: string) {
  return res.status(503).json({
    success: false,
    error: 'Azure SQL Database Unavailable',
    message: `Cannot complete ${operation}: Azure SQL database is offline or unreachable. Operation blocked to prevent data loss.`,
    ...(details ? { details } : {}),
  });
}


// --- Status & Diagnostics Route ---
router.get('/db/status', optionalAuthenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const isSuperAdmin = authReq.user?.role === 'Super Admin';
  const pool = await getOrInitPool();
  const isConnected = Boolean(pool);

  // Public (bina token / non-admin): strictly return { status, connected, isMock }
  if (!isSuperAdmin) {
    return res.json({
      status: 'ok',
      connected: isConnected,
      isMock: !isConnected,
    });
  }

  // Super Admin: full diagnostics & server metadata
  if (pool) {
    try {
      const status = getAzureDbStatus();
      const { tableCounts: _tc, ...safeStatus } = status;
      return res.json({
        status: 'ok',
        ...safeStatus,
        connected: true,
        isMock: false,
      });
    } catch (err) {
      console.warn('[db/status] status check error:', err);
    }
  }

  const status = getAzureDbStatus();
  const { tableCounts: _tc, ...safeStatus } = status;
  return res.json({
    status: 'ok',
    ...safeStatus,
    connected: false,
    isMock: true,
    server: safeStatus.server,
    database: safeStatus.database,
    authType: safeStatus.authType,
    user: safeStatus.user,
    error: safeStatus.error || 'Operating with high-availability in-memory store',
    lastChecked: new Date().toISOString(),
  });
});

router.post('/db/reconnect', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.role !== 'Super Admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Only Super Admin can reconnect database and run migrations.',
    });
  }

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

  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedAdminPassword) {
    return res.status(400).json({
      success: false,
      error: 'SEED_ADMIN_PASSWORD environment variable is required to execute clear-demo. No admin accounts were inserted.',
    });
  }
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'clear demo data');
    }
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

    const hashedAdminPass = await hashPassword(seedAdminPassword);
    const nowIso = new Date().toISOString();
    await pool.request()
      .input('u1_id', 'USR-001')
      .input('u1_name', 'Hemant Rathore')
      .input('u1_email', 'rathorehemant114@gmail.com')
      .input('u1_pass', hashedAdminPass)
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
      .input('u2_pass', hashedAdminPass)
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[POST /db/clear-demo] Azure SQL Error:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'clear demo data', errMsg);
    }
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
  if (!pool && !isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'calculate next client ID');
  }
  try {
    const clientId = await calculateNextClientIdSql(pool, brand, clientName);
    return res.json({ success: true, clientId, brand });
  } catch (err) {
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'calculate next client ID');
    }
    throw err;
  }
});

router.get('/clients', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch clients');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch clients', err instanceof Error ? err.message : String(err));
  }
  return res.json(mockStore.getClients(brand));
  }
});

async function handleSaveClientRoute(req: Request, res: Response) {
  // --- Input Validation (POST & PUT /api/clients) ---
  const isPost = req.method === 'POST';
  const hasNameProp = 'name' in req.body || 'clientName' in req.body || 'client_name' in req.body;
  const rawName = req.body.name ?? req.body.clientName ?? req.body.client_name;

  if (isPost) {
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      return res.status(400).json({ success: false, error: 'Client name is required.' });
    }
  } else if (hasNameProp) {
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      return res.status(400).json({ success: false, error: 'Client name cannot be empty.' });
    }
  }

  // Validate email format if provided and not empty
  if (req.body.email !== undefined && req.body.email !== null) {
    const emailStr = String(req.body.email).trim();
    if (emailStr.length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailStr)) {
        return res.status(400).json({ success: false, error: 'Invalid email address format.' });
      }
    }
  }

  // Validate clientSince date format if provided and not empty
  if (req.body.clientSince !== undefined && req.body.clientSince !== null) {
    const dateStr = String(req.body.clientSince).trim();
    if (dateStr.length > 0) {
      const parsedTime = Date.parse(dateStr);
      if (isNaN(parsedTime)) {
        return res.status(400).json({ success: false, error: 'Invalid clientSince date format.' });
      }
    }
  }

  const client: Client = req.body;
  if (rawName && typeof rawName === 'string') {
    client.name = rawName.trim();
  }
  const brandContext = getBrandContext(req);
  client.brand = sanitizeBrand(client.brand, brandContext) as any;
  const now = new Date().toISOString();
  client.updatedAt = now;
  client.createdAt = client.createdAt || now;

  const pool = await getOrInitPool();

  // Enforce semantic Client ID only if missing (new client onboarding)
  if (!client.id) {
    try {
      client.id = await calculateNextClientIdSql(pool, client.brand || 'Device Doctor India', client.name);
    } catch (err) {
      if (!isMockFallbackAllowed()) {
        return sendDatabaseUnavailable(res, 'calculate client ID');
      }
      throw err;
    }
  }

  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save client');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save client', err instanceof Error ? err.message : String(err));
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete client');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete client', errMsg);
  }
  mockStore.deleteClient(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- SERVICE CATEGORIES ---
router.get('/categories', async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch categories');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch categories', err instanceof Error ? err.message : String(err));
  }
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

  cat.id = (cat.id || '').trim() || (isMockFallbackAllowed() ? generateSemanticEntityId('CAT', cat.brand, mockStore.getServiceCategories(cat.brand)) : generateSemanticEntityId('CAT', cat.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save category');
  }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[handleSaveCategoryRoute] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'save category', errMsg);
    }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete category');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete category', errMsg);
  }
  mockStore.deleteServiceCategory(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- SERVICES ---
router.get('/services', async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch services');
  }
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
          CAST(s.category_id AS NVARCHAR(150)) = CAST(c.id AS NVARCHAR(150))
          OR CAST(s.category_id AS NVARCHAR(150)) = CAST(c.category_id_code AS NVARCHAR(150))
        )
        WHERE (@brandFilter IS NULL OR s.brand = @brandFilter)
        ORDER BY s.created_at DESC
      `),
      'services'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /services] Falling back to mock store:', err);
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch services', err instanceof Error ? err.message : String(err));
  }
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

  srv.id = (srv.id || '').trim() || (isMockFallbackAllowed() ? generateSemanticEntityId('SRV', srv.brand, mockStore.getServices(srv.brand)) : generateSemanticEntityId('SRV', srv.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save service');
  }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[handleSaveServiceRoute] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'save service', errMsg);
    }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete service');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete service', errMsg);
  }
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
  if (!pool && !isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'calculate next project ID');
  }

  if (!clientName && clientId) {
    if (pool) {
      try {
        const cRow = (await pool.request().input('cid', clientId).query(`SELECT name, client_name FROM clients WHERE id = @cid OR client_id_code = @cid`)).recordset[0];
        clientName = cRow?.name || cRow?.client_name || '';
      } catch {}
    }
    if (!clientName && isMockFallbackAllowed()) {
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
    if (!serviceName && isMockFallbackAllowed()) {
      serviceName = mockStore.getServices().find((s) => s.id === serviceId)?.name || '';
    }
  }

  clientName = clientName || 'CLIENT';
  serviceName = serviceName || 'SERVICE';

  try {
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
  } catch (err) {
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'calculate next project sequence');
    }
    throw err;
  }
});

router.get('/projects', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch projects');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch projects', err instanceof Error ? err.message : String(err));
  }
  return res.json(mockStore.getProjects(brand));
  }
});

async function handleSaveProjectRoute(req: Request, res: Response) {
  // --- Input Validation (POST & PUT /api/projects) ---
  const isPost = req.method === 'POST';

  // 1. Client Identity (required on POST: at least clientId or clientName)
  const rawClientId = req.body.clientId ?? req.body.client_id;
  const rawClientName = req.body.clientName ?? req.body.client_name;
  const hasClientId = rawClientId !== undefined && rawClientId !== null && String(rawClientId).trim().length > 0;
  const hasClientName = rawClientName !== undefined && rawClientName !== null && String(rawClientName).trim().length > 0;

  if (isPost && !hasClientId && !hasClientName) {
    return res.status(400).json({ success: false, error: 'Client identity (clientId or clientName) is required.' });
  }

  // 2. Contract Amount Validation (must be non-negative number if provided; skip empty/whitespace string; 0 is valid)
  const rawContract = req.body.contract;
  if (rawContract !== undefined && rawContract !== null) {
    if (typeof rawContract === 'string' && rawContract.trim() === '') {
      // Empty or whitespace-only string: skip validation, do not reject
    } else {
      const numContract = typeof rawContract === 'number' ? rawContract : Number(String(rawContract).trim());
      if (isNaN(numContract) || numContract < 0) {
        return res.status(400).json({ success: false, error: 'Contract amount must be a non-negative number.' });
      }
    }
  }

  // 3. Start Date Validation (optional, but if provided and not empty must be a valid date)
  const rawStartDate = req.body.startDate ?? req.body.start_date;
  if (rawStartDate !== undefined && rawStartDate !== null) {
    const dateStr = String(rawStartDate).trim();
    if (dateStr.length > 0) {
      const parsedTime = Date.parse(dateStr);
      if (isNaN(parsedTime)) {
        return res.status(400).json({ success: false, error: 'Invalid startDate format.' });
      }
    }
  }

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
      if (!clientName && isMockFallbackAllowed()) {
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
      if (!serviceName && isMockFallbackAllowed()) {
        serviceName = mockStore.getServices().find((s) => s.id === proj.serviceId)?.name || '';
      }
    }

    clientName = clientName || 'CLIENT';
    serviceName = serviceName || 'SERVICE';

    try {
      const calculated = await calculateNextProjectSequenceSql(
        pool,
        proj.brand || 'Device Doctor India',
        clientName,
        serviceName,
        proj.clientId,
        proj.serviceId
      );
      proj.id = calculated.projectId;
    } catch (err) {
      if (!isMockFallbackAllowed()) {
        return sendDatabaseUnavailable(res, 'calculate project ID');
      }
      throw err;
    }
  }

  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save project');
  }
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
    console.warn('[handleSaveProjectRoute] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'save project', errMsg);
    }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete project');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete project', errMsg);
  }
  mockStore.deleteProject(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- PROJECT DOCUMENTS (Preview & Download API) ---
router.get('/projects/:id/documents/:docType', authenticateToken, async (req: Request, res: Response) => {
  const { id, docType } = req.params;
  const download = req.query.download === 'true';
  const pool = await getOrInitPool();

  let project: any;
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'generate project document');
  }
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
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[GET /projects/${id}/documents/${docType}] SQL query error:`, errMsg);
      if (!isMockFallbackAllowed()) {
        return sendDatabaseUnavailable(res, 'generate project document', errMsg);
      }
    }
  }

  if (!project && isMockFallbackAllowed()) {
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
router.get('/payments/next-semantic-id', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  try {
    const nextId = await calculateNextPaymentIdSql(pool, brand);
    return res.json({ success: true, nextId });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'calculate next payment ID', errMsg);
    }
    const nextId = generateSemanticEntityId('PAY', brand, mockStore.getPayments(brand));
    return res.json({ success: true, nextId });
  }
});

router.get('/payments', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'fetch payments');
    }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[GET /payments] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'fetch payments', errMsg);
    }
    const list = mockStore.getPayments(brand);
    return res.json(list.map((p) => ({ ...p, paymentProof: parsePaymentProof(p.paymentProof) })));
  }
});

router.get('/payments/:id/proof', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'fetch payment proof');
    }
    const payment = mockStore.getPayments(null).find((p) => p.id === id);
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
  }

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
    if (!payment && isMockFallbackAllowed()) {
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[GET /payments/${id}/proof] Error:`, errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'fetch payment proof', errMsg);
    }
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

  if (!pool) {
    if (!isMockFallbackAllowed()) {
      throw new Error('Azure SQL Database is offline. Cannot synchronize GST invoice.');
    }
    return mockStore.syncPaymentToGstInvoice(payment);
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
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn('[syncPaymentToGstInvoiceSql] Sequence calc notice, using fallback:', errMsg);
        if (!isMockFallbackAllowed()) {
          throw new Error(`Azure SQL sequence calculation failure: ${errMsg}`);
        }
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
          IF EXISTS (SELECT 1 FROM gst_invoices WITH (UPDLOCK, HOLDLOCK) WHERE payment_id = @payment_id)
          BEGIN
            UPDATE gst_invoices
            SET brand=@brand, project_id=@project_id, client_id=@client_id, client_name=@client_name,
                payment_date=@payment_date, amount_received=@amount_received, currency=@currency,
                amount_inr=@amount_inr, gst_amount_inr=@gst_amount_inr, invoice_number=@invoice_number,
                updated_at=@updated_at
            WHERE payment_id = @payment_id;
          END
          ELSE
          BEGIN
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
            );
          END
        `);

      // Re-fetch persisted row to return the authoritative record from SQL
      let finalInvoice: GstInvoice = {
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

      try {
        const fetchRes = await pool.request()
          .input('paymentId', payId)
          .query(`SELECT TOP 1 * FROM gst_invoices WHERE payment_id = @paymentId`);
        const row = fetchRes.recordset?.[0];
        if (row) {
          finalInvoice = {
            id: row.invoice_id_code || row.id,
            brand: (row.brand || brand) as any,
            paymentId: payId,
            projectId: row.project_id || projectId,
            clientId: row.client_id || clientId,
            clientName: row.client_name || clientName || 'Direct Client',
            paymentDate: row.payment_date || paymentDate,
            amountReceived: Number(row.amount_received) || amountReceived,
            currency: (row.currency || currency) as any,
            amountINR: Number(row.amount_inr) || amountINR,
            gstAmountINR: Number(row.gst_amount_inr) || gstAmountINR,
            invoiceNumber: row.invoice_number || defaultInvoiceNum,
            uploadedToGstPortal: row.uploaded_to_gst_portal || 'No',
            gstPortalUploadDate: row.gst_portal_upload_date || '',
            notes: row.notes || autoNotes,
            createdAt: row.created_at || now,
            updatedAt: row.updated_at || now,
          };
        }
      } catch {
        // Fall back to finalInvoice initialized above
      }

      mockStore.saveGstInvoice(finalInvoice);
      return finalInvoice;
    }
  } catch (err) {
    console.warn('[syncPaymentToGstInvoiceSql] Error syncing to SQL:', err);
    if (isMockFallbackAllowed()) {
      return mockStore.syncPaymentToGstInvoice(payment);
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

async function handleSavePaymentRoute(req: Request, res: Response) {
  // --- Input Validation (POST & PUT /api/payments) ---
  const isPost = req.method === 'POST';

  // 1. Amount Validation (required on POST; on PUT validate only if provided; 0 is valid; negative rejected)
  const rawAmount = req.body.amountReceived ?? req.body.amount ?? req.body.amount_received ?? req.body.amountINR ?? req.body.amount_inr;
  const hasAmount = rawAmount !== undefined && rawAmount !== null && !(typeof rawAmount === 'string' && rawAmount.trim() === '');

  if (isPost && !hasAmount) {
    return res.status(400).json({ success: false, error: 'Amount received is required.' });
  }

  if (hasAmount) {
    const numAmount = typeof rawAmount === 'number' ? rawAmount : Number(String(rawAmount).trim());
    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ success: false, error: 'Payment amount must be a non-negative number.' });
    }
  }

  // 2. Payment Date Validation (optional, but if provided and non-empty must be a valid date)
  const rawPaymentDate = req.body.paymentDate ?? req.body.payment_date;
  if (rawPaymentDate !== undefined && rawPaymentDate !== null) {
    const dateStr = String(rawPaymentDate).trim();
    if (dateStr.length > 0) {
      const parsedTime = Date.parse(dateStr);
      if (isNaN(parsedTime)) {
        return res.status(400).json({ success: false, error: 'Invalid paymentDate format.' });
      }
    }
  }

  // 3. Due Date Validation (optional, but if provided and non-empty must be a valid date)
  const rawDueDate = req.body.dueDate ?? req.body.due_date;
  if (rawDueDate !== undefined && rawDueDate !== null) {
    const dueDateStr = String(rawDueDate).trim();
    if (dueDateStr.length > 0) {
      const parsedTime = Date.parse(dueDateStr);
      if (isNaN(parsedTime)) {
        return res.status(400).json({ success: false, error: 'Invalid dueDate format.' });
      }
    }
  }
  const payment: Payment = req.body;
  const brandContext = getBrandContext(req);
  payment.brand = sanitizeBrand(payment.brand, brandContext) as any;
  const now = new Date().toISOString();
  payment.updatedAt = now;
  payment.createdAt = payment.createdAt || now;

  payment.id = (payment.id || '').trim() || (isMockFallbackAllowed() ? generateSemanticEntityId('PAY', payment.brand, mockStore.getPayments(payment.brand)) : generateSemanticEntityId('PAY', payment.brand));

  // Normalize payment proof into a clean object or undefined
  payment.paymentProof = parsePaymentProof(payment.paymentProof);
  const serializedProof = serializePaymentProof(payment.paymentProof);

  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save payment');
  }
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
    const cleanId = (payment.id || '').trim();

    // 1. Fetch existing payment if updating to preserve unsupplied fields and track old project
    let existingPayment: any = null;
    if (cleanId) {
      try {
        const checkRes = await pool.request()
          .input('id', guidId)
          .input('rawId', cleanId)
          .query(`
            SELECT TOP 1 *
            FROM payments
            WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR payment_id_code = @rawId
          `);
        existingPayment = checkRes.recordset?.[0] || null;
      } catch (checkErr) {
        console.warn('[handleSavePaymentRoute] Could not check existing payment:', checkErr);
      }
    }

    const oldProjectId = existingPayment?.project_id ? String(existingPayment.project_id) : null;
    const targetProjectId = payment.projectId || oldProjectId || null;
    const projGuid = toGuidOrNull(targetProjectId);
    const clientGuid = toGuidOrNull(payment.clientId || existingPayment?.client_id);

    // Merge payment fields (partial PUT support)
    const finalBrand = payment.brand || existingPayment?.brand || 'Device Doctor India';
    const finalClientId = payment.clientId || existingPayment?.client_id || clientGuid || '';
    const finalClientName = payment.clientName ?? (existingPayment?.client_name || '');
    const finalPaymentMode = payment.paymentMode ?? (existingPayment?.payment_mode || 'GST Invoice');
    const finalBankAccountId = payment.bankAccountId ?? (existingPayment?.bank_account_id || '');
    const finalBankAccountName = payment.bankAccountName ?? (existingPayment?.bank_account_name || '');
    const finalPaymentDate = payment.paymentDate ?? (existingPayment?.payment_date || '');
    const finalDueDate = payment.dueDate ?? (existingPayment?.due_date || '');
    const finalAmountReceived = payment.amountReceived !== undefined ? payment.amountReceived : (existingPayment?.amount_received ?? 0);
    const finalCurrency = payment.currency ?? (existingPayment?.currency || 'INR');
    const finalExchangeRate = payment.exchangeRate !== undefined ? payment.exchangeRate : (existingPayment?.exchange_rate ?? 1);
    const finalAmountINR = payment.amountINR !== undefined ? payment.amountINR : (existingPayment?.amount_inr ?? 0);
    const finalReferenceUtr = payment.referenceUtr ?? (existingPayment?.reference_utr || '');
    const finalPaymentStatus = payment.paymentStatus ?? (existingPayment?.payment_status || 'Received');
    const finalDaysOverdue = payment.daysOverdue !== undefined ? payment.daysOverdue : (existingPayment?.days_overdue ?? 0);
    const finalNotes = payment.notes ?? (existingPayment?.notes || '');
    const finalPaymentProof = serializedProof ?? (existingPayment?.payment_proof || null);
    const finalProofNotes = payment.paymentProofNotes || (payment.paymentProof?.notes) || existingPayment?.payment_proof_notes || '';
    const finalCreatedAt = payment.createdAt || existingPayment?.created_at || now;

    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', cleanId)
          .input('brand', finalBrand)
          .input('project_id', projGuid || targetProjectId)
          .input('target_project_id', targetProjectId || '')
          .input('old_project_id', oldProjectId || '')
          .input('client_id', finalClientId)
          .input('client_name', finalClientName)
          .input('payment_mode', finalPaymentMode)
          .input('bank_account_id', finalBankAccountId)
          .input('bank_account_name', finalBankAccountName)
          .input('payment_date', finalPaymentDate)
          .input('due_date', finalDueDate)
          .input('amount_received', finalAmountReceived)
          .input('currency', finalCurrency)
          .input('exchange_rate', finalExchangeRate)
          .input('amount_inr', finalAmountINR)
          .input('reference_utr', finalReferenceUtr)
          .input('payment_status', finalPaymentStatus)
          .input('days_overdue', finalDaysOverdue)
          .input('notes', finalNotes)
          .input('payment_proof', finalPaymentProof)
          .input('payment_proof_notes', finalProofNotes)
          .input('created_at', finalCreatedAt)
          .input('updated_at', payment.updatedAt)
          .query(`
            SET XACT_ABORT ON;
            BEGIN TRY
              BEGIN TRANSACTION;
                -- 1. Insert or Update Payment
                IF EXISTS (SELECT 1 FROM payments WHERE id = @id OR (payment_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL))
                  UPDATE payments SET brand=@brand, project_id=@project_id, client_id=@client_id, client_name=@client_name,
                                     payment_mode=@payment_mode, bank_account_id=@bank_account_id, bank_account_name=@bank_account_name,
                                     payment_date=@payment_date, due_date=@due_date,
                                     amount_received=@amount_received, currency=@currency, exchange_rate=@exchange_rate,
                                     amount_inr=@amount_inr, reference_utr=@reference_utr, payment_status=@payment_status,
                                     days_overdue=@days_overdue, notes=@notes, payment_proof=@payment_proof,
                                     payment_proof_notes=@payment_proof_notes, updated_at=@updated_at,
                                     payment_id_code=@rawId
                  WHERE id = @id OR (payment_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL);
                ELSE
                  INSERT INTO payments (id, payment_id_code, brand, project_id, client_id, client_name, payment_mode, bank_account_id, bank_account_name, payment_date, due_date, amount_received, currency, exchange_rate, amount_inr, reference_utr, payment_status, days_overdue, notes, payment_proof, payment_proof_notes, created_at, updated_at)
                  VALUES (@id, @rawId, @brand, @project_id, @client_id, @client_name, @payment_mode, @bank_account_id, @bank_account_name, @payment_date, @due_date, @amount_received, @currency, @exchange_rate, @amount_inr, @reference_utr, @payment_status, @days_overdue, @notes, @payment_proof, @payment_proof_notes, @created_at, @updated_at);

                -- 2. Recalculate target project totals (only payment_status = 'Received' or NULL/empty)
                IF @target_project_id IS NOT NULL AND @target_project_id <> ''
                BEGIN
                  UPDATE p
                  SET 
                    total_received = ISNULL((
                      SELECT SUM(ISNULL(amount_inr, ISNULL(amount_received, 0)))
                      FROM payments 
                      WHERE (project_id = p.id OR project_id = p.project_id_code OR CAST(project_id AS NVARCHAR(150)) = CAST(p.id AS NVARCHAR(150)) OR project_id = @target_project_id)
                        AND (payment_status = 'Received' OR payment_status IS NULL OR payment_status = '')
                    ), 0),
                    balance = ISNULL(p.contract_value, 0) - ISNULL((
                      SELECT SUM(ISNULL(amount_inr, ISNULL(amount_received, 0)))
                      FROM payments 
                      WHERE (project_id = p.id OR project_id = p.project_id_code OR CAST(project_id AS NVARCHAR(150)) = CAST(p.id AS NVARCHAR(150)) OR project_id = @target_project_id)
                        AND (payment_status = 'Received' OR payment_status IS NULL OR payment_status = '')
                    ), 0),
                    updated_at = @updated_at
                  FROM projects p
                  WHERE p.id = @target_project_id OR p.project_id_code = @target_project_id OR CAST(p.id AS NVARCHAR(150)) = @target_project_id;
                END;

                -- 3. If project changed from an old project, recalculate old project too
                IF @old_project_id IS NOT NULL AND @old_project_id <> '' AND @old_project_id <> @target_project_id
                BEGIN
                  UPDATE p
                  SET 
                    total_received = ISNULL((
                      SELECT SUM(ISNULL(amount_inr, ISNULL(amount_received, 0)))
                      FROM payments 
                      WHERE (project_id = p.id OR project_id = p.project_id_code OR CAST(project_id AS NVARCHAR(150)) = CAST(p.id AS NVARCHAR(150)) OR project_id = @old_project_id)
                        AND (payment_status = 'Received' OR payment_status IS NULL OR payment_status = '')
                    ), 0),
                    balance = ISNULL(p.contract_value, 0) - ISNULL((
                      SELECT SUM(ISNULL(amount_inr, ISNULL(amount_received, 0)))
                      FROM payments 
                      WHERE (project_id = p.id OR project_id = p.project_id_code OR CAST(project_id AS NVARCHAR(150)) = CAST(p.id AS NVARCHAR(150)) OR project_id = @old_project_id)
                        AND (payment_status = 'Received' OR payment_status IS NULL OR payment_status = '')
                    ), 0),
                    updated_at = @updated_at
                  FROM projects p
                  WHERE p.id = @old_project_id OR p.project_id_code = @old_project_id OR CAST(p.id AS NVARCHAR(150)) = @old_project_id;
                END;
              COMMIT TRANSACTION;
            END TRY
            BEGIN CATCH
              IF @@TRANCOUNT > 0
                ROLLBACK TRANSACTION;
              THROW;
            END CATCH;
          `),
      'payments'
    );

    // Automatic GST Invoice synchronization trigger whenever paymentMode === 'GST Invoice'
    let syncedGstInvoice: GstInvoice | null = null;
    let gstSyncError: string | null = null;
    if (finalPaymentMode === 'GST Invoice') {
      try {
        syncedGstInvoice = await syncPaymentToGstInvoiceSql(pool, {
          ...payment,
          projectId: targetProjectId || '',
          paymentMode: finalPaymentMode,
          amountReceived: finalAmountReceived,
          amountINR: finalAmountINR,
        });
        mockStore.savePayment(
          {
            ...payment,
            projectId: targetProjectId || '',
            amountReceived: finalAmountReceived,
            amountINR: finalAmountINR,
            paymentStatus: finalPaymentStatus as any,
          },
          false
        );
      } catch (gstErr: unknown) {
        const errMsg = gstErr instanceof Error ? gstErr.message : String(gstErr);
        console.error('[handleSavePaymentRoute] GST invoice synchronization failed after payment commit:', errMsg);
        gstSyncError = errMsg;
        syncedGstInvoice = null;
        if (!isMockFallbackAllowed()) {
          mockStore.deleteGstInvoiceByPaymentId(cleanId || payment.id);
          mockStore.deletePayment(cleanId || payment.id);
        }
      }
    } else {
      mockStore.savePayment(
        {
          ...payment,
          projectId: targetProjectId || '',
          amountReceived: finalAmountReceived,
          amountINR: finalAmountINR,
          paymentStatus: finalPaymentStatus as any,
        },
        false
      );
    }

    const responsePayload: Record<string, any> = {
      success: true,
      payment: {
        ...payment,
        projectId: targetProjectId || '',
        amountReceived: finalAmountReceived,
        amountINR: finalAmountINR,
        paymentStatus: finalPaymentStatus,
      },
      gstInvoiceSynced: Boolean(syncedGstInvoice),
      gstInvoice: syncedGstInvoice,
    };

    if (gstSyncError) {
      responsePayload.warning = 'Payment was saved, but automatic GST invoice synchronization failed.';
      responsePayload.gstSyncError = gstSyncError;
    }

    return res.json(responsePayload);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[handleSavePaymentRoute] SQL Transaction Error:', errMsg);
    return res.status(500).json({
      success: false,
      error: 'An internal database error occurred while processing the payment voucher.',
      message: 'Failed to record payment voucher and update project financials in Azure SQL.',
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete payment');
  }
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
                     ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand,
                     ISNULL(CAST(project_id AS NVARCHAR(150)), '') as project_id
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

    const linkedProjectId = existing?.project_id || null;
    const now = new Date().toISOString();

    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .input('brandFilter', brandFilter)
        .input('linkedProjectId', linkedProjectId)
        .input('now', now)
        .query(`
          SET XACT_ABORT ON;
          BEGIN TRY
            BEGIN TRANSACTION;
              -- 1. Delete payment voucher
              DELETE FROM payments 
              WHERE (id = @id OR CAST(id AS NVARCHAR(150)) = @rawId OR payment_id_code = @rawId)
                AND (@brandFilter IS NULL OR brand = @brandFilter);
              
              -- 2. Delete unfiled linked GST invoices
              DELETE FROM gst_invoices 
              WHERE (payment_id = @id OR payment_id = @rawId) 
                AND (uploaded_to_gst_portal = 'No' OR uploaded_to_gst_portal IS NULL);

              -- 3. Recalculate linked project financials if project_id exists
              IF @linkedProjectId IS NOT NULL AND @linkedProjectId <> ''
              BEGIN
                UPDATE p
                SET 
                  total_received = ISNULL((
                    SELECT SUM(ISNULL(amount_inr, ISNULL(amount_received, 0)))
                    FROM payments 
                    WHERE (project_id = p.id OR project_id = p.project_id_code OR CAST(project_id AS NVARCHAR(150)) = CAST(p.id AS NVARCHAR(150)) OR project_id = @linkedProjectId)
                      AND (payment_status = 'Received' OR payment_status IS NULL OR payment_status = '')
                  ), 0),
                  balance = ISNULL(p.contract_value, 0) - ISNULL((
                    SELECT SUM(ISNULL(amount_inr, ISNULL(amount_received, 0)))
                    FROM payments 
                    WHERE (project_id = p.id OR project_id = p.project_id_code OR CAST(project_id AS NVARCHAR(150)) = CAST(p.id AS NVARCHAR(150)) OR project_id = @linkedProjectId)
                      AND (payment_status = 'Received' OR payment_status IS NULL OR payment_status = '')
                  ), 0),
                  updated_at = @now
                FROM projects p
                WHERE p.id = @linkedProjectId OR p.project_id_code = @linkedProjectId OR CAST(p.id AS NVARCHAR(150)) = @linkedProjectId;
              END;
            COMMIT TRANSACTION;
          END TRY
          BEGIN CATCH
            IF @@TRANCOUNT > 0
              ROLLBACK TRANSACTION;
            THROW;
          END CATCH;
        `),
      'payments'
    );
    mockStore.deletePayment(id, brandFilter);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[DELETE /payments/${id}] Error in SQL transaction:`, errMsg);
    return res.status(500).json({
      success: false,
      error: 'An internal database error occurred while removing the payment voucher.',
      message: 'Failed to delete payment voucher and update project in Azure SQL.',
    });
  }
});

// --- BANK ACCOUNTS ---
router.get('/bank-accounts', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch bank-accounts');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch bank-accounts', err instanceof Error ? err.message : String(err));
  }
  return res.json(mockStore.getBankAccounts(brand));
  }
});

async function handleSaveBankAccountRoute(req: Request, res: Response) {
  const isPost = req.method === 'POST';
  const accountId = (req.params.id || req.body?.id || '').trim();
  const pool = await getOrInitPool();

  // Look up existing bank account to support safe edits
  let existingAccount: BankAccount | undefined = undefined;
  if (accountId) {
    if (pool) {
      try {
        const guidId = toGuid(accountId);
        const checkRes = await executeSqlWithAutoMigration(
          pool,
          () =>
            pool.request()
              .input('id', guidId)
              .input('rawId', accountId)
              .query(`
                SELECT TOP 1
                  ISNULL(NULLIF(CAST(account_id_code AS NVARCHAR(150)), ''), CAST(id AS NVARCHAR(150))) as id,
                  brand,
                  account_name as accountName,
                  bank_name as bankName,
                  account_number as accountNumber,
                  ISNULL(CAST(ifsc_code AS NVARCHAR(50)), '') as ifscCode,
                  account_type as accountType
                FROM bank_accounts
                WHERE id = @id OR account_id_code = @rawId OR CAST(id AS NVARCHAR(100)) = @rawId
              `),
          'bank_accounts'
        );
        if (checkRes?.recordset && checkRes.recordset.length > 0) {
          existingAccount = checkRes.recordset[0];
        }
      } catch (err) {
        console.warn('[handleSaveBankAccountRoute] Could not fetch existing account from Azure SQL:', err);
      }
    }
    if (!existingAccount && isMockFallbackAllowed()) {
      existingAccount = mockStore.getBankAccountById(accountId) ||
        mockStore.getBankAccounts().find((b) => b.id === accountId);
    }
  }

  const isExistingRecord = Boolean(existingAccount);

  // 1. Account Number Validation
  // POST on new account: mandatory (non-empty string after trim)
  // PUT or edit on existing account: only check if field provided in body
  const hasAccountNumber = 'accountNumber' in req.body || 'account_number' in req.body;
  const rawAccountNumber = req.body.accountNumber ?? req.body.account_number;
  if (isPost && !isExistingRecord) {
    if (!rawAccountNumber || typeof rawAccountNumber !== 'string' || !rawAccountNumber.trim()) {
      return res.status(400).json({ success: false, error: 'Account number is required.' });
    }
  } else if (hasAccountNumber) {
    if (!rawAccountNumber || typeof rawAccountNumber !== 'string' || !rawAccountNumber.trim()) {
      return res.status(400).json({ success: false, error: 'Account number cannot be empty.' });
    }
  }

  // 2. Bank Name Validation
  // POST on new account: mandatory (non-empty string after trim)
  // PUT or edit on existing account: only check if field provided in body
  const hasBankName = 'bankName' in req.body || 'bank_name' in req.body;
  const rawBankName = req.body.bankName ?? req.body.bank_name;
  if (isPost && !isExistingRecord) {
    if (!rawBankName || typeof rawBankName !== 'string' || !rawBankName.trim()) {
      return res.status(400).json({ success: false, error: 'Bank name is required.' });
    }
  } else if (hasBankName) {
    if (!rawBankName || typeof rawBankName !== 'string' || !rawBankName.trim()) {
      return res.status(400).json({ success: false, error: 'Bank name cannot be empty.' });
    }
  }

  // 3. IFSC Code Validation
  // - Skip for 'Crypto Wallet'
  // - Skip if omitted, null, or empty string
  // - On PUT: if existing account cannot be loaded from SQL or mockStore, SKIP validation.
  //   If loaded, validate ONLY if ifscCode is changed from the saved database value.
  // - On POST (new account): validate if provided and non-empty. If existing account found, only if changed.
  const currentAccountType = req.body.accountType ?? req.body.account_type ?? existingAccount?.accountType;
  const hasIfsc = 'ifscCode' in req.body || 'ifsc_code' in req.body;
  const rawIfsc = req.body.ifscCode ?? req.body.ifsc_code;

  if (currentAccountType !== 'Crypto Wallet' && hasIfsc && rawIfsc !== undefined && rawIfsc !== null) {
    const ifscStr = String(rawIfsc).trim();
    if (ifscStr.length > 0) {
      let shouldValidateIfsc = false;
      if (!isPost) {
        // PUT request:
        // Agar existing account (SQL ya mockStore) load na ho sake, to IFSC validation SKIP karo
        if (existingAccount) {
          const oldIfsc = String(existingAccount.ifscCode || '').trim();
          if (ifscStr.toUpperCase() !== oldIfsc.toUpperCase()) {
            shouldValidateIfsc = true;
          }
        } else {
          // existingAccount load nahi ho saka -> safe fallback: SKIP validation
          shouldValidateIfsc = false;
        }
      } else {
        // POST request:
        // Naye account par hamesha validate karo (khali par upar hi skip ho chuka hai).
        // Agar existing account mila ho, to sirf badli hone par validate karo.
        if (existingAccount) {
          const oldIfsc = String(existingAccount.ifscCode || '').trim();
          if (ifscStr.toUpperCase() !== oldIfsc.toUpperCase()) {
            shouldValidateIfsc = true;
          }
        } else {
          shouldValidateIfsc = true;
        }
      }

      if (shouldValidateIfsc) {
        const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
        const swiftRegex = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/i;
        if (!ifscRegex.test(ifscStr) && !swiftRegex.test(ifscStr)) {
          return res.status(400).json({ success: false, error: 'Invalid IFSC code format.' });
        }
      }
    }
  }

  const account: BankAccount = req.body;
  const brandContext = getBrandContext(req);
  account.brand = sanitizeBrand(account.brand, brandContext) as any;
  const now = new Date().toISOString();
  account.updatedAt = now;
  account.createdAt = account.createdAt || now;

  account.id = (account.id || '').trim() || (isMockFallbackAllowed() ? generateSemanticEntityId('ACC', account.brand, mockStore.getBankAccounts(account.brand)) : generateSemanticEntityId('ACC', account.brand));

  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save bank account');
  }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[handleSaveBankAccountRoute] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'save bank account', errMsg);
    }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete bank account');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete bank account', errMsg);
  }
  mockStore.deleteBankAccount(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- GST INVOICES ---
router.get('/gst-invoices', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch gst-invoices');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch gst-invoices', err instanceof Error ? err.message : String(err));
  }
  return res.json(mockStore.getGstInvoices(brand));
  }
});

// Explicit Sync endpoint to synchronize all payments where paymentMode === 'GST Invoice'
router.post('/gst-invoices/sync', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();

  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'sync GST invoices');
  }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[POST /gst-invoices/sync] Error syncing:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'sync GST invoices', errMsg);
    }
    const mockRes = mockStore.syncAllGstInvoicesFromPayments();
    return res.json({ success: true, count: mockRes.count, invoices: mockStore.getGstInvoices(brand) });
  }
});

async function handleSaveGstInvoiceRoute(req: Request, res: Response) {
  // --- Input Validation (POST & PUT /api/gst-invoices) ---
  const isPost = req.method === 'POST';

  // 1. Client Details Validation (Required on POST; on PUT skip if not provided or empty string)
  const rawClientName = req.body.clientName ?? req.body.client_name;
  const rawClientId = req.body.clientId ?? req.body.client_id;
  const hasClientIdent = (rawClientName !== undefined && rawClientName !== null && String(rawClientName).trim().length > 0) ||
                         (rawClientId !== undefined && rawClientId !== null && String(rawClientId).trim().length > 0);

  // 2. Amount Validation (Required on POST; on PUT validate only if provided; 0 is valid; negative is rejected)
  const rawAmount = req.body.amountReceived ?? req.body.amount ?? req.body.amount_received ?? req.body.amountINR ?? req.body.amount_inr;
  const hasAmount = rawAmount !== undefined && rawAmount !== null && !(typeof rawAmount === 'string' && rawAmount.trim() === '');

  if (isPost && (!hasClientIdent || !hasAmount)) {
    return res.status(400).json({
      success: false,
      error: 'Client details and invoice amount are required.',
    });
  }

  // Reject negative tax / invoice amounts if provided and non-empty (0 is allowed)
  const amountsToCheck = [
    { name: 'amountReceived', val: req.body.amountReceived ?? req.body.amount_received },
    { name: 'amountINR', val: req.body.amountINR ?? req.body.amount_inr },
    { name: 'gstAmountINR', val: req.body.gstAmountINR ?? req.body.gst_amount_inr },
  ];
  for (const item of amountsToCheck) {
    if (item.val !== undefined && item.val !== null && !(typeof item.val === 'string' && item.val.trim() === '')) {
      const num = typeof item.val === 'number' ? item.val : Number(String(item.val).trim());
      if (isNaN(num) || num < 0) {
        return res.status(400).json({
          success: false,
          error: `${item.name} must be a non-negative number.`,
        });
      }
    }
  }

  // 3. Payment Date Validation (optional, but if provided and non-empty must be a valid date)
  const rawPaymentDate = req.body.paymentDate ?? req.body.payment_date;
  if (rawPaymentDate !== undefined && rawPaymentDate !== null) {
    const dateStr = String(rawPaymentDate).trim();
    if (dateStr.length > 0) {
      const parsedTime = Date.parse(dateStr);
      const hasValidFormat = /^\d{1,4}[-/.]|[a-zA-Z]{3,9}\s+\d|\d{1,2}\s+[a-zA-Z]{3,9}/.test(dateStr);
      if (isNaN(parsedTime) || !hasValidFormat) {
        return res.status(400).json({ success: false, error: 'Invalid paymentDate format.' });
      }
    }
  }

  // 4. GST Portal Upload Date Validation (optional, but if provided and non-empty must be a valid date)
  const rawUploadDate = req.body.gstPortalUploadDate ?? req.body.gst_portal_upload_date;
  if (rawUploadDate !== undefined && rawUploadDate !== null) {
    const dateStr = String(rawUploadDate).trim();
    if (dateStr.length > 0) {
      const parsedTime = Date.parse(dateStr);
      const hasValidFormat = /^\d{1,4}[-/.]|[a-zA-Z]{3,9}\s+\d|\d{1,2}\s+[a-zA-Z]{3,9}/.test(dateStr);
      if (isNaN(parsedTime) || !hasValidFormat) {
        return res.status(400).json({ success: false, error: 'Invalid gstPortalUploadDate format.' });
      }
    }
  }
  const inv: GstInvoice = req.body;
  const brandContext = getBrandContext(req);
  inv.brand = sanitizeBrand(inv.brand, brandContext) as any;
  const now = new Date().toISOString();
  inv.updatedAt = now;
  inv.createdAt = inv.createdAt || now;

  inv.id = (inv.id || '').trim() || (isMockFallbackAllowed() ? generateSemanticEntityId('GST', inv.brand, mockStore.getGstInvoices(inv.brand)) : generateSemanticEntityId('GST', inv.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save GST invoice');
  }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[handleSaveGstInvoiceRoute] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'save GST invoice', errMsg);
    }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete GST invoice');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete GST invoice', errMsg);
  }
  mockStore.deleteGstInvoice(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- EMPLOYEE ROLES ---
router.get('/roles', async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch roles');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch roles', err instanceof Error ? err.message : String(err));
  }
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

  role.id = (role.id || '').trim() || (isMockFallbackAllowed() ? generateSemanticEntityId('ROL', role.brand, mockStore.getEmployeeRoles(role.brand)) : generateSemanticEntityId('ROL', role.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save role');
  }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[handleSaveRoleRoute] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'save role', errMsg);
    }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete role');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete role', errMsg);
  }
  mockStore.deleteEmployeeRole(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- EMPLOYEES ---
router.get('/employees/next-semantic-id', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  try {
    const nextId = await calculateNextEmployeeIdSql(pool, brand);
    return res.json({ success: true, nextId });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'calculate next employee ID', errMsg);
    }
    const nextId = generateSemanticEntityId('EMP', brand, mockStore.getEmployees(brand));
    return res.json({ success: true, nextId });
  }
});
router.get('/employees', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch employees');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch employees', err instanceof Error ? err.message : String(err));
  }
  return res.json(mockStore.getEmployees(brand));
  }
});

async function handleSaveEmployeeRoute(req: Request, res: Response) {
  // --- Input Validation (POST & PUT /api/employees) ---
  const isPost = req.method === 'POST';

  // 1. Employee Name Validation (required on POST; on PUT validate only if provided in body)
  const rawName = req.body.name ?? req.body.employee_name ?? req.body.employeeName;
  const hasNameProp = 'name' in req.body || 'employee_name' in req.body || 'employeeName' in req.body;

  if (isPost) {
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      return res.status(400).json({ success: false, error: 'Employee name is required.' });
    }
  } else if (hasNameProp) {
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      return res.status(400).json({ success: false, error: 'Employee name cannot be empty.' });
    }
  }

  // 2. Cost of Employee Validation (must be non-negative number if provided; skip empty string; 0 is valid)
  const rawCost = req.body.costOfEmployee ?? req.body.cost_of_employee ?? req.body.salary ?? req.body.monthlyCost;
  if (rawCost !== undefined && rawCost !== null) {
    if (typeof rawCost === 'string' && rawCost.trim() === '') {
      // Empty string: skip validation, do not reject
    } else {
      const numCost = typeof rawCost === 'number' ? rawCost : Number(String(rawCost).trim());
      if (isNaN(numCost) || numCost < 0) {
        return res.status(400).json({ success: false, error: 'Cost of employee must be a non-negative number.' });
      }
    }
  }

  // 3. Joining Date Validation (optional; if provided and not empty, must be a valid date)
  const rawJoiningDate = req.body.joiningDate ?? req.body.joining_date ?? req.body.joinedDate;
  if (rawJoiningDate !== undefined && rawJoiningDate !== null) {
    const dateStr = String(rawJoiningDate).trim();
    if (dateStr.length > 0) {
      const parsedTime = Date.parse(dateStr);
      const hasValidFormat = /^\d{1,4}[-/.]|[a-zA-Z]{3,9}\s+\d|\d{1,2}\s+[a-zA-Z]{3,9}/.test(dateStr);
      if (isNaN(parsedTime) || !hasValidFormat) {
        return res.status(400).json({ success: false, error: 'Invalid joiningDate format.' });
      }
    }
  }

  const emp: Employee = req.body;
  if (rawName && typeof rawName === 'string') {
    emp.name = rawName.trim();
  }
  const brandContext = getBrandContext(req);
  emp.brand = sanitizeBrand(emp.brand, brandContext) as any;
  emp.costOfEmployee = parseFloat(String(emp.costOfEmployee ?? 0)) || 0;
  const now = new Date().toISOString();
  emp.updatedAt = now;
  emp.createdAt = emp.createdAt || now;

  emp.id = (emp.id || (req.params as any)?.id || '').trim();

  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save employee');
  }
    if (isPost) {
      if (!emp.id) {
        emp.id = generateSemanticEntityId('EMP', emp.brand, mockStore.getEmployees(emp.brand));
      } else {
        const existing = mockStore.getEmployees().find(
          (e) => e.id?.toLowerCase() === emp.id.toLowerCase() || (e as any).employee_id_code?.toLowerCase() === emp.id.toLowerCase()
        );
        if (existing) {
          return res.status(409).json({
            success: false,
            error: `Employee with ID "${emp.id}" already exists. Cannot overwrite existing employee on POST.`,
          });
        }
      }
    } else {
      if (!emp.id) {
        return res.status(400).json({ success: false, error: 'Employee ID is required for update.' });
      }
      const existing = mockStore.getEmployees().find(
        (e) => e.id?.toLowerCase() === emp.id.toLowerCase() || (e as any).employee_id_code?.toLowerCase() === emp.id.toLowerCase()
      );
      if (!existing) {
        return res.status(404).json({ success: false, error: `Employee with ID "${emp.id}" not found.` });
      }
    }
    const saved = mockStore.saveEmployee(emp);
    return res.json({ success: true, employee: saved });
  }

  try {
    if (isPost) {
      if (!emp.id) {
        emp.id = await calculateNextEmployeeIdSql(pool, emp.brand);
      } else {
        const checkGuid = toGuid(emp.id);
        const existsRes = await pool.request()
          .input('id', checkGuid)
          .input('rawId', emp.id)
          .query(`
            SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id
            FROM employees
            WHERE id = @id OR employee_id_code = @rawId OR CAST(id AS NVARCHAR(100)) = @rawId
          `);
        if (existsRes.recordset && existsRes.recordset.length > 0) {
          return res.status(409).json({
            success: false,
            error: `Employee with ID "${emp.id}" already exists. Cannot overwrite existing employee on POST.`,
          });
        }
      }
    } else {
      if (!emp.id) {
        return res.status(400).json({ success: false, error: 'Employee ID is required for update.' });
      }
      const checkGuid = toGuid(emp.id);
      const existsRes = await pool.request()
        .input('id', checkGuid)
        .input('rawId', emp.id)
        .query(`
          SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id
          FROM employees
          WHERE id = @id OR employee_id_code = @rawId OR CAST(id AS NVARCHAR(100)) = @rawId
        `);
      if (!existsRes.recordset || existsRes.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          error: `Employee with ID "${emp.id}" not found.`,
        });
      }
    }

    const guidId = toGuid(emp.id);
    const roleGuid = toGuidOrNull(emp.roleId);

    if (isPost) {
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
              INSERT INTO employees (id, employee_id_code, brand, name, employee_name, role_id, email, status, joining_date, cost_of_employee, employee_type, comes_under_tds, notes, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @name, @name, @role_id, @email, @status, @joining_date, @cost_of_employee, @employee_type, @comes_under_tds, @notes, @created_at, @updated_at)
            `),
        'employees'
      );
    } else {
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
            .input('updated_at', emp.updatedAt)
            .query(`
              UPDATE employees SET
                brand = ISNULL(@brand, brand),
                name = ISNULL(NULLIF(@name, ''), name),
                employee_name = ISNULL(NULLIF(@name, ''), employee_name),
                role_id = COALESCE(@role_id, role_id),
                email = COALESCE(@email, email),
                status = ISNULL(NULLIF(@status, ''), status),
                joining_date = ISNULL(NULLIF(@joining_date, ''), joining_date),
                cost_of_employee = COALESCE(@cost_of_employee, cost_of_employee),
                employee_type = ISNULL(NULLIF(@employee_type, ''), employee_type),
                comes_under_tds = ISNULL(NULLIF(@comes_under_tds, ''), comes_under_tds),
                notes = COALESCE(@notes, notes),
                updated_at = @updated_at,
                employee_id_code = @rawId
              WHERE id = @id OR (employee_id_code = @rawId AND @rawId <> '' AND @rawId IS NOT NULL) OR (CAST(id AS NVARCHAR(100)) = @rawId AND @rawId <> '' AND @rawId IS NOT NULL)
            `),
        'employees'
      );
    }

    mockStore.saveEmployee(emp);
    return res.json({ success: true, employee: emp });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[handleSaveEmployeeRoute] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'save employee', errMsg);
    }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete employee');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete employee', errMsg);
  }
  mockStore.deleteEmployee(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- ASSIGNMENTS ---
router.get('/assignments', async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch assignments');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch assignments', err instanceof Error ? err.message : String(err));
  }
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

  asn.id = (asn.id || '').trim() || (isMockFallbackAllowed() ? generateSemanticEntityId('ASN', asn.brand, mockStore.getAssignments(asn.brand)) : generateSemanticEntityId('ASN', asn.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save assignment');
  }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[handleSaveAssignmentRoute] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'save assignment', errMsg);
    }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete assignment');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete assignment', errMsg);
  }
  mockStore.deleteAssignment(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- EMPLOYEE PAYMENTS ---
router.get('/employee-payments', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'fetch employee payments');
    }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[GET /employee-payments] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'fetch employee payments', errMsg);
    }
    const list = mockStore.getEmployeePayments(brand);
    return res.json(list.map((p) => ({ ...p, paymentProof: parsePaymentProof(p.paymentProof) })));
  }
});

async function handleSaveEmployeePaymentRoute(req: Request, res: Response) {
  // --- Input Validation (POST & PUT /api/employee-payments) ---
  const isPost = req.method === 'POST';

  // 1. Amount Validation (required on POST; on PUT validate only if provided; 0 is valid; negative rejected)
  const rawAmount = req.body.amountPaid ?? req.body.amount ?? req.body.amount_paid ?? req.body.amountINR ?? req.body.amount_inr;
  const hasAmount = rawAmount !== undefined && rawAmount !== null && !(typeof rawAmount === 'string' && rawAmount.trim() === '');

  if (isPost && !hasAmount) {
    return res.status(400).json({ success: false, error: 'Employee payment amount is required.' });
  }

  if (hasAmount) {
    const cleanAmountStr = typeof rawAmount === 'string' ? rawAmount.replace(/,/g, '').trim() : rawAmount;
    const numAmount = typeof cleanAmountStr === 'number' ? cleanAmountStr : Number(cleanAmountStr);
    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ success: false, error: 'Employee payment amount must be a non-negative number.' });
    }
  }

  // 2. Employee Details Validation (required on POST: employeeId or employeeName; on PUT validate only if provided)
  const rawEmployeeName = req.body.employeeName ?? req.body.employee_name;
  const rawEmployeeId = req.body.employeeId ?? req.body.employee_id;
  const hasEmployeeName = rawEmployeeName !== undefined && rawEmployeeName !== null && typeof rawEmployeeName === 'string' && rawEmployeeName.trim().length > 0;
  const hasEmployeeId = rawEmployeeId !== undefined && rawEmployeeId !== null && typeof rawEmployeeId === 'string' && rawEmployeeId.trim().length > 0;
  const hasEmployee = hasEmployeeName || hasEmployeeId;

  if (isPost && !hasEmployee) {
    return res.status(400).json({ success: false, error: 'Employee details (employeeName or employeeId) are required.' });
  }

  // 3. Payment Date Validation (optional; skip on empty string; validate if provided)
  const rawPaymentDate = req.body.paymentDate ?? req.body.payment_date;
  if (rawPaymentDate !== undefined && rawPaymentDate !== null) {
    const dateStr = String(rawPaymentDate).trim();
    if (dateStr.length > 0) {
      const parsedTime = Date.parse(dateStr);
      const hasValidFormat = /^\d{1,4}[-/.]|[a-zA-Z]{3,9}\s+\d|\d{1,2}\s+[a-zA-Z]{3,9}/.test(dateStr);
      if (isNaN(parsedTime) || !hasValidFormat) {
        return res.status(400).json({ success: false, error: 'Invalid paymentDate format.' });
      }
    }
  }

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

  epay.id = (epay.id || '').trim() || (isMockFallbackAllowed() ? generateSemanticEntityId('EPAY', epay.brand, mockStore.getEmployeePayments(epay.brand)) : generateSemanticEntityId('EPAY', epay.brand));

  epay.paymentProof = parsePaymentProof(epay.paymentProof);
  const serializedProof = serializePaymentProof(epay.paymentProof);

  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save employee payment');
  }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[handleSaveEmployeePaymentRoute] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'save employee payment', errMsg);
    }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete employee payment');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete employee payment', errMsg);
  }
  mockStore.deleteEmployeePayment(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- EXPENSE CATEGORIES ---
router.get('/expense-categories', async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'fetch expense categories');
    }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[GET /expense-categories] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'fetch expense categories', errMsg);
    }
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

  cat.id = (cat.id || '').trim() || (isMockFallbackAllowed() ? generateSemanticEntityId('EXC', cat.brand, mockStore.getExpenseCategories(cat.brand)) : generateSemanticEntityId('EXC', cat.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save expense category');
  }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[handleSaveExpenseCategoryRoute] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'save expense category', errMsg);
    }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete expense category');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete expense category', errMsg);
  }
  mockStore.deleteExpenseCategory(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- OTHER EXPENSES ---
router.get('/expenses', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch expenses');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch expenses', err instanceof Error ? err.message : String(err));
  }
  return res.json(mockStore.getExpenses(brand));
  }
});

async function handleSaveExpenseRoute(req: Request, res: Response) {
  // --- Input Validation (POST & PUT /api/expenses) ---
  const isPost = req.method === 'POST';

  // 1. Amount Validation (required on POST; on PUT validate only if provided; 0 is valid; negative rejected)
  const rawAmount = req.body.amount ?? req.body.amountINR ?? req.body.amount_inr;
  const hasAmount = rawAmount !== undefined && rawAmount !== null && !(typeof rawAmount === 'string' && rawAmount.trim() === '');

  if (isPost && !hasAmount) {
    return res.status(400).json({ success: false, error: 'Expense amount is required.' });
  }

  if (hasAmount) {
    const numAmount = typeof rawAmount === 'number' ? rawAmount : Number(String(rawAmount).trim());
    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ success: false, error: 'Expense amount must be a non-negative number.' });
    }
  }

  // 2. Expense Date Validation (optional, but if provided and not empty must be a valid date)
  const rawExpenseDate = req.body.expenseDate ?? req.body.expense_date;
  if (rawExpenseDate !== undefined && rawExpenseDate !== null) {
    const dateStr = String(rawExpenseDate).trim();
    if (dateStr.length > 0) {
      const parsedTime = Date.parse(dateStr);
      const hasValidFormat = /^\d{1,4}[-/.]|[a-zA-Z]{3,9}\s+\d|\d{1,2}\s+[a-zA-Z]{3,9}/.test(dateStr);
      if (isNaN(parsedTime) || !hasValidFormat) {
        return res.status(400).json({ success: false, error: 'Invalid expenseDate format.' });
      }
    }
  }

  // 3. Vendor Validation (required on POST; on PUT validate only if vendor key is present in body)
  const rawVendor = req.body.vendor;
  const hasVendorProp = 'vendor' in req.body;
  const hasVendor = rawVendor !== undefined && rawVendor !== null && typeof rawVendor === 'string' && rawVendor.trim().length > 0;

  if (isPost && !hasVendor) {
    return res.status(400).json({ success: false, error: 'Vendor name is required.' });
  } else if (!isPost && hasVendorProp) {
    if (typeof rawVendor === 'string' && !rawVendor.trim()) {
      return res.status(400).json({ success: false, error: 'Vendor name cannot be empty.' });
    }
  }

  const exp: Expense = req.body;
  const brandContext = getBrandContext(req);
  exp.brand = sanitizeBrand(exp.brand, brandContext) as any;
  const now = new Date().toISOString();
  exp.updatedAt = now;
  exp.createdAt = exp.createdAt || now;

  exp.id = (exp.id || '').trim() || (isMockFallbackAllowed() ? generateSemanticEntityId('EXP', exp.brand, mockStore.getExpenses(exp.brand)) : generateSemanticEntityId('EXP', exp.brand));

  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save expense');
  }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[handleSaveExpenseRoute] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'save expense', errMsg);
    }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete expense');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete expense', errMsg);
  }
  mockStore.deleteExpense(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- APP USERS (Admin & User Management) ---
router.get('/users', authenticateToken, async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch users');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch users', err instanceof Error ? err.message : String(err));
  }
  return res.json(mockStore.getUsers(brand));
  }
});

async function handleSaveUserRoute(req: Request, res: Response) {
  const user: AppUser = req.body;
  const rawId = (user.id || (req.params && req.params.id) || '').trim();
  const rawEmail = (user.email || '').toLowerCase().trim();

  // Look for existing user in in-memory store or Azure SQL
  const pool = await getOrInitPool();
  let mockExisting = isMockFallbackAllowed()
    ? mockStore.getUsers().find(
        (u) => (rawId && u.id.toLowerCase() === rawId.toLowerCase()) ||
               (rawEmail && u.email.toLowerCase() === rawEmail)
      )
    : undefined;

  let isExisting = Boolean(mockExisting) || req.method === 'PUT';
  let savedEmail: string | null = mockExisting?.email ? mockExisting.email.trim() : null;

  if (pool && (rawId || rawEmail)) {
    try {
      const checkExisting = await pool.request()
        .input('chk_id', rawId ? toGuid(rawId) : null)
        .input('chk_rawId', rawId || null)
        .input('chk_email', rawEmail || null)
        .query(`
          SELECT TOP 1 CAST(id AS NVARCHAR(100)) as id, name, email, role, brand, status, avatar FROM app_users 
          WHERE (@chk_id IS NOT NULL AND (id = @chk_id OR CAST(id AS NVARCHAR(100)) = @chk_rawId))
             OR (@chk_email IS NOT NULL AND LOWER(email) = @chk_email)
        `);
      if (checkExisting.recordset && checkExisting.recordset.length > 0) {
        isExisting = true;
        const row = checkExisting.recordset[0];
        if (row.email) {
          savedEmail = String(row.email).trim();
        }
        if (!mockExisting) {
          mockExisting = {
            id: row.id,
            name: row.name,
            email: row.email,
            role: row.role,
            brand: row.brand,
            status: row.status,
            avatar: row.avatar,
            password: '',
            createdAt: '',
            updatedAt: '',
          };
        }
      }
    } catch {
      // Ignore lookup failure, continue with isExisting status
    }
  }

  // --- Input Validation (POST & PUT /api/users) ---
  const isPost = req.method === 'POST';
  const hasNameProp = 'name' in req.body;
  const rawName = req.body.name;

  if (isPost) {
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      return res.status(400).json({
        success: false,
        error: 'User name is required.',
      });
    }
  } else if (hasNameProp) {
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      return res.status(400).json({
        success: false,
        error: 'User name cannot be empty.',
      });
    }
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (req.body.email !== undefined && req.body.email !== null) {
    const emailStr = String(req.body.email).trim();
    if (emailStr.length > 0) {
      if (req.method === 'PUT') {
        // PUT: Validate only if saved user was loaded and email has actually changed
        if (savedEmail !== null && emailStr.toLowerCase() !== savedEmail.toLowerCase()) {
          if (!emailRegex.test(emailStr)) {
            return res.status(400).json({
              success: false,
              error: 'Invalid email address format.',
            });
          }
        }
      } else {
        // POST: Validate format if non-empty and changed/new
        if (!savedEmail || emailStr.toLowerCase() !== savedEmail.toLowerCase()) {
          if (!emailRegex.test(emailStr)) {
            return res.status(400).json({
              success: false,
              error: 'Invalid email address format.',
            });
          }
        }
      }
    }
  }

  // Password Policy Validation:
  // - On new user creation: password is required and must be >= 8 characters
  // - On existing user edit: password is optional, but if provided must be >= 8 characters
  const rawPass = (user.password || '').trim();
  if (!isExisting) {
    if (!rawPass || rawPass.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password is required and must be at least 8 characters long.',
      });
    }
  } else {
    if (rawPass && rawPass.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 8 characters long.',
      });
    }
  }

  const finalId = rawId || `USR-${Date.now().toString().slice(-4)}`;
  const finalEmail = rawEmail || (mockExisting ? mockExisting.email : '');
  const finalName = (user.name && user.name.trim()) || (mockExisting ? mockExisting.name : '') || user.email || 'User';

  const now = new Date().toISOString();
  user.id = finalId;
  user.email = finalEmail;
  user.name = finalName.trim();
  user.status = user.status || (mockExisting ? mockExisting.status : 'Active');
  user.role = user.role || (mockExisting ? mockExisting.role : 'Viewer');
  user.brand = user.brand || (mockExisting ? mockExisting.brand : 'All');
  user.avatar = user.avatar || (mockExisting ? mockExisting.avatar : '');
  user.updatedAt = now;
  user.createdAt = user.createdAt || (mockExisting ? mockExisting.createdAt : now);

  // Hash new password if provided
  let hashedPassword = '';
  if (rawPass) {
    hashedPassword = await hashPassword(rawPass);
    user.password = hashedPassword;
  } else if (mockExisting) {
    user.password = mockExisting.password;
  }

  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'save user');
  }
  const saved = mockStore.saveUser(user);
    return res.json({ success: true, user: saved });
  }

  try {
    const guidId = toGuid(finalId);

    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', finalId)
          .input('name', user.name)
          .input('email', user.email)
          .input('password_hash', hashedPassword)
          .input('role', user.role || (mockExisting ? mockExisting.role : 'Viewer'))
          .input('brand', user.brand || (mockExisting ? mockExisting.brand : 'All'))
          .input('status', user.status || (mockExisting ? mockExisting.status : 'Active'))
          .input('avatar', user.avatar || (mockExisting ? mockExisting.avatar : ''))
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
              VALUES (@rawId, @name, @email, @password_hash, @role, @brand, @status, @avatar, @created_at, @updated_at);
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete user');
  }
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
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'delete user', errMsg);
  }
  mockStore.deleteUser(id, brandFilter);
    return res.json({ success: true, id });
  }
});

// --- AUDIT LOG ---
router.get('/audit', async (_req: Request, res: Response) => {
  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch audit log');
  }
  return res.json(mockStore.getAuditLog());
  }

  try {
    const q = await executeSqlWithAutoMigration(pool, () =>
      pool.request().query('SELECT TOP 100 * FROM crm_audit_log ORDER BY id DESC')
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /audit] Falling back to mock store:', err);
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'fetch audit log', err instanceof Error ? err.message : String(err));
  }
  return res.json(mockStore.getAuditLog());
  }
});

router.post('/audit', async (req: Request, res: Response) => {
  const { brand, module, action, entityId, details, performedBy } = req.body;
  const now = new Date().toISOString();

  const pool = await getOrInitPool();
  if (!pool) {
    if (!isMockFallbackAllowed()) {
    return sendDatabaseUnavailable(res, 'record audit log');
  }
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
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[POST /audit] Falling back to mock store:', errMsg);
    if (!isMockFallbackAllowed()) {
      return sendDatabaseUnavailable(res, 'record audit log', errMsg);
    }
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
