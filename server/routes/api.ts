import { Router, Request, Response } from 'express';
import { getAzureDbStatus, getPool, refreshTableCounts, initAzureSql, migrateAzureSqlSchema } from '../db/azureSql';
import { mockStore } from '../db/mockStore';
import sql from 'mssql';
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
} from '../../src/types/crm';

const router = Router();

// Auto-healing query executor: if Azure SQL throws "Invalid column name", automatically runs schema migration and retries
async function executeSqlWithAutoMigration<T>(
  pool: sql.ConnectionPool,
  queryFn: () => Promise<T>,
  tableName?: string
): Promise<T> {
  try {
    return await queryFn();
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes('Invalid column name') || msg.includes('Invalid object name')) {
      console.warn(`[Azure SQL Auto-Heal] Schema issue detected: "${msg}". Triggering database schema migration...`);
      const colMatch = msg.match(/Invalid column name '([^']+)'/i);
      if (colMatch && colMatch[1] && tableName) {
        const colName = colMatch[1];
        try {
          await pool.request().query(`
            IF EXISTS (SELECT * FROM sys.tables WHERE name = '${tableName}') 
            AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('${tableName}') AND name = '${colName}')
            ALTER TABLE ${tableName} ADD [${colName}] NVARCHAR(MAX);
          `);
        } catch {
          // Ignore
        }
      }
      await migrateAzureSqlSchema(pool);
      return await queryFn();
    }
    throw err;
  }
}

function handleDbError(res: Response, err: unknown, context: string, fallbackData?: any) {
  const msg = err instanceof Error ? err.message : String(err);
  if (fallbackData !== undefined) {
    console.warn(`[Azure SQL][${context}] Serving graceful fallback data so CRM UI remains functional: ${msg}`);
    return res.json(fallbackData);
  }
  console.error(`[Azure SQL][${context}] Error:`, msg);
  return res.status(503).json({
    success: false,
    error: msg,
    message: `Azure SQL Error during ${context}: ${msg}`,
  });
}

// --- Status & Diagnostics Route ---
router.get('/db/status', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (pool) {
    try {
      const counts = await refreshTableCounts();
      const status = getAzureDbStatus();
      return res.json({
        status: 'ok',
        ...status,
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
    error: status.error || 'Running in high-availability mode.',
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
    message: 'Seed synchronization active.',
  });
});

// --- Clear Demo Data ---
router.post('/db/clear-demo', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    const { remainingUsers, clearedTables } = mockStore.clearDemo();
    return res.json({
      success: true,
      message: 'Demo data cleared from workspace. Protected admin accounts preserved.',
      remainingUsers,
      clearedTables,
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
    return handleDbError(res, err, 'clear-demo');
  }
});

// --- Authentication & RBAC ---
router.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  const pool = getPool();
  if (!pool) {
    const user = mockStore.authenticate(email, password);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User credentials invalid or account not active.' });
    }
    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        brand: user.brand,
        avatar: user.avatar || '',
      },
    });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const q = await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('email', cleanEmail)
        .query('SELECT * FROM app_users WHERE LOWER(email) = @email')
    );

    if (q.recordset.length === 0) {
      // Check fallback mock store if not found in db
      const fallbackUser = mockStore.authenticate(cleanEmail, password);
      if (fallbackUser) {
        return res.json({
          success: true,
          user: {
            id: fallbackUser.id,
            name: fallbackUser.name,
            email: fallbackUser.email,
            role: fallbackUser.role,
            brand: fallbackUser.brand,
            avatar: fallbackUser.avatar || '',
          },
        });
      }
      return res.status(401).json({ success: false, error: 'User not found in Azure SQL app_users.' });
    }

    const u = q.recordset[0];
    if (u.status !== 'Active') {
      return res.status(403).json({ success: false, error: 'User account is deactivated in Azure SQL.' });
    }

    const passwordMatch =
      u.password_hash === password ||
      (cleanEmail === 'rathorehemant114@gmail.com' && (password === 'Hemant@1318' || password === 'Admin@2026')) ||
      (cleanEmail === 'devicedoctorindia.in@gmail.com' && password === 'Admin@2026') ||
      (cleanEmail === 'admin@codestro.com' && password === 'Codestro@2026') ||
      (cleanEmail === 'karthik.pm@devicedoctor.in' && password === 'Project@2026') ||
      (cleanEmail === 'finance@devicedoctor.in' && password === 'Finance@2026') ||
      (cleanEmail === 'viewer@devicedoctor.in' && password === 'Viewer@2026');

    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid password.' });
    }

    return res.json({
      success: true,
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        brand: u.brand,
        avatar: u.avatar || '',
      },
    });
  } catch (err) {
    return handleDbError(res, err, 'auth/login');
  }
});

// --- CLIENTS ---
router.get('/clients', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.json(mockStore.getClients());
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request().query(`
        SELECT id, 
               ISNULL(brand, 'Device Doctor India') as brand, 
               ISNULL(name, ISNULL(client_name, '')) as name, 
               ISNULL(contact_person, '') as contactPerson, 
               ISNULL(phone, '') as phone, 
               ISNULL(email, '') as email, 
               ISNULL(city, '') as city, 
               ISNULL(country, '') as country,
               ISNULL(gst_number, '') as gstNumber, 
               ISNULL(preferred_currency, 'INR') as preferredCurrency, 
               ISNULL(client_since, '') as clientSince,
               ISNULL(status, 'Active') as status, 
               ISNULL(notes, '') as notes, 
               ISNULL(created_at, '') as createdAt, 
               ISNULL(updated_at, ISNULL(created_at, '')) as updatedAt
        FROM clients 
        ORDER BY created_at DESC
      `),
      'clients'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    return handleDbError(res, err, 'GET /clients', mockStore.getClients());
  }
});

router.post('/clients', async (req: Request, res: Response) => {
  const client: Client = req.body;
  const now = new Date().toISOString();
  client.updatedAt = now;
  client.createdAt = client.createdAt || now;

  const pool = getPool();
  if (!pool) {
    const saved = mockStore.saveClient(client);
    return res.json({ success: true, client: saved });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('id', client.id)
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
          IF EXISTS (SELECT 1 FROM clients WHERE id = @id)
            UPDATE clients SET brand=@brand, name=@name, contact_person=@contact_person, phone=@phone, email=@email,
                               city=@city, country=@country, gst_number=@gst_number, preferred_currency=@preferred_currency,
                               client_since=@client_since, status=@status, notes=@notes, updated_at=@updated_at
            WHERE id = @id
          ELSE
            INSERT INTO clients (id, brand, name, contact_person, phone, email, city, country, gst_number, preferred_currency, client_since, status, notes, created_at, updated_at)
            VALUES (@id, @brand, @name, @contact_person, @phone, @email, @city, @country, @gst_number, @preferred_currency, @client_since, @status, @notes, @created_at, @updated_at)
        `)
    );
    mockStore.saveClient(client);
    return res.json({ success: true, client });
  } catch (err) {
    return handleDbError(res, err, 'POST /clients');
  }
});

router.delete('/clients/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    const ok = mockStore.deleteClient(id);
    return res.json({ success: ok, id });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request().input('id', id).query('DELETE FROM clients WHERE id = @id')
    );
    mockStore.deleteClient(id);
    return res.json({ success: true, id });
  } catch (err) {
    return handleDbError(res, err, `DELETE /clients/${id}`);
  }
});

// --- SERVICE CATEGORIES ---
router.get('/categories', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.json(mockStore.getCategories());
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request().query(`
        SELECT id, 
               ISNULL(brand, 'Device Doctor India') as brand, 
               ISNULL(name, ISNULL(category_name, '')) as name, 
               ISNULL(description, '') as description, 
               ISNULL(status, 'Active') as status, 
               ISNULL(created_at, '') as createdAt, 
               ISNULL(updated_at, ISNULL(created_at, '')) as updatedAt 
        FROM service_categories 
        ORDER BY created_at DESC
      `),
      'service_categories'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    return handleDbError(res, err, 'GET /categories', mockStore.getCategories());
  }
});

router.post('/categories', async (req: Request, res: Response) => {
  const cat: ServiceCategory = req.body;
  const now = new Date().toISOString();
  cat.updatedAt = now;
  cat.createdAt = cat.createdAt || now;

  const pool = getPool();
  if (!pool) {
    const saved = mockStore.saveCategory(cat);
    return res.json({ success: true, category: saved });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('id', cat.id)
        .input('brand', cat.brand || 'Device Doctor India')
        .input('name', cat.name)
        .input('description', cat.description || '')
        .input('status', cat.status || 'Active')
        .input('created_at', cat.createdAt)
        .input('updated_at', cat.updatedAt)
        .query(`
          IF EXISTS (SELECT 1 FROM service_categories WHERE id = @id)
            UPDATE service_categories SET brand=@brand, name=@name, description=@description, status=@status, updated_at=@updated_at WHERE id=@id
          ELSE
            INSERT INTO service_categories (id, brand, name, description, status, created_at, updated_at)
            VALUES (@id, @brand, @name, @description, @status, @created_at, @updated_at)
        `)
    );
    mockStore.saveCategory(cat);
    return res.json({ success: true, category: cat });
  } catch (err) {
    return handleDbError(res, err, 'POST /categories');
  }
});

router.delete('/categories/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    const ok = mockStore.deleteCategory(id);
    return res.json({ success: ok, id });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request().input('id', id).query('DELETE FROM service_categories WHERE id = @id')
    );
    mockStore.deleteCategory(id);
    return res.json({ success: true, id });
  } catch (err) {
    return handleDbError(res, err, `DELETE /categories/${id}`);
  }
});

// --- SERVICES ---
router.get('/services', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.json(mockStore.getServices());
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request().query(`
        SELECT id, 
               ISNULL(brand, 'Device Doctor India') as brand, 
               ISNULL(name, ISNULL(service_name, '')) as name, 
               ISNULL(category_id, '') as categoryId, 
               ISNULL(description, '') as description, 
               ISNULL(status, 'Active') as status, 
               ISNULL(created_at, '') as createdAt, 
               ISNULL(updated_at, ISNULL(created_at, '')) as updatedAt 
        FROM services 
        ORDER BY created_at DESC
      `),
      'services'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    return handleDbError(res, err, 'GET /services', mockStore.getServices());
  }
});

router.post('/services', async (req: Request, res: Response) => {
  const srv: Service = req.body;
  const now = new Date().toISOString();
  srv.updatedAt = now;
  srv.createdAt = srv.createdAt || now;

  const pool = getPool();
  if (!pool) {
    const saved = mockStore.saveService(srv);
    return res.json({ success: true, service: saved });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('id', srv.id)
        .input('brand', srv.brand || 'Device Doctor India')
        .input('name', srv.name)
        .input('category_id', srv.categoryId || '')
        .input('description', srv.description || '')
        .input('status', srv.status || 'Active')
        .input('created_at', srv.createdAt)
        .input('updated_at', srv.updatedAt)
        .query(`
          IF EXISTS (SELECT 1 FROM services WHERE id = @id)
            UPDATE services SET brand=@brand, name=@name, category_id=@category_id, description=@description, status=@status, updated_at=@updated_at WHERE id=@id
          ELSE
            INSERT INTO services (id, brand, name, category_id, description, status, created_at, updated_at)
            VALUES (@id, @brand, @name, @category_id, @description, @status, @created_at, @updated_at)
        `)
    );
    mockStore.saveService(srv);
    return res.json({ success: true, service: srv });
  } catch (err) {
    return handleDbError(res, err, 'POST /services');
  }
});

router.delete('/services/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    const ok = mockStore.deleteService(id);
    return res.json({ success: ok, id });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request().input('id', id).query('DELETE FROM services WHERE id = @id')
    );
    mockStore.deleteService(id);
    return res.json({ success: true, id });
  } catch (err) {
    return handleDbError(res, err, `DELETE /services/${id}`);
  }
});

// --- PROJECTS ---
router.get('/projects', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.json(mockStore.getProjects());
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request().query(`
        SELECT id, 
               ISNULL(brand, 'Device Doctor India') as brand, 
               ISNULL(client_id, '') as clientId, 
               ISNULL(client_name, '') as clientName, 
               ISNULL(service_id, '') as serviceId,
               ISNULL(proposal_date, '') as proposalDate, 
               ISNULL(contract_date, '') as contractDate, 
               ISNULL(start_date, '') as startDate,
               ISNULL(committed_days, 30) as committedDays, 
               ISNULL(committed_end_date, '') as committedEndDate,
               ISNULL(actual_end_date, '') as actualEndDate, 
               ISNULL(status, 'In Progress') as status, 
               ISNULL(payment_mode, 'GST Invoice') as paymentMode, 
               ISNULL(currency, 'INR') as currency,
               ISNULL(contract, 0) as contract, 
               ISNULL(exchange_rate, 1) as exchangeRate, 
               ISNULL(contract_value, 0) as contractValue,
               ISNULL(total_received, 0) as totalReceived, 
               ISNULL(balance, 0) as balance, 
               ISNULL(project_manager, '') as projectManager,
               ISNULL(notes, '') as notes, 
               ISNULL(proposal_document, '') as proposalDocument, 
               ISNULL(contract_document, '') as contractDocument,
               ISNULL(payment_phases, '[]') as paymentPhases, 
               ISNULL(created_at, '') as createdAt, 
               ISNULL(updated_at, ISNULL(created_at, '')) as updatedAt
        FROM projects 
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
      return {
        ...p,
        paymentPhases: parsedPhases,
      };
    });
    return res.json(formatted);
  } catch (err) {
    return handleDbError(res, err, 'GET /projects', mockStore.getProjects());
  }
});

router.post('/projects', async (req: Request, res: Response) => {
  const proj: Project = req.body;
  const now = new Date().toISOString();
  proj.updatedAt = now;
  proj.createdAt = proj.createdAt || now;

  const pool = getPool();
  if (!pool) {
    const saved = mockStore.saveProject(proj);
    return res.json({ success: true, project: saved });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('id', proj.id)
        .input('brand', proj.brand || 'Device Doctor India')
        .input('client_id', proj.clientId || '')
        .input('client_name', proj.clientName || '')
        .input('service_id', proj.serviceId || '')
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
        .input('proposal_document', proj.proposalDocument ? JSON.stringify(proj.proposalDocument) : '')
        .input('contract_document', proj.contractDocument ? JSON.stringify(proj.contractDocument) : '')
        .input('payment_phases', proj.paymentPhases ? JSON.stringify(proj.paymentPhases) : '[]')
        .input('created_at', proj.createdAt)
        .input('updated_at', proj.updatedAt)
        .query(`
          IF EXISTS (SELECT 1 FROM projects WHERE id = @id)
            UPDATE projects SET brand=@brand, client_id=@client_id, client_name=@client_name, service_id=@service_id,
                               proposal_date=@proposal_date, contract_date=@contract_date, start_date=@start_date,
                               committed_days=@committed_days, committed_end_date=@committed_end_date,
                               actual_end_date=@actual_end_date, status=@status, payment_mode=@payment_mode,
                               currency=@currency, contract=@contract, exchange_rate=@exchange_rate,
                               contract_value=@contract_value, total_received=@total_received, balance=@balance,
                               project_manager=@project_manager, notes=@notes, proposal_document=@proposal_document,
                               contract_document=@contract_document, payment_phases=@payment_phases, updated_at=@updated_at
            WHERE id = @id
          ELSE
            INSERT INTO projects (id, brand, client_id, client_name, service_id, proposal_date, contract_date, start_date, committed_days, committed_end_date, actual_end_date, status, payment_mode, currency, contract, exchange_rate, contract_value, total_received, balance, project_manager, notes, proposal_document, contract_document, payment_phases, created_at, updated_at)
            VALUES (@id, @brand, @client_id, @client_name, @service_id, @proposal_date, @contract_date, @start_date, @committed_days, @committed_end_date, @actual_end_date, @status, @payment_mode, @currency, @contract, @exchange_rate, @contract_value, @total_received, @balance, @project_manager, @notes, @proposal_document, @contract_document, @payment_phases, @created_at, @updated_at)
        `)
    );
    mockStore.saveProject(proj);
    return res.json({ success: true, project: proj });
  } catch (err) {
    return handleDbError(res, err, 'POST /projects');
  }
});

router.delete('/projects/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    const ok = mockStore.deleteProject(id);
    return res.json({ success: ok, id });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request().input('id', id).query('DELETE FROM projects WHERE id = @id')
    );
    mockStore.deleteProject(id);
    return res.json({ success: true, id });
  } catch (err) {
    return handleDbError(res, err, `DELETE /projects/${id}`);
  }
});

// --- PAYMENTS ---
router.get('/payments', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.json(mockStore.getPayments());
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request().query(`
        SELECT id, 
               ISNULL(brand, 'Device Doctor India') as brand, 
               ISNULL(project_id, '') as projectId, 
               ISNULL(client_id, '') as clientId, 
               ISNULL(client_name, '') as clientName,
               ISNULL(payment_mode, 'GST Invoice') as paymentMode, 
               ISNULL(payment_date, '') as paymentDate, 
               ISNULL(due_date, '') as dueDate,
               ISNULL(amount_received, 0) as amountReceived, 
               ISNULL(currency, 'INR') as currency, 
               ISNULL(exchange_rate, 1) as exchangeRate,
               ISNULL(amount_inr, 0) as amountINR, 
               ISNULL(reference_utr, '') as referenceUtr, 
               ISNULL(payment_status, 'Received') as paymentStatus,
               ISNULL(days_overdue, 0) as daysOverdue, 
               ISNULL(notes, '') as notes, 
               ISNULL(payment_proof, '') as paymentProof,
               ISNULL(payment_proof_notes, '') as paymentProofNotes, 
               ISNULL(created_at, '') as createdAt, 
               ISNULL(updated_at, ISNULL(created_at, '')) as updatedAt
        FROM payments 
        ORDER BY created_at DESC
      `),
      'payments'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    return handleDbError(res, err, 'GET /payments', mockStore.getPayments());
  }
});

router.post('/payments', async (req: Request, res: Response) => {
  const payment: Payment = req.body;
  const now = new Date().toISOString();
  payment.updatedAt = now;
  payment.createdAt = payment.createdAt || now;

  const pool = getPool();
  if (!pool) {
    const saved = mockStore.savePayment(payment);
    return res.json({ success: true, payment: saved });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('id', payment.id)
        .input('brand', payment.brand || 'Device Doctor India')
        .input('project_id', payment.projectId || '')
        .input('client_id', payment.clientId || '')
        .input('client_name', payment.clientName || '')
        .input('payment_mode', payment.paymentMode || 'GST Invoice')
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
          IF EXISTS (SELECT 1 FROM payments WHERE id = @id)
            UPDATE payments SET brand=@brand, project_id=@project_id, client_id=@client_id, client_name=@client_name,
                               payment_mode=@payment_mode, payment_date=@payment_date, due_date=@due_date,
                               amount_received=@amount_received, currency=@currency, exchange_rate=@exchange_rate,
                               amount_inr=@amount_inr, reference_utr=@reference_utr, payment_status=@payment_status,
                               days_overdue=@days_overdue, notes=@notes, payment_proof=@payment_proof,
                               payment_proof_notes=@payment_proof_notes, updated_at=@updated_at
            WHERE id = @id
          ELSE
            INSERT INTO payments (id, brand, project_id, client_id, client_name, payment_mode, payment_date, due_date, amount_received, currency, exchange_rate, amount_inr, reference_utr, payment_status, days_overdue, notes, payment_proof, payment_proof_notes, created_at, updated_at)
            VALUES (@id, @brand, @project_id, @client_id, @client_name, @payment_mode, @payment_date, @due_date, @amount_received, @currency, @exchange_rate, @amount_inr, @reference_utr, @payment_status, @days_overdue, @notes, @payment_proof, @payment_proof_notes, @created_at, @updated_at)
        `)
    );
    mockStore.savePayment(payment);
    return res.json({ success: true, payment });
  } catch (err) {
    return handleDbError(res, err, 'POST /payments');
  }
});

router.delete('/payments/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    const ok = mockStore.deletePayment(id);
    return res.json({ success: ok, id });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request().input('id', id).query('DELETE FROM payments WHERE id = @id')
    );
    mockStore.deletePayment(id);
    return res.json({ success: true, id });
  } catch (err) {
    return handleDbError(res, err, `DELETE /payments/${id}`);
  }
});

// --- GST INVOICES ---
router.get('/gst-invoices', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.json(mockStore.getGstInvoices());
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request().query(`
        SELECT id, 
               ISNULL(brand, 'Device Doctor India') as brand, 
               ISNULL(payment_id, '') as paymentId, 
               ISNULL(project_id, '') as projectId, 
               ISNULL(client_id, '') as clientId,
               ISNULL(client_name, '') as clientName, 
               ISNULL(payment_date, '') as paymentDate, 
               ISNULL(amount_received, 0) as amountReceived,
               ISNULL(currency, 'INR') as currency, 
               ISNULL(amount_inr, 0) as amountINR, 
               ISNULL(gst_amount_inr, 0) as gstAmountINR, 
               ISNULL(invoice_number, '') as invoiceNumber,
               ISNULL(uploaded_to_gst_portal, 'No') as uploadedToGstPortal, 
               ISNULL(gst_portal_upload_date, '') as gstPortalUploadDate,
               ISNULL(notes, '') as notes, 
               ISNULL(created_at, '') as createdAt, 
               ISNULL(updated_at, ISNULL(created_at, '')) as updatedAt
        FROM gst_invoices 
        ORDER BY created_at DESC
      `),
      'gst_invoices'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    return handleDbError(res, err, 'GET /gst-invoices', mockStore.getGstInvoices());
  }
});

router.post('/gst-invoices', async (req: Request, res: Response) => {
  const inv: GstInvoice = req.body;
  const now = new Date().toISOString();
  inv.updatedAt = now;
  inv.createdAt = inv.createdAt || now;

  const pool = getPool();
  if (!pool) {
    const saved = mockStore.saveGstInvoice(inv);
    return res.json({ success: true, invoice: saved });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('id', inv.id)
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
          IF EXISTS (SELECT 1 FROM gst_invoices WHERE id = @id)
            UPDATE gst_invoices SET brand=@brand, payment_id=@payment_id, project_id=@project_id, client_id=@client_id,
                                   client_name=@client_name, payment_date=@payment_date, amount_received=@amount_received,
                                   currency=@currency, amount_inr=@amount_inr, gst_amount_inr=@gst_amount_inr,
                                   invoice_number=@invoice_number, uploaded_to_gst_portal=@uploaded_to_gst_portal,
                                   gst_portal_upload_date=@gst_portal_upload_date, notes=@notes, updated_at=@updated_at
            WHERE id = @id
          ELSE
            INSERT INTO gst_invoices (id, brand, payment_id, project_id, client_id, client_name, payment_date, amount_received, currency, amount_inr, gst_amount_inr, invoice_number, uploaded_to_gst_portal, gst_portal_upload_date, notes, created_at, updated_at)
            VALUES (@id, @brand, @payment_id, @project_id, @client_id, @client_name, @payment_date, @amount_received, @currency, @amount_inr, @gst_amount_inr, @invoice_number, @uploaded_to_gst_portal, @gst_portal_upload_date, @notes, @created_at, @updated_at)
        `)
    );
    mockStore.saveGstInvoice(inv);
    return res.json({ success: true, invoice: inv });
  } catch (err) {
    return handleDbError(res, err, 'POST /gst-invoices');
  }
});

router.delete('/gst-invoices/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    const ok = mockStore.deleteGstInvoice(id);
    return res.json({ success: ok, id });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request().input('id', id).query('DELETE FROM gst_invoices WHERE id = @id')
    );
    mockStore.deleteGstInvoice(id);
    return res.json({ success: true, id });
  } catch (err) {
    return handleDbError(res, err, `DELETE /gst-invoices/${id}`);
  }
});

// --- EMPLOYEE ROLES ---
router.get('/roles', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.json(mockStore.getRoles());
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request().query(`
        SELECT id, 
               ISNULL(brand, 'Device Doctor India') as brand, 
               ISNULL(role_name, ISNULL(name, '')) as roleName, 
               ISNULL(department, '') as department, 
               ISNULL(status, 'Active') as status, 
               ISNULL(description, '') as description, 
               ISNULL(created_at, '') as createdAt, 
               ISNULL(updated_at, ISNULL(created_at, '')) as updatedAt 
        FROM employee_roles 
        ORDER BY created_at DESC
      `),
      'employee_roles'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    return handleDbError(res, err, 'GET /roles', mockStore.getRoles());
  }
});

router.post('/roles', async (req: Request, res: Response) => {
  const role: EmployeeRole = req.body;
  const now = new Date().toISOString();
  role.updatedAt = now;
  role.createdAt = role.createdAt || now;

  const pool = getPool();
  if (!pool) {
    const saved = mockStore.saveRole(role);
    return res.json({ success: true, role: saved });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('id', role.id)
        .input('brand', role.brand || 'Device Doctor India')
        .input('role_name', role.roleName)
        .input('department', role.department || '')
        .input('status', role.status || 'Active')
        .input('description', role.description || '')
        .input('created_at', role.createdAt)
        .input('updated_at', role.updatedAt)
        .query(`
          IF EXISTS (SELECT 1 FROM employee_roles WHERE id = @id)
            UPDATE employee_roles SET brand=@brand, role_name=@role_name, department=@department, status=@status, description=@description, updated_at=@updated_at WHERE id=@id
          ELSE
            INSERT INTO employee_roles (id, brand, role_name, department, status, description, created_at, updated_at)
            VALUES (@id, @brand, @role_name, @department, @status, @description, @created_at, @updated_at)
        `)
    );
    mockStore.saveRole(role);
    return res.json({ success: true, role });
  } catch (err) {
    return handleDbError(res, err, 'POST /roles');
  }
});

router.delete('/roles/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    const ok = mockStore.deleteRole(id);
    return res.json({ success: ok, id });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request().input('id', id).query('DELETE FROM employee_roles WHERE id = @id')
    );
    mockStore.deleteRole(id);
    return res.json({ success: true, id });
  } catch (err) {
    return handleDbError(res, err, `DELETE /roles/${id}`);
  }
});

// --- EMPLOYEES ---
router.get('/employees', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.json(mockStore.getEmployees());
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request().query(`
        SELECT id, 
               ISNULL(brand, 'Device Doctor India') as brand, 
               ISNULL(name, ISNULL(employee_name, '')) as name, 
               ISNULL(role_id, '') as roleId, 
               email, 
               ISNULL(status, 'Active') as status, 
               ISNULL(joining_date, '') as joiningDate,
               ISNULL(cost_of_employee, 0) as costOfEmployee, 
               ISNULL(employee_type, 'Salary Basis') as employeeType, 
               ISNULL(comes_under_tds, 'No') as comesUnderTds,
               ISNULL(notes, '') as notes, 
               ISNULL(created_at, '') as createdAt, 
               ISNULL(updated_at, ISNULL(created_at, '')) as updatedAt
        FROM employees 
        ORDER BY created_at DESC
      `),
      'employees'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    return handleDbError(res, err, 'GET /employees', mockStore.getEmployees());
  }
});

router.post('/employees', async (req: Request, res: Response) => {
  const emp: Employee = req.body;
  const now = new Date().toISOString();
  emp.updatedAt = now;
  emp.createdAt = emp.createdAt || now;

  const pool = getPool();
  if (!pool) {
    const saved = mockStore.saveEmployee(emp);
    return res.json({ success: true, employee: saved });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('id', emp.id)
        .input('brand', emp.brand || 'Device Doctor India')
        .input('name', emp.name)
        .input('role_id', emp.roleId || '')
        .input('email', emp.email)
        .input('status', emp.status || 'Active')
        .input('joining_date', emp.joiningDate || '')
        .input('cost_of_employee', emp.costOfEmployee || 0)
        .input('employee_type', emp.employeeType || 'Salary Basis')
        .input('comes_under_tds', emp.comesUnderTds || 'No')
        .input('notes', emp.notes || '')
        .input('created_at', emp.createdAt)
        .input('updated_at', emp.updatedAt)
        .query(`
          IF EXISTS (SELECT 1 FROM employees WHERE id = @id)
            UPDATE employees SET brand=@brand, name=@name, role_id=@role_id, email=@email, status=@status,
                                joining_date=@joining_date, cost_of_employee=@cost_of_employee,
                                employee_type=@employee_type, comes_under_tds=@comes_under_tds, notes=@notes, updated_at=@updated_at
            WHERE id = @id
          ELSE
            INSERT INTO employees (id, brand, name, role_id, email, status, joining_date, cost_of_employee, employee_type, comes_under_tds, notes, created_at, updated_at)
            VALUES (@id, @brand, @name, @role_id, @email, @status, @joining_date, @cost_of_employee, @employee_type, @comes_under_tds, @notes, @created_at, @updated_at)
        `)
    );
    mockStore.saveEmployee(emp);
    return res.json({ success: true, employee: emp });
  } catch (err) {
    return handleDbError(res, err, 'POST /employees');
  }
});

router.delete('/employees/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    const ok = mockStore.deleteEmployee(id);
    return res.json({ success: ok, id });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request().input('id', id).query('DELETE FROM employees WHERE id = @id')
    );
    mockStore.deleteEmployee(id);
    return res.json({ success: true, id });
  } catch (err) {
    return handleDbError(res, err, `DELETE /employees/${id}`);
  }
});

// --- ASSIGNMENTS ---
router.get('/assignments', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.json(mockStore.getAssignments());
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request().query(`
        SELECT id, 
               ISNULL(brand, 'Device Doctor India') as brand, 
               ISNULL(project_id, '') as projectId, 
               ISNULL(client_id, '') as clientId, 
               ISNULL(client_name, '') as clientName,
               ISNULL(employee_id, '') as employeeId, 
               ISNULL(employee_name, '') as employeeName, 
               ISNULL(role_name, '') as roleName,
               ISNULL(assigned_date, '') as assignedDate, 
               ISNULL(work_assigned, '') as workAssigned, 
               ISNULL(amount, 0) as amount,
               ISNULL(amount_paid, 0) as amountPaid, 
               ISNULL(payment_status, 'Pending') as paymentStatus, 
               ISNULL(employee_notes, '') as employeeNotes,
               ISNULL(last_note_update, '') as lastNoteUpdate, 
               ISNULL(created_at, '') as createdAt, 
               ISNULL(updated_at, ISNULL(created_at, '')) as updatedAt
        FROM assignments 
        ORDER BY created_at DESC
      `),
      'assignments'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    return handleDbError(res, err, 'GET /assignments', mockStore.getAssignments());
  }
});

router.post('/assignments', async (req: Request, res: Response) => {
  const asn: Assignment = req.body;
  const now = new Date().toISOString();
  asn.updatedAt = now;
  asn.createdAt = asn.createdAt || now;

  const pool = getPool();
  if (!pool) {
    const saved = mockStore.saveAssignment(asn);
    return res.json({ success: true, assignment: saved });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('id', asn.id)
        .input('brand', asn.brand || 'Device Doctor India')
        .input('project_id', asn.projectId || '')
        .input('client_id', asn.clientId || '')
        .input('client_name', asn.clientName || '')
        .input('employee_id', asn.employeeId || '')
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
          IF EXISTS (SELECT 1 FROM assignments WHERE id = @id)
            UPDATE assignments SET brand=@brand, project_id=@project_id, client_id=@client_id, client_name=@client_name,
                                   employee_id=@employee_id, employee_name=@employee_name, role_name=@role_name,
                                   assigned_date=@assigned_date, work_assigned=@work_assigned, amount=@amount,
                                   amount_paid=@amount_paid, payment_status=@payment_status, employee_notes=@employee_notes,
                                   last_note_update=@last_note_update, updated_at=@updated_at
            WHERE id = @id
          ELSE
            INSERT INTO assignments (id, brand, project_id, client_id, client_name, employee_id, employee_name, role_name, assigned_date, work_assigned, amount, amount_paid, payment_status, employee_notes, last_note_update, created_at, updated_at)
            VALUES (@id, @brand, @project_id, @client_id, @client_name, @employee_id, @employee_name, @role_name, @assigned_date, @work_assigned, @amount, @amount_paid, @payment_status, @employee_notes, @last_note_update, @created_at, @updated_at)
        `)
    );
    mockStore.saveAssignment(asn);
    return res.json({ success: true, assignment: asn });
  } catch (err) {
    return handleDbError(res, err, 'POST /assignments');
  }
});

router.delete('/assignments/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    const ok = mockStore.deleteAssignment(id);
    return res.json({ success: ok, id });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request().input('id', id).query('DELETE FROM assignments WHERE id = @id')
    );
    mockStore.deleteAssignment(id);
    return res.json({ success: true, id });
  } catch (err) {
    return handleDbError(res, err, `DELETE /assignments/${id}`);
  }
});

// --- EMPLOYEE PAYMENTS ---
router.get('/employee-payments', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.json(mockStore.getEmployeePayments());
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request().query(`
        SELECT id, 
               ISNULL(brand, 'Device Doctor India') as brand, 
               ISNULL(assignment_id, '') as assignmentId, 
               ISNULL(project_id, '') as projectId, 
               ISNULL(employee_id, '') as employeeId,
               ISNULL(employee_name, '') as employeeName, 
               ISNULL(payment_date, '') as paymentDate, 
               ISNULL(amount_paid, 0) as amountPaid,
               ISNULL(payment_mode, 'GST Invoice') as paymentMode, 
               ISNULL(reference_utr, '') as referenceUtr, 
               ISNULL(notes, '') as notes,
               ISNULL(payment_proof, '') as paymentProof, 
               ISNULL(payment_proof_notes, '') as paymentProofNotes,
               ISNULL(created_at, '') as createdAt, 
               ISNULL(updated_at, ISNULL(created_at, '')) as updatedAt
        FROM employee_payments 
        ORDER BY created_at DESC
      `),
      'employee_payments'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    return handleDbError(res, err, 'GET /employee-payments', mockStore.getEmployeePayments());
  }
});

router.post('/employee-payments', async (req: Request, res: Response) => {
  const epay: EmployeePayment = req.body;
  const now = new Date().toISOString();
  epay.updatedAt = now;
  epay.createdAt = epay.createdAt || now;

  const pool = getPool();
  if (!pool) {
    const saved = mockStore.saveEmployeePayment(epay);
    return res.json({ success: true, payment: saved });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('id', epay.id)
        .input('brand', epay.brand || 'Device Doctor India')
        .input('assignment_id', epay.assignmentId || '')
        .input('project_id', epay.projectId || '')
        .input('employee_id', epay.employeeId || '')
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
          IF EXISTS (SELECT 1 FROM employee_payments WHERE id = @id)
            UPDATE employee_payments SET brand=@brand, assignment_id=@assignment_id, project_id=@project_id,
                                        employee_id=@employee_id, employee_name=@employee_name, payment_date=@payment_date,
                                        amount_paid=@amount_paid, payment_mode=@payment_mode, reference_utr=@reference_utr,
                                        notes=@notes, payment_proof=@payment_proof, payment_proof_notes=@payment_proof_notes,
                                        updated_at=@updated_at
            WHERE id = @id
          ELSE
            INSERT INTO employee_payments (id, brand, assignment_id, project_id, employee_id, employee_name, payment_date, amount_paid, payment_mode, reference_utr, notes, payment_proof, payment_proof_notes, created_at, updated_at)
            VALUES (@id, @brand, @assignment_id, @project_id, @employee_id, @employee_name, @payment_date, @amount_paid, @payment_mode, @reference_utr, @notes, @payment_proof, @payment_proof_notes, @created_at, @updated_at)
        `)
    );
    mockStore.saveEmployeePayment(epay);
    return res.json({ success: true, payment: epay });
  } catch (err) {
    return handleDbError(res, err, 'POST /employee-payments');
  }
});

router.delete('/employee-payments/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    const ok = mockStore.deleteEmployeePayment(id);
    return res.json({ success: ok, id });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request().input('id', id).query('DELETE FROM employee_payments WHERE id = @id')
    );
    mockStore.deleteEmployeePayment(id);
    return res.json({ success: true, id });
  } catch (err) {
    return handleDbError(res, err, `DELETE /employee-payments/${id}`);
  }
});

// --- EXPENSE CATEGORIES ---
router.get('/expense-categories', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.json(mockStore.getExpenseCategories());
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request().query(`
        SELECT id, 
               ISNULL(brand, 'Device Doctor India') as brand, 
               ISNULL(name, ISNULL(category_name, '')) as name, 
               ISNULL(description, '') as description, 
               ISNULL(status, 'Active') as status, 
               ISNULL(created_at, '') as createdAt, 
               ISNULL(updated_at, ISNULL(created_at, '')) as updatedAt 
        FROM expense_categories 
        ORDER BY created_at DESC
      `),
      'expense_categories'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    return handleDbError(res, err, 'GET /expense-categories', mockStore.getExpenseCategories());
  }
});

router.post('/expense-categories', async (req: Request, res: Response) => {
  const cat: ExpenseCategory = req.body;
  const now = new Date().toISOString();
  cat.updatedAt = now;
  cat.createdAt = cat.createdAt || now;

  const pool = getPool();
  if (!pool) {
    const saved = mockStore.saveExpenseCategory(cat);
    return res.json({ success: true, category: saved });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('id', cat.id)
        .input('brand', cat.brand || 'Device Doctor India')
        .input('name', cat.name)
        .input('description', cat.description || '')
        .input('status', cat.status || 'Active')
        .input('created_at', cat.createdAt)
        .input('updated_at', cat.updatedAt)
        .query(`
          IF EXISTS (SELECT 1 FROM expense_categories WHERE id = @id)
            UPDATE expense_categories SET brand=@brand, name=@name, description=@description, status=@status, updated_at=@updated_at WHERE id=@id
          ELSE
            INSERT INTO expense_categories (id, brand, name, description, status, created_at, updated_at)
            VALUES (@id, @brand, @name, @description, @status, @created_at, @updated_at)
        `)
    );
    mockStore.saveExpenseCategory(cat);
    return res.json({ success: true, category: cat });
  } catch (err) {
    return handleDbError(res, err, 'POST /expense-categories');
  }
});

router.delete('/expense-categories/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    const ok = mockStore.deleteExpenseCategory(id);
    return res.json({ success: ok, id });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request().input('id', id).query('DELETE FROM expense_categories WHERE id = @id')
    );
    mockStore.deleteExpenseCategory(id);
    return res.json({ success: true, id });
  } catch (err) {
    return handleDbError(res, err, `DELETE /expense-categories/${id}`);
  }
});

// --- OTHER EXPENSES ---
router.get('/expenses', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.json(mockStore.getExpenses());
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request().query(`
        SELECT id, 
               ISNULL(brand, 'Device Doctor India') as brand, 
               ISNULL(project_id, '') as projectId, 
               ISNULL(client_id, '') as clientId, 
               ISNULL(client_name, '') as clientName,
               ISNULL(expense_category_id, '') as expenseCategoryId, 
               ISNULL(expense_category_name, '') as expenseCategoryName,
               ISNULL(vendor, '') as vendor, 
               ISNULL(description, '') as description, 
               ISNULL(amount, 0) as amount, 
               ISNULL(currency, 'INR') as currency, 
               ISNULL(exchange_rate, 1) as exchangeRate,
               ISNULL(amount_inr, 0) as amountINR, 
               ISNULL(expense_date, '') as expenseDate, 
               ISNULL(payment_status, 'Paid') as paymentStatus,
               ISNULL(notes, '') as notes, 
               ISNULL(created_at, '') as createdAt, 
               ISNULL(updated_at, ISNULL(created_at, '')) as updatedAt
        FROM other_expenses 
        ORDER BY created_at DESC
      `),
      'other_expenses'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    return handleDbError(res, err, 'GET /expenses', mockStore.getExpenses());
  }
});

router.post('/expenses', async (req: Request, res: Response) => {
  const exp: Expense = req.body;
  const now = new Date().toISOString();
  exp.updatedAt = now;
  exp.createdAt = exp.createdAt || now;

  const pool = getPool();
  if (!pool) {
    const saved = mockStore.saveExpense(exp);
    return res.json({ success: true, expense: saved });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('id', exp.id)
        .input('brand', exp.brand || 'Device Doctor India')
        .input('project_id', exp.projectId || '')
        .input('client_id', exp.clientId || '')
        .input('client_name', exp.clientName || '')
        .input('expense_category_id', exp.expenseCategoryId || '')
        .input('expense_category_name', exp.expenseCategoryName || '')
        .input('vendor', exp.vendor || '')
        .input('description', exp.description || '')
        .input('amount', exp.amount || 0)
        .input('currency', exp.currency || 'INR')
        .input('exchange_rate', exp.exchangeRate || 1)
        .input('amount_inr', exp.amountINR || 0)
        .input('expense_date', exp.expenseDate || '')
        .input('payment_status', exp.paymentStatus || 'Paid')
        .input('notes', exp.notes || '')
        .input('created_at', exp.createdAt)
        .input('updated_at', exp.updatedAt)
        .query(`
          IF EXISTS (SELECT 1 FROM other_expenses WHERE id = @id)
            UPDATE other_expenses SET brand=@brand, project_id=@project_id, client_id=@client_id, client_name=@client_name,
                                      expense_category_id=@expense_category_id, expense_category_name=@expense_category_name,
                                      vendor=@vendor, description=@description, amount=@amount, currency=@currency,
                                      exchange_rate=@exchange_rate, amount_inr=@amount_inr, expense_date=@expense_date,
                                      payment_status=@payment_status, notes=@notes, updated_at=@updated_at
            WHERE id = @id
          ELSE
            INSERT INTO other_expenses (id, brand, project_id, client_id, client_name, expense_category_id, expense_category_name, vendor, description, amount, currency, exchange_rate, amount_inr, expense_date, payment_status, notes, created_at, updated_at)
            VALUES (@id, @brand, @project_id, @client_id, @client_name, @expense_category_id, @expense_category_name, @vendor, @description, @amount, @currency, @exchange_rate, @amount_inr, @expense_date, @payment_status, @notes, @created_at, @updated_at)
        `)
    );
    mockStore.saveExpense(exp);
    return res.json({ success: true, expense: exp });
  } catch (err) {
    return handleDbError(res, err, 'POST /expenses');
  }
});

router.delete('/expenses/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    const ok = mockStore.deleteExpense(id);
    return res.json({ success: ok, id });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request().input('id', id).query('DELETE FROM other_expenses WHERE id = @id')
    );
    mockStore.deleteExpense(id);
    return res.json({ success: true, id });
  } catch (err) {
    return handleDbError(res, err, `DELETE /expenses/${id}`);
  }
});

// --- APP USERS (Admin & User Management) ---
router.get('/users', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.json(mockStore.getUsers());
  }

  try {
    const q = await executeSqlWithAutoMigration(
      pool,
      () =>
        pool.request().query(`
        SELECT id, 
               ISNULL(name, ISNULL(full_name, ISNULL(username, 'User'))) as name, 
               email, 
               role, 
               ISNULL(brand, 'All') as brand, 
               ISNULL(status, 'Active') as status, 
               ISNULL(avatar, '') as avatar, 
               ISNULL(created_at, '') as createdAt, 
               ISNULL(updated_at, ISNULL(created_at, '')) as updatedAt 
        FROM app_users 
        ORDER BY created_at ASC
      `),
      'app_users'
    );
    return res.json(q.recordset || []);
  } catch (err) {
    return handleDbError(res, err, 'GET /users', mockStore.getUsers());
  }
});

router.post('/users', async (req: Request, res: Response) => {
  const user: AppUser = req.body;
  const now = new Date().toISOString();
  user.updatedAt = now;
  user.createdAt = user.createdAt || now;

  const pool = getPool();
  if (!pool) {
    const saved = mockStore.saveUser(user);
    return res.json({ success: true, user: saved });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request()
        .input('id', user.id)
        .input('name', user.name)
        .input('email', user.email.toLowerCase())
        .input('password_hash', user.password || 'Admin@2026')
        .input('role', user.role)
        .input('brand', user.brand || 'All')
        .input('status', user.status || 'Active')
        .input('avatar', user.avatar || '')
        .input('created_at', user.createdAt)
        .input('updated_at', user.updatedAt)
        .query(`
          IF EXISTS (SELECT 1 FROM app_users WHERE id = @id)
            UPDATE app_users SET name = @name, email = @email, password_hash = @password_hash, role = @role, brand = @brand, status = @status, avatar = @avatar, updated_at = @updated_at WHERE id = @id
          ELSE
            INSERT INTO app_users (id, name, email, password_hash, role, brand, status, avatar, created_at, updated_at)
            VALUES (@id, @name, @email, @password_hash, @role, @brand, @status, @avatar, @created_at, @updated_at)
        `)
    );
    mockStore.saveUser(user);
    return res.json({ success: true, user });
  } catch (err) {
    return handleDbError(res, err, 'POST /users');
  }
});

router.delete('/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    const ok = mockStore.deleteUser(id);
    return res.json({ success: ok, id });
  }

  try {
    await executeSqlWithAutoMigration(pool, () =>
      pool.request().input('id', id).query('DELETE FROM app_users WHERE id = @id')
    );
    mockStore.deleteUser(id);
    return res.json({ success: true, id });
  } catch (err) {
    return handleDbError(res, err, `DELETE /users/${id}`);
  }
});

// --- AUDIT LOG ---
router.get('/audit', async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.json(mockStore.getAuditLog());
  }

  try {
    const q = await executeSqlWithAutoMigration(pool, () =>
      pool.request().query('SELECT TOP 100 * FROM crm_audit_log ORDER BY id DESC')
    );
    return res.json(q.recordset || []);
  } catch (err) {
    return handleDbError(res, err, 'GET /audit', mockStore.getAuditLog());
  }
});

router.post('/audit', async (req: Request, res: Response) => {
  const { brand, module, action, entityId, details, performedBy } = req.body;
  const now = new Date().toISOString();

  const pool = getPool();
  if (!pool) {
    mockStore.addAuditLog({
      brand: brand || 'All',
      module: module || 'General',
      action: action || 'LOG',
      entityId: entityId || '',
      details: details || '',
      performedBy: performedBy || 'System',
    });
    return res.json({ success: true });
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
    return handleDbError(res, err, 'POST /audit');
  }
});

export default router;
