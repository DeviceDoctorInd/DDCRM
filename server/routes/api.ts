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
} from '../../src/types/crm';
import { mockStore } from '../db/mockStore';
import authRoutes from './auth.routes';
import { authController } from '../controllers/auth.controller';
import { authenticateToken, hashPassword } from '../middleware/auth';

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
router.post('/db/clear-demo', async (_req: Request, res: Response) => {
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

// Backward-compatible fallback for direct /auth/login POST requests
router.post('/auth/login', (req: Request, res: Response) => {
  authController.login(req, res);
});

// --- CLIENTS ---
router.get('/clients', async (req: Request, res: Response) => {
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
        SELECT CAST(id AS NVARCHAR(100)) as id, 
               CAST(id AS NVARCHAR(100)) as client_id,
               CAST(id AS NVARCHAR(100)) as client_id_code,
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

router.post('/clients', async (req: Request, res: Response) => {
  const client: Client = req.body;
  const brandContext = getBrandContext(req);
  client.brand = sanitizeBrand(client.brand, brandContext) as any;
  const now = new Date().toISOString();
  client.updatedAt = now;
  client.createdAt = client.createdAt || now;

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveClient(client);
    mockStore.addAuditLog({
      brand: client.brand || 'All',
      module: 'Clients',
      action: 'SAVE',
      entityId: client.id,
      details: `Saved client ${client.name} under ${client.brand}`,
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
            IF EXISTS (SELECT 1 FROM clients WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId)
              UPDATE clients SET brand=@brand, name=@name, client_name=@name, contact_person=@contact_person, phone=@phone, email=@email,
                                 city=@city, country=@country, gst_number=@gst_number, preferred_currency=@preferred_currency,
                                 client_since=@client_since, status=@status, notes=@notes, updated_at=@updated_at
              WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId
            ELSE
              INSERT INTO clients (id, client_id_code, brand, name, client_name, contact_person, phone, email, city, country, gst_number, preferred_currency, client_since, status, notes, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @name, @name, @contact_person, @phone, @email, @city, @country, @gst_number, @preferred_currency, @client_since, @status, @notes, @created_at, @updated_at)
          `),
      'clients'
    );
    return res.json({ success: true, client });
  } catch (err) {
    console.warn('[POST /clients] Falling back to mock store:', err);
    const saved = mockStore.saveClient(client);
    return res.json({ success: true, client: saved });
  }
});

router.delete('/clients/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();
  if (!pool) {
    mockStore.deleteClient(id);
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    await executeSqlWithAutoMigration(
      pool,
      () => pool.request().input('id', guidId).input('rawId', id).query('DELETE FROM clients WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId'),
      'clients'
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.warn(`[DELETE /clients/${id}] Falling back to mock store:`, err);
    mockStore.deleteClient(id);
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
        SELECT CAST(id AS NVARCHAR(100)) as id, 
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

router.post('/categories', async (req: Request, res: Response) => {
  const cat: ServiceCategory = req.body;
  const brandContext = getBrandContext(req);
  cat.brand = sanitizeBrand(cat.brand, brandContext) as any;
  const now = new Date().toISOString();
  cat.updatedAt = now;
  cat.createdAt = cat.createdAt || now;

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
            IF EXISTS (SELECT 1 FROM service_categories WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId)
              UPDATE service_categories SET brand=@brand, name=@name, category_name=@name, description=@description, status=@status, updated_at=@updated_at 
              WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId
            ELSE
              INSERT INTO service_categories (id, category_id_code, brand, name, category_name, description, status, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @name, @name, @description, @status, @created_at, @updated_at)
          `),
      'service_categories'
    );
    return res.json({ success: true, category: cat });
  } catch (err) {
    console.warn('[POST /categories] Falling back to mock store:', err);
    const saved = mockStore.saveServiceCategory(cat);
    return res.json({ success: true, category: saved });
  }
});

router.delete('/categories/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();
  if (!pool) {
    mockStore.deleteServiceCategory(id);
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    await executeSqlWithAutoMigration(
      pool,
      () => pool.request().input('id', guidId).input('rawId', id).query('DELETE FROM service_categories WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId'),
      'service_categories'
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.warn(`[DELETE /categories/${id}] Falling back to mock store:`, err);
    mockStore.deleteServiceCategory(id);
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
        SELECT CAST(id AS NVARCHAR(100)) as id, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(name AS NVARCHAR(255)), ISNULL(CAST(service_name AS NVARCHAR(255)), '')) as name, 
               ISNULL(CAST(category_id AS NVARCHAR(100)), '') as categoryId, 
               ISNULL(CAST(description AS NVARCHAR(MAX)), '') as description, 
               ISNULL(CAST(status AS NVARCHAR(50)), 'Active') as status, 
               ISNULL(CAST(created_at AS NVARCHAR(50)), '') as createdAt, 
               ISNULL(CAST(updated_at AS NVARCHAR(50)), ISNULL(CAST(created_at AS NVARCHAR(50)), '')) as updatedAt 
        FROM services 
        WHERE (@brandFilter IS NULL OR brand = @brandFilter)
        ORDER BY created_at DESC
      `),
      'services'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /services] Falling back to mock store:', err);
    return res.json(mockStore.getServices(brand));
  }
});

router.post('/services', async (req: Request, res: Response) => {
  const srv: Service = req.body;
  const brandContext = getBrandContext(req);
  srv.brand = sanitizeBrand(srv.brand, brandContext) as any;
  const now = new Date().toISOString();
  srv.updatedAt = now;
  srv.createdAt = srv.createdAt || now;

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveService(srv);
    return res.json({ success: true, service: saved });
  }

  try {
    const guidId = toGuid(srv.id);
    const catGuid = toGuidOrNull(srv.categoryId);
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
            IF EXISTS (SELECT 1 FROM services WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId)
              UPDATE services SET brand=@brand, name=@name, service_name=@name, category_id=@category_id, description=@description, status=@status, updated_at=@updated_at 
              WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId
            ELSE
              INSERT INTO services (id, service_id_code, brand, name, service_name, category_id, description, status, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @name, @name, @category_id, @description, @status, @created_at, @updated_at)
          `),
      'services'
    );
    return res.json({ success: true, service: srv });
  } catch (err) {
    console.warn('[POST /services] Falling back to mock store:', err);
    const saved = mockStore.saveService(srv);
    return res.json({ success: true, service: saved });
  }
});

router.delete('/services/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();
  if (!pool) {
    mockStore.deleteService(id);
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    await executeSqlWithAutoMigration(
      pool,
      () => pool.request().input('id', guidId).input('rawId', id).query('DELETE FROM services WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId'),
      'services'
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.warn(`[DELETE /services/${id}] Falling back to mock store:`, err);
    mockStore.deleteService(id);
    return res.json({ success: true, id });
  }
});

// --- PROJECTS ---
router.get('/projects', async (req: Request, res: Response) => {
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
        SELECT CAST(id AS NVARCHAR(150)) as id, 
               ISNULL(CAST(brand AS NVARCHAR(100)), 'Device Doctor India') as brand, 
               ISNULL(CAST(client_id AS NVARCHAR(100)), '') as clientId, 
               ISNULL(CAST(client_name AS NVARCHAR(255)), '') as clientName, 
               ISNULL(CAST(service_id AS NVARCHAR(100)), '') as serviceId,
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

router.post('/projects', async (req: Request, res: Response) => {
  const proj: Project = req.body;
  const brandContext = getBrandContext(req);
  proj.brand = sanitizeBrand(proj.brand, brandContext) as any;
  const now = new Date().toISOString();
  proj.updatedAt = now;
  proj.createdAt = proj.createdAt || now;

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveProject(proj);
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
            IF EXISTS (SELECT 1 FROM projects WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId)
              UPDATE projects SET brand=@brand, client_id=@client_id, client_name=@client_name, service_id=@service_id,
                                 proposal_date=@proposal_date, contract_date=@contract_date, start_date=@start_date,
                                 committed_days=@committed_days, committed_end_date=@committed_end_date,
                                 actual_end_date=@actual_end_date, status=@status, payment_mode=@payment_mode,
                                 currency=@currency, contract=@contract, exchange_rate=@exchange_rate,
                                 contract_value=@contract_value, total_received=@total_received, balance=@balance,
                                 project_manager=@project_manager, notes=@notes, proposal_document=@proposal_document,
                                 contract_document=@contract_document, payment_phases=@payment_phases, updated_at=@updated_at
              WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId
            ELSE
              INSERT INTO projects (id, project_id_code, brand, client_id, client_name, service_id, proposal_date, contract_date, start_date, committed_days, committed_end_date, actual_end_date, status, payment_mode, currency, contract, exchange_rate, contract_value, total_received, balance, project_manager, notes, proposal_document, contract_document, payment_phases, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @client_id, @client_name, @service_id, @proposal_date, @contract_date, @start_date, @committed_days, @committed_end_date, @actual_end_date, @status, @payment_mode, @currency, @contract, @exchange_rate, @contract_value, @total_received, @balance, @project_manager, @notes, @proposal_document, @contract_document, @payment_phases, @created_at, @updated_at)
          `),
      'projects'
    );
    return res.json({ success: true, project: proj });
  } catch (err) {
    console.warn('[POST /projects] Falling back to mock store:', err);
    const saved = mockStore.saveProject(proj);
    return res.json({ success: true, project: saved });
  }
});

router.delete('/projects/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();
  if (!pool) {
    mockStore.deleteProject(id);
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    await executeSqlWithAutoMigration(
      pool,
      () => pool.request().input('id', guidId).input('rawId', id).query('DELETE FROM projects WHERE id = @id OR CAST(id AS NVARCHAR(150)) = @rawId'),
      'projects'
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.warn(`[DELETE /projects/${id}] Falling back to mock store:`, err);
    mockStore.deleteProject(id);
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

// --- PAYMENTS ---
router.get('/payments', async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getPayments(brand));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT CAST(id AS NVARCHAR(100)) as id, 
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
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /payments] Falling back to mock store:', err);
    return res.json(mockStore.getPayments(brand));
  }
});

router.post('/payments', async (req: Request, res: Response) => {
  const payment: Payment = req.body;
  const brandContext = getBrandContext(req);
  payment.brand = sanitizeBrand(payment.brand, brandContext) as any;
  const now = new Date().toISOString();
  payment.updatedAt = now;
  payment.createdAt = payment.createdAt || now;

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.savePayment(payment);
    return res.json({ success: true, payment: saved });
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
          .input('payment_proof', payment.paymentProof ? JSON.stringify(payment.paymentProof) : '')
          .input('payment_proof_notes', payment.paymentProofNotes || '')
          .input('created_at', payment.createdAt)
          .input('updated_at', payment.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM payments WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId)
              UPDATE payments SET brand=@brand, project_id=@project_id, client_id=@client_id, client_name=@client_name,
                                 payment_mode=@payment_mode, bank_account_id=@bank_account_id, bank_account_name=@bank_account_name,
                                 payment_date=@payment_date, due_date=@due_date,
                                 amount_received=@amount_received, currency=@currency, exchange_rate=@exchange_rate,
                                 amount_inr=@amount_inr, reference_utr=@reference_utr, payment_status=@payment_status,
                                 days_overdue=@days_overdue, notes=@notes, payment_proof=@payment_proof,
                                 payment_proof_notes=@payment_proof_notes, updated_at=@updated_at
              WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId
            ELSE
              INSERT INTO payments (id, payment_id_code, brand, project_id, client_id, client_name, payment_mode, bank_account_id, bank_account_name, payment_date, due_date, amount_received, currency, exchange_rate, amount_inr, reference_utr, payment_status, days_overdue, notes, payment_proof, payment_proof_notes, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @project_id, @client_id, @client_name, @payment_mode, @bank_account_id, @bank_account_name, @payment_date, @due_date, @amount_received, @currency, @exchange_rate, @amount_inr, @reference_utr, @payment_status, @days_overdue, @notes, @payment_proof, @payment_proof_notes, @created_at, @updated_at)
          `),
      'payments'
    );
    return res.json({ success: true, payment });
  } catch (err) {
    console.warn('[POST /payments] Falling back to mock store:', err);
    const saved = mockStore.savePayment(payment);
    return res.json({ success: true, payment: saved });
  }
});

router.delete('/payments/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();
  if (!pool) {
    mockStore.deletePayment(id);
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    await executeSqlWithAutoMigration(
      pool,
      () => pool.request().input('id', guidId).input('rawId', id).query('DELETE FROM payments WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId'),
      'payments'
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.warn(`[DELETE /payments/${id}] Falling back to mock store:`, err);
    mockStore.deletePayment(id);
    return res.json({ success: true, id });
  }
});

// --- BANK ACCOUNTS ---
router.get('/bank-accounts', async (req: Request, res: Response) => {
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
        SELECT CAST(id AS NVARCHAR(100)) as id, 
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

router.post('/bank-accounts', async (req: Request, res: Response) => {
  const account: BankAccount = req.body;
  const brandContext = getBrandContext(req);
  account.brand = sanitizeBrand(account.brand, brandContext) as any;
  const now = new Date().toISOString();
  account.updatedAt = now;
  account.createdAt = account.createdAt || now;

  mockStore.saveBankAccount(account);

  const pool = await getOrInitPool();
  if (!pool) {
    return res.json({ success: true, bankAccount: account });
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
            IF EXISTS (SELECT 1 FROM bank_accounts WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId)
              UPDATE bank_accounts 
              SET brand=@brand, account_name=@account_name, bank_name=@bank_name, account_number=@account_number,
                  ifsc_code=@ifsc_code, branch_name=@branch_name, upi_id=@upi_id, account_type=@account_type,
                  status=@status, notes=@notes, updated_at=@updated_at
              WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId
            ELSE
              INSERT INTO bank_accounts (id, brand, account_name, bank_name, account_number, ifsc_code, branch_name, upi_id, account_type, status, notes, created_at, updated_at)
              VALUES (@id, @brand, @account_name, @bank_name, @account_number, @ifsc_code, @branch_name, @upi_id, @account_type, @status, @notes, @created_at, @updated_at)
          `),
      'bank_accounts'
    );
    return res.json({ success: true, bankAccount: account });
  } catch (err) {
    console.warn('[POST /bank-accounts] Falling back to mock store:', err);
    return res.json({ success: true, bankAccount: account });
  }
});

router.delete('/bank-accounts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const guidId = toGuid(id);

  mockStore.deleteBankAccount(id);
  mockStore.deleteBankAccount(guidId);

  const pool = await getOrInitPool();
  if (!pool) {
    return res.json({ success: true, id });
  }

  try {
    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool
          .request()
          .input('id', guidId)
          .input('rawId', id)
          .query('DELETE FROM bank_accounts WHERE CAST(id AS NVARCHAR(100)) = @rawId OR CAST(id AS NVARCHAR(100)) = @id'),
      'bank_accounts'
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.warn(`[DELETE /bank-accounts/${id}] Falling back to mock store:`, err);
    return res.json({ success: true, id });
  }
});

// --- GST INVOICES ---
router.get('/gst-invoices', async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getGstInvoices(brand));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT CAST(id AS NVARCHAR(100)) as id, 
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

router.post('/gst-invoices', async (req: Request, res: Response) => {
  const inv: GstInvoice = req.body;
  const brandContext = getBrandContext(req);
  inv.brand = sanitizeBrand(inv.brand, brandContext) as any;
  const now = new Date().toISOString();
  inv.updatedAt = now;
  inv.createdAt = inv.createdAt || now;

  mockStore.saveGstInvoice(inv);

  const pool = await getOrInitPool();
  if (!pool) {
    return res.json({ success: true, invoice: inv });
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
            IF EXISTS (SELECT 1 FROM gst_invoices WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId OR (payment_id = @payment_id AND @payment_id <> ''))
              UPDATE gst_invoices SET brand=@brand, payment_id=@payment_id, project_id=@project_id, client_id=@client_id,
                                     client_name=@client_name, payment_date=@payment_date, amount_received=@amount_received,
                                     currency=@currency, amount_inr=@amount_inr, gst_amount_inr=@gst_amount_inr,
                                     invoice_number=@invoice_number, uploaded_to_gst_portal=@uploaded_to_gst_portal,
                                     gst_portal_upload_date=@gst_portal_upload_date, notes=@notes, updated_at=@updated_at
              WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId OR (payment_id = @payment_id AND @payment_id <> '')
            ELSE
              INSERT INTO gst_invoices (id, brand, payment_id, project_id, client_id, client_name, payment_date, amount_received, currency, amount_inr, gst_amount_inr, invoice_number, uploaded_to_gst_portal, gst_portal_upload_date, notes, created_at, updated_at)
              VALUES (@id, @brand, @payment_id, @project_id, @client_id, @client_name, @payment_date, @amount_received, @currency, @amount_inr, @gst_amount_inr, @invoice_number, @uploaded_to_gst_portal, @gst_portal_upload_date, @notes, @created_at, @updated_at)
          `),
      'gst_invoices'
    );
    return res.json({ success: true, invoice: inv });
  } catch (err) {
    console.warn('[POST /gst-invoices] Falling back to mock store:', err);
    return res.json({ success: true, invoice: inv });
  }
});

router.delete('/gst-invoices/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();
  if (!pool) {
    mockStore.deleteGstInvoice(id);
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    await executeSqlWithAutoMigration(
      pool,
      () => pool.request().input('id', guidId).input('rawId', id).query('DELETE FROM gst_invoices WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId'),
      'gst_invoices'
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.warn(`[DELETE /gst-invoices/${id}] Falling back to mock store:`, err);
    mockStore.deleteGstInvoice(id);
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
        SELECT CAST(id AS NVARCHAR(100)) as id, 
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

router.post('/roles', async (req: Request, res: Response) => {
  const role: EmployeeRole = req.body;
  const brandContext = getBrandContext(req);
  role.brand = sanitizeBrand(role.brand, brandContext) as any;
  const now = new Date().toISOString();
  role.updatedAt = now;
  role.createdAt = role.createdAt || now;

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
            IF EXISTS (SELECT 1 FROM employee_roles WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId)
              UPDATE employee_roles SET brand=@brand, role_name=@role_name, name=@role_name, department=@department, status=@status, description=@description, updated_at=@updated_at 
              WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId
            ELSE
              INSERT INTO employee_roles (id, role_id_code, brand, role_name, name, department, status, description, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @role_name, @role_name, @department, @status, @description, @created_at, @updated_at)
          `),
      'employee_roles'
    );
    return res.json({ success: true, role });
  } catch (err) {
    console.warn('[POST /roles] Falling back to mock store:', err);
    const saved = mockStore.saveEmployeeRole(role);
    return res.json({ success: true, role: saved });
  }
});

router.delete('/roles/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();
  if (!pool) {
    mockStore.deleteEmployeeRole(id);
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    await executeSqlWithAutoMigration(
      pool,
      () => pool.request().input('id', guidId).input('rawId', id).query('DELETE FROM employee_roles WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId'),
      'employee_roles'
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.warn(`[DELETE /roles/${id}] Falling back to mock store:`, err);
    mockStore.deleteEmployeeRole(id);
    return res.json({ success: true, id });
  }
});

// --- EMPLOYEES ---
router.get('/employees', async (req: Request, res: Response) => {
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
        SELECT CAST(id AS NVARCHAR(100)) as id, 
               CAST(id AS NVARCHAR(100)) as employee_id,
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

router.post('/employees', async (req: Request, res: Response) => {
  const emp: Employee = req.body;
  const brandContext = getBrandContext(req);
  emp.brand = sanitizeBrand(emp.brand, brandContext) as any;
  emp.costOfEmployee = parseFloat(String(emp.costOfEmployee ?? 0)) || 0;
  const now = new Date().toISOString();
  emp.updatedAt = now;
  emp.createdAt = emp.createdAt || now;

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
            IF EXISTS (SELECT 1 FROM employees WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId)
              UPDATE employees SET brand=@brand, name=@name, employee_name=@name, role_id=@role_id, email=@email, status=@status,
                                  joining_date=@joining_date, cost_of_employee=@cost_of_employee,
                                  employee_type=@employee_type, comes_under_tds=@comes_under_tds, notes=@notes, updated_at=@updated_at
              WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId
            ELSE
              INSERT INTO employees (id, employee_id_code, brand, name, employee_name, role_id, email, status, joining_date, cost_of_employee, employee_type, comes_under_tds, notes, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @name, @name, @role_id, @email, @status, @joining_date, @cost_of_employee, @employee_type, @comes_under_tds, @notes, @created_at, @updated_at)
          `),
      'employees'
    );
    return res.json({ success: true, employee: emp });
  } catch (err) {
    console.warn('[POST /employees] Falling back to mock store:', err);
    const saved = mockStore.saveEmployee(emp);
    return res.json({ success: true, employee: saved });
  }
});

router.delete('/employees/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();
  if (!pool) {
    mockStore.deleteEmployee(id);
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    await executeSqlWithAutoMigration(
      pool,
      () => pool.request().input('id', guidId).input('rawId', id).query('DELETE FROM employees WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId'),
      'employees'
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.warn(`[DELETE /employees/${id}] Falling back to mock store:`, err);
    mockStore.deleteEmployee(id);
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
        SELECT CAST(id AS NVARCHAR(100)) as id, 
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

router.post('/assignments', async (req: Request, res: Response) => {
  const asn: Assignment = req.body;
  const brandContext = getBrandContext(req);
  asn.brand = sanitizeBrand(asn.brand, brandContext) as any;
  asn.amount = parseFloat(String(asn.amount ?? 0)) || 0;
  asn.amountPaid = parseFloat(String(asn.amountPaid ?? 0)) || 0;
  const now = new Date().toISOString();
  asn.updatedAt = now;
  asn.createdAt = asn.createdAt || now;

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
            IF EXISTS (SELECT 1 FROM assignments WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId)
              UPDATE assignments SET brand=@brand, project_id=@project_id, client_id=@client_id, client_name=@client_name,
                                     employee_id=@employee_id, employee_name=@employee_name, role_name=@role_name,
                                     assigned_date=@assigned_date, work_assigned=@work_assigned, work_module_assigned=@work_assigned,
                                     amount=@amount, amount_paid=@amount_paid, payment_status=@payment_status,
                                     employee_notes=@employee_notes, last_note_update=@last_note_update, updated_at=@updated_at
              WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId
            ELSE
              INSERT INTO assignments (id, assignment_id_code, brand, project_id, client_id, client_name, employee_id, employee_name, role_name, assigned_date, work_assigned, work_module_assigned, amount, amount_paid, payment_status, employee_notes, last_note_update, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @project_id, @client_id, @client_name, @employee_id, @employee_name, @role_name, @assigned_date, @work_assigned, @work_assigned, @amount, @amount_paid, @payment_status, @employee_notes, @last_note_update, @created_at, @updated_at)
          `),
      'assignments'
    );
    return res.json({ success: true, assignment: asn });
  } catch (err) {
    console.warn('[POST /assignments] Falling back to mock store:', err);
    const saved = mockStore.saveAssignment(asn);
    return res.json({ success: true, assignment: saved });
  }
});

router.delete('/assignments/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();
  if (!pool) {
    mockStore.deleteAssignment(id);
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    await executeSqlWithAutoMigration(
      pool,
      () => pool.request().input('id', guidId).input('rawId', id).query('DELETE FROM assignments WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId'),
      'assignments'
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.warn(`[DELETE /assignments/${id}] Falling back to mock store:`, err);
    mockStore.deleteAssignment(id);
    return res.json({ success: true, id });
  }
});

// --- EMPLOYEE PAYMENTS ---
router.get('/employee-payments', async (req: Request, res: Response) => {
  const brand = getBrandContext(req);
  const pool = await getOrInitPool();
  if (!pool) {
    return res.json(mockStore.getEmployeePayments(brand));
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('brandFilter', brand || null)
          .query(`
        SELECT CAST(id AS NVARCHAR(100)) as id, 
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
    return res.json(q.recordset || []);
  } catch (err) {
    console.warn('[GET /employee-payments] Falling back to mock store:', err);
    return res.json(mockStore.getEmployeePayments(brand));
  }
});

router.post('/employee-payments', async (req: Request, res: Response) => {
  const epay: EmployeePayment = req.body;
  const brandContext = getBrandContext(req);
  epay.brand = sanitizeBrand(epay.brand, brandContext) as any;
  epay.amountPaid = parseFloat(String(epay.amountPaid ?? 0)) || 0;
  const now = new Date().toISOString();
  epay.updatedAt = now;
  epay.createdAt = epay.createdAt || now;

  const pool = await getOrInitPool();
  if (!pool) {
    const saved = mockStore.saveEmployeePayment(epay);
    return res.json({ success: true, payment: saved });
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
          .input('payment_proof', epay.paymentProof ? JSON.stringify(epay.paymentProof) : '')
          .input('payment_proof_notes', epay.paymentProofNotes || '')
          .input('created_at', epay.createdAt)
          .input('updated_at', epay.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM employee_payments WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId)
              UPDATE employee_payments SET brand=@brand, assignment_id=@assignment_id, project_id=@project_id,
                                          employee_id=@employee_id, employee_name=@employee_name, payment_date=@payment_date,
                                          amount_paid=@amount_paid, payment_mode=@payment_mode, reference_utr=@reference_utr,
                                          notes=@notes, payment_proof=@payment_proof, payment_proof_notes=@payment_proof_notes,
                                          updated_at=@updated_at
              WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId
            ELSE
              INSERT INTO employee_payments (id, emp_payment_id_code, brand, assignment_id, project_id, employee_id, employee_name, payment_date, amount_paid, payment_mode, reference_utr, notes, payment_proof, payment_proof_notes, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @assignment_id, @project_id, @employee_id, @employee_name, @payment_date, @amount_paid, @payment_mode, @reference_utr, @notes, @payment_proof, @payment_proof_notes, @created_at, @updated_at)
          `),
      'employee_payments'
    );
    return res.json({ success: true, payment: epay });
  } catch (err) {
    return handleDbError(res, err, 'POST /employee-payments');
  }
});

router.delete('/employee-payments/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();
  if (!pool) {
    mockStore.deleteEmployeePayment(id);
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    await executeSqlWithAutoMigration(
      pool,
      () => pool.request().input('id', guidId).input('rawId', id).query('DELETE FROM employee_payments WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId'),
      'employee_payments'
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.warn(`[DELETE /employee-payments/${id}] Falling back to mock store:`, err);
    mockStore.deleteEmployeePayment(id);
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
        SELECT CAST(id AS NVARCHAR(100)) as id, 
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

router.post('/expense-categories', async (req: Request, res: Response) => {
  const cat: ExpenseCategory = req.body;
  const brandContext = getBrandContext(req);
  cat.brand = sanitizeBrand(cat.brand, brandContext) as any;
  const now = new Date().toISOString();
  cat.updatedAt = now;
  cat.createdAt = cat.createdAt || now;

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
            IF EXISTS (SELECT 1 FROM expense_categories WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId)
              UPDATE expense_categories 
              SET brand=@brand, name=@name, category_name=@name, description=@description, status=@status, updated_at=@updated_at 
              WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId
            ELSE
              INSERT INTO expense_categories (id, exp_category_id_code, brand, name, category_name, description, status, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @name, @name, @description, @status, @created_at, @updated_at)
          `),
      'expense_categories'
    );
    return res.json({ success: true, category: cat });
  } catch (err) {
    console.warn('[POST /expense-categories] Falling back to mock store:', err);
    const saved = mockStore.saveExpenseCategory(cat);
    return res.json({ success: true, category: saved });
  }
});

router.delete('/expense-categories/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();
  if (!pool) {
    mockStore.deleteExpenseCategory(id);
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .query('DELETE FROM expense_categories WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId'),
      'expense_categories'
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.warn(`[DELETE /expense-categories/${id}] Falling back to mock store:`, err);
    mockStore.deleteExpenseCategory(id);
    return res.json({ success: true, id });
  }
});

// --- OTHER EXPENSES ---
router.get('/expenses', async (req: Request, res: Response) => {
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
        SELECT CAST(id AS NVARCHAR(100)) as id, 
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

router.post('/expenses', async (req: Request, res: Response) => {
  const exp: Expense = req.body;
  const brandContext = getBrandContext(req);
  exp.brand = sanitizeBrand(exp.brand, brandContext) as any;
  const now = new Date().toISOString();
  exp.updatedAt = now;
  exp.createdAt = exp.createdAt || now;

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

            IF EXISTS (SELECT 1 FROM other_expenses WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId)
              UPDATE other_expenses 
              SET brand=@brand, project_id=@project_id, is_na_project=@is_na_project, client_id=@client_id, client_name=@client_name,
                  expense_category_id=@cat_id, expense_category_name=@cat_name, vendor=@vendor, description=@description,
                  amount=@amount, currency=@currency, exchange_rate=@exchange_rate, amount_inr=@amount_inr,
                  expense_date=@expense_date, payment_status=@payment_status, notes=@notes, updated_at=@updated_at
              WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId
            ELSE
              INSERT INTO other_expenses (id, expense_id_code, brand, project_id, is_na_project, client_id, client_name, expense_category_id, expense_category_name, vendor, description, amount, currency, exchange_rate, amount_inr, expense_date, payment_status, notes, created_at, updated_at)
              VALUES (@id, @rawId, @brand, @project_id, @is_na_project, @client_id, @client_name, @cat_id, @cat_name, @vendor, @description, @amount, @currency, @exchange_rate, @amount_inr, @expense_date, @payment_status, @notes, @created_at, @updated_at)
          `),
      'other_expenses'
    );
    return res.json({ success: true, expense: exp });
  } catch (err) {
    console.warn('[POST /expenses] Falling back to mock store:', err);
    const saved = mockStore.saveExpense(exp);
    return res.json({ success: true, expense: saved });
  }
});

router.delete('/expenses/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();
  if (!pool) {
    mockStore.deleteExpense(id);
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .query('DELETE FROM other_expenses WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId'),
      'other_expenses'
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.warn(`[DELETE /expenses/${id}] Falling back to mock store:`, err);
    mockStore.deleteExpense(id);
    return res.json({ success: true, id });
  }
});

// --- APP USERS (Admin & User Management) ---
router.get('/users', async (req: Request, res: Response) => {
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

router.post('/users', async (req: Request, res: Response) => {
  const user: AppUser = req.body;
  const now = new Date().toISOString();
  user.updatedAt = now;
  user.createdAt = user.createdAt || now;

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
    const guidId = toGuid(user.id);
    const userEmail = (user.email || '').toLowerCase().trim();
    const userName = user.name || user.email || 'User';

    await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request()
          .input('id', guidId)
          .input('rawId', user.id || '')
          .input('name', userName)
          .input('email', userEmail)
          .input('password_hash', hashedPassword)
          .input('role', user.role || 'Viewer')
          .input('brand', user.brand || 'All')
          .input('status', user.status || 'Active')
          .input('avatar', user.avatar || '')
          .input('created_at', user.createdAt)
          .input('updated_at', user.updatedAt)
          .query(`
            IF EXISTS (SELECT 1 FROM app_users WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId OR LOWER(email) = @email)
              UPDATE app_users 
              SET name = @name, full_name = @name, email = @email, 
                  password_hash = CASE WHEN @password_hash IS NOT NULL AND @password_hash <> '' THEN @password_hash ELSE password_hash END,
                  role = @role, brand = @brand, status = @status, avatar = @avatar, updated_at = @updated_at 
              WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId OR LOWER(email) = @email
            ELSE
              INSERT INTO app_users (id, auth_user_id, name, full_name, email, password_hash, role, brand, status, avatar, created_at, updated_at)
              VALUES (@id, NEWID(), @name, @name, @email, ISNULL(NULLIF(@password_hash, ''), 'Admin@2026'), @role, @brand, @status, @avatar, @created_at, @updated_at)
          `),
      'app_users'
    );
    return res.json({ success: true, user });
  } catch (err) {
    console.warn('[POST /users] Falling back to mock store:', err);
    const saved = mockStore.saveUser(user);
    return res.json({ success: true, user: saved });
  }
});

router.delete('/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = await getOrInitPool();
  if (!pool) {
    mockStore.deleteUser(id);
    return res.json({ success: true, id });
  }

  try {
    const guidId = toGuid(id);
    await executeSqlWithAutoMigration(
      pool,
      () => pool.request()
        .input('id', guidId)
        .input('rawId', id)
        .query('DELETE FROM app_users WHERE id = @id OR CAST(id AS NVARCHAR(100)) = @rawId'),
      'app_users'
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.warn(`[DELETE /users/${id}] Falling back to mock store:`, err);
    mockStore.deleteUser(id);
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
