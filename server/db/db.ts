import sql from 'mssql';
import dns from 'dns';
import {
  AzureDbStatus,
  getAuthType,
  getServer,
  getDatabase,
  getUser,
  getPassword,
  getPort,
  getClientId,
  getTenantId,
  getSqlConfig,
  isTransientError,
  SQL_POOL_CONFIG,
  SQL_OPTIONS_CONFIG,
} from './db.config';

export * from './db.config';

// Singleton pool state & lock
let globalPool: sql.ConnectionPool | null = null;
let poolConnectingPromise: Promise<sql.ConnectionPool | null> | null = null;
let isConnected = false;
let lastError: string | null = null;
let tableCountsCache: Record<string, number> = {};
let activeConnectedServer = getServer();
let hasRunInitialSchemaSync = false;

/**
 * Retrieve current active pool if connected
 */
export function getPool(): sql.ConnectionPool | null {
  if (globalPool && isConnected) {
    return globalPool;
  }
  return null;
}

export function isDbConnected(): boolean {
  return isConnected && globalPool !== null;
}

/**
 * Global pool accessor with deduplicated in-flight connection promise
 * Reuses the single connection pool across all controllers and API requests.
 */
export async function getOrInitPool(): Promise<sql.ConnectionPool | null> {
  if (globalPool && isConnected) {
    return globalPool;
  }

  if (poolConnectingPromise) {
    return poolConnectingPromise;
  }

  poolConnectingPromise = (async () => {
    try {
      const ok = await initAzureSql();
      if (ok && globalPool && isConnected) {
        return globalPool;
      }
      return null;
    } catch (err) {
      console.warn('[Azure SQL] Pool acquisition failed:', err);
      return null;
    } finally {
      poolConnectingPromise = null;
    }
  })();

  return poolConnectingPromise;
}

/**
 * Initialize or reconnect the global Azure SQL ConnectionPool
 */
export async function initAzureSql(forceReconnect: boolean = false): Promise<boolean> {
  if (globalPool && isConnected && !forceReconnect) {
    return true;
  }

  const password = getPassword();
  const user = getUser();
  const server = getServer();
  const database = getDatabase();
  const authType = getAuthType();

  if (!password) {
    lastError = 'AZURE_SQL_PASSWORD not configured. Running in high-availability store mode.';
    isConnected = false;
    return false;
  }

  try {
    // If existing pool is present, close cleanly before reconnecting
    if (globalPool) {
      try {
        await globalPool.close();
      } catch {
        // Ignore close errors during recycling
      }
      globalPool = null;
    }

    // Proactively verify DNS
    let targetServer = server;
    try {
      await dns.promises.lookup(server);
    } catch {
      if (server === 'ddcrm.database.windows.net') {
        targetServer = 'ddrcm.database.windows.net';
      }
    }
    activeConnectedServer = targetServer;
    const config = getSqlConfig(targetServer);

    const authLabel = (authType === 'sql-server' || authType === 'sql')
      ? 'SQL Server Native Auth'
      : 'Microsoft Entra Password Auth';
    console.log(`[Azure SQL Pool] Initializing pool (${authLabel}) to ${targetServer} [DB: ${database}]...`);

    const newPool = new sql.ConnectionPool(config);

    // Attach background error listener to handle network drops and pool errors gracefully
    newPool.on('error', (err: any) => {
      console.warn('[Azure SQL Pool Event] Pool connection error:', err?.message || err);
      if (isTransientError(err)) {
        isConnected = false;
        globalPool = null;
      }
    });

    await newPool.connect();

    globalPool = newPool;
    isConnected = true;
    lastError = null;
    console.log(`[Azure SQL Pool] Connected successfully to ${database} on ${activeConnectedServer}!`);

    // Ensure database schema and migrations run once on startup
    if (!hasRunInitialSchemaSync) {
      hasRunInitialSchemaSync = true;
      initSchemaInBackground(newPool);
    }

    return true;
  } catch (err: unknown) {
    const anyErr = err as any;
    let errorMsg = '';
    if (Array.isArray(anyErr?.originalError?.errors) && anyErr.originalError.errors.length > 0) {
      errorMsg = anyErr.originalError.errors
        .map((e: any) => e.message || e.errorMessage || String(e))
        .filter(Boolean)
        .join(' | ');
    } else if (anyErr?.originalError?.message) {
      errorMsg = anyErr.originalError.message;
    } else if (err instanceof Error) {
      errorMsg = err.message;
    } else {
      errorMsg = String(err);
    }

    lastError = errorMsg;
    isConnected = false;
    globalPool = null;
    console.warn(`[Azure SQL Pool] Connection pending credentials / firewall access (${errorMsg}).`);
    return false;
  }
}

/**
 * Run table DDL and migrations non-blockingly in the background
 */
async function initSchemaInBackground(activePool: sql.ConnectionPool) {
  try {
    const BATCH_SIZE = 5;
    for (let i = 0; i < DDL_STATEMENTS.length; i += BATCH_SIZE) {
      const batch = DDL_STATEMENTS.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map((ddl) => activePool.request().query(ddl)));
    }
    await migrateAzureSqlSchema(activePool);
    await refreshTableCounts();
  } catch (err) {
    console.warn('[Azure SQL Schema] Notice during initial background schema sync:', err);
  }
}

/**
 * Execute SQL Query with Automatic Retry and Schema Healing
 * - Uses parameterized queries to leverage SQL Server execution plan caching
 * - Catches transient drops and retries with backoff
 * - Heals missing column errors on-demand in <50ms instead of running all migrations
 */
export async function executeSql<T>(
  queryFn: (pool: sql.ConnectionPool) => Promise<T>,
  tableName?: string
): Promise<T> {
  let pool = await getOrInitPool();
  if (!pool) {
    throw new Error('Database pool not connected.');
  }

  try {
    return await queryFn(pool);
  } catch (err: any) {
    const msg = String(err?.message || err);

    // 1. Check for missing column error and heal on-demand instantly
    if (msg.includes('Invalid column name') && tableName) {
      const colMatch = msg.match(/Invalid column name '([^']+)'/i);
      if (colMatch && colMatch[1]) {
        const colName = colMatch[1];
        try {
          console.warn(`[Azure SQL Auto-Heal] Adding missing column [${colName}] to [${tableName}]...`);
          await pool.request().query(`
            IF EXISTS (SELECT * FROM sys.tables WHERE name = '${tableName}') 
            AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('${tableName}') AND name = '${colName}')
            ALTER TABLE [${tableName}] ADD [${colName}] NVARCHAR(MAX);
          `);
          return await queryFn(pool);
        } catch {
          // If auto-heal fails, continue to retry/throw
        }
      }
    }

    // 2. Check for transient connection drops and retry with reconnected pool
    if (isTransientError(err)) {
      console.warn(`[Azure SQL Transient Retry] Network glitch detected (${msg}). Reconnecting pool...`);
      isConnected = false;
      globalPool = null;
      await new Promise((r) => setTimeout(r, 500));
      const newPool = await getOrInitPool();
      if (newPool) {
        return await queryFn(newPool);
      }
    }

    throw err;
  }
}

/**
 * Gracefully close the global pool (for server shutdown)
 */
export async function closePool(): Promise<void> {
  if (globalPool) {
    try {
      await globalPool.close();
      console.log('[Azure SQL Pool] Closed gracefully.');
    } catch (err) {
      console.warn('[Azure SQL Pool] Error during close:', err);
    } finally {
      globalPool = null;
      isConnected = false;
    }
  }
}

export async function refreshTableCounts(): Promise<Record<string, number>> {
  if (!globalPool || !isConnected) return tableCountsCache;

  const tables = [
    'clients',
    'service_categories',
    'services',
    'projects',
    'payments',
    'gst_invoices',
    'employee_roles',
    'employees',
    'assignments',
    'employee_payments',
    'expense_categories',
    'other_expenses',
    'app_users',
    'crm_audit_log',
    'bank_accounts',
  ];

  const counts: Record<string, number> = {};
  for (const table of tables) {
    try {
      const res = await globalPool.request().query(`SELECT COUNT(*) as count FROM [${table}]`);
      counts[table] = res.recordset[0]?.count || 0;
    } catch {
      counts[table] = 0;
    }
  }
  tableCountsCache = counts;
  return counts;
}

export function getAzureDbStatus(): AzureDbStatus {
  const authType = getAuthType();
  return {
    connected: isConnected,
    server: activeConnectedServer || getServer(),
    database: getDatabase(),
    authType: (authType === 'sql-server' || authType === 'sql')
      ? 'SQL Server Authentication (Native)'
      : 'Active Directory Password (Microsoft Entra)',
    user: getUser(),
    error: lastError,
    lastChecked: new Date().toISOString(),
    tableCounts: tableCountsCache,
  };
}

// DDL and Schema Migration definitions
export const DDL_STATEMENTS = [
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='clients' AND xtype='U')
   CREATE TABLE clients (
     id NVARCHAR(150) PRIMARY KEY,
     client_id_code NVARCHAR(150),
     brand NVARCHAR(100) NOT NULL,
     name NVARCHAR(255) NOT NULL,
     contact_person NVARCHAR(255),
     phone NVARCHAR(50),
     email NVARCHAR(255),
     city NVARCHAR(100),
     country NVARCHAR(100),
     gst_number NVARCHAR(50),
     preferred_currency NVARCHAR(10) DEFAULT 'INR',
     client_since NVARCHAR(50),
     status NVARCHAR(50) DEFAULT 'Active',
     notes NVARCHAR(MAX),
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='service_categories' AND xtype='U')
   CREATE TABLE service_categories (
     id NVARCHAR(50) PRIMARY KEY,
     brand NVARCHAR(100) NOT NULL,
     name NVARCHAR(255) NOT NULL,
     description NVARCHAR(MAX),
     status NVARCHAR(50) DEFAULT 'Active',
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='services' AND xtype='U')
   CREATE TABLE services (
     id NVARCHAR(50) PRIMARY KEY,
     brand NVARCHAR(100) NOT NULL,
     name NVARCHAR(255) NOT NULL,
     category_id NVARCHAR(50),
     description NVARCHAR(MAX),
     status NVARCHAR(50) DEFAULT 'Active',
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='projects' AND xtype='U')
   CREATE TABLE projects (
     id NVARCHAR(150) PRIMARY KEY,
     project_id_code NVARCHAR(150),
     brand NVARCHAR(100) NOT NULL,
     client_id NVARCHAR(150),
     client_name NVARCHAR(255),
     service_id NVARCHAR(150),
     proposal_date NVARCHAR(50),
     contract_date NVARCHAR(50),
     start_date NVARCHAR(50),
     committed_days INT DEFAULT 30,
     committed_end_date NVARCHAR(50),
     actual_end_date NVARCHAR(50),
     status NVARCHAR(50) DEFAULT 'In Progress',
     payment_mode NVARCHAR(50) DEFAULT 'GST Invoice',
     currency NVARCHAR(10) DEFAULT 'INR',
     contract FLOAT DEFAULT 0,
     exchange_rate FLOAT DEFAULT 1,
     contract_value FLOAT DEFAULT 0,
     total_received FLOAT DEFAULT 0,
     balance FLOAT DEFAULT 0,
     project_manager NVARCHAR(255),
     notes NVARCHAR(MAX),
     proposal_document NVARCHAR(MAX),
     contract_document NVARCHAR(MAX),
     payment_phases NVARCHAR(MAX),
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='payments' AND xtype='U')
   CREATE TABLE payments (
     id NVARCHAR(50) PRIMARY KEY,
     brand NVARCHAR(100) NOT NULL,
     project_id NVARCHAR(150),
     client_id NVARCHAR(50),
     client_name NVARCHAR(255),
     payment_mode NVARCHAR(50) DEFAULT 'GST Invoice',
     bank_account_id NVARCHAR(100),
     bank_account_name NVARCHAR(255),
     payment_date NVARCHAR(50),
     due_date NVARCHAR(50),
     amount_received FLOAT DEFAULT 0,
     currency NVARCHAR(10) DEFAULT 'INR',
     exchange_rate FLOAT DEFAULT 1,
     amount_inr FLOAT DEFAULT 0,
     reference_utr NVARCHAR(100),
     payment_status NVARCHAR(50) DEFAULT 'Received',
     days_overdue INT DEFAULT 0,
     notes NVARCHAR(MAX),
     payment_proof NVARCHAR(MAX),
     payment_proof_notes NVARCHAR(MAX),
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='gst_invoices' AND xtype='U')
   CREATE TABLE gst_invoices (
     id NVARCHAR(50) PRIMARY KEY,
     brand NVARCHAR(100) NOT NULL,
     payment_id NVARCHAR(50),
     project_id NVARCHAR(150),
     client_id NVARCHAR(50),
     client_name NVARCHAR(255),
     payment_date NVARCHAR(50),
     amount_received FLOAT DEFAULT 0,
     currency NVARCHAR(10) DEFAULT 'INR',
     amount_inr FLOAT DEFAULT 0,
     gst_amount_inr FLOAT DEFAULT 0,
     invoice_number NVARCHAR(100),
     uploaded_to_gst_portal NVARCHAR(10) DEFAULT 'No',
     gst_portal_upload_date NVARCHAR(50),
     notes NVARCHAR(MAX),
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='employee_roles' AND xtype='U')
   CREATE TABLE employee_roles (
     id NVARCHAR(50) PRIMARY KEY,
     brand NVARCHAR(100) NOT NULL,
     role_name NVARCHAR(255) NOT NULL,
     department NVARCHAR(255),
     status NVARCHAR(50) DEFAULT 'Active',
     description NVARCHAR(MAX),
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='employees' AND xtype='U')
   CREATE TABLE employees (
     id NVARCHAR(50) PRIMARY KEY,
     brand NVARCHAR(100) NOT NULL,
     name NVARCHAR(255) NOT NULL,
     role_id NVARCHAR(50),
     email NVARCHAR(255) NULL,
     status NVARCHAR(50) DEFAULT 'Active',
     joining_date NVARCHAR(50),
     cost_of_employee FLOAT DEFAULT 0,
     employee_type NVARCHAR(50) DEFAULT 'Salary Basis',
     comes_under_tds NVARCHAR(10) DEFAULT 'No',
     notes NVARCHAR(MAX),
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='assignments' AND xtype='U')
   CREATE TABLE assignments (
     id NVARCHAR(50) PRIMARY KEY,
     brand NVARCHAR(100) NOT NULL,
     project_id NVARCHAR(150),
     client_id NVARCHAR(50),
     client_name NVARCHAR(255),
     employee_id NVARCHAR(50),
     employee_name NVARCHAR(255),
     role_name NVARCHAR(255),
     assigned_date NVARCHAR(50),
     work_assigned NVARCHAR(MAX),
     amount FLOAT DEFAULT 0,
     amount_paid FLOAT DEFAULT 0,
     payment_status NVARCHAR(50) DEFAULT 'Pending',
     employee_notes NVARCHAR(MAX),
     last_note_update NVARCHAR(50),
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='employee_payments' AND xtype='U')
   CREATE TABLE employee_payments (
     id NVARCHAR(50) PRIMARY KEY,
     brand NVARCHAR(100) NOT NULL,
     assignment_id NVARCHAR(50),
     project_id NVARCHAR(150),
     employee_id NVARCHAR(50),
     employee_name NVARCHAR(255),
     payment_date NVARCHAR(50),
     amount_paid FLOAT DEFAULT 0,
     payment_mode NVARCHAR(50) DEFAULT 'GST Invoice',
     reference_utr NVARCHAR(100),
     notes NVARCHAR(MAX),
     payment_proof NVARCHAR(MAX),
     payment_proof_notes NVARCHAR(MAX),
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='expense_categories' AND xtype='U')
   CREATE TABLE expense_categories (
     id NVARCHAR(50) PRIMARY KEY,
     brand NVARCHAR(100) NOT NULL,
     name NVARCHAR(255) NOT NULL,
     description NVARCHAR(MAX),
     status NVARCHAR(50) DEFAULT 'Active',
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='other_expenses' AND xtype='U')
   CREATE TABLE other_expenses (
     id NVARCHAR(50) PRIMARY KEY,
     brand NVARCHAR(100) NOT NULL,
     project_id NVARCHAR(150),
     client_id NVARCHAR(50),
     client_name NVARCHAR(255),
     expense_category_id NVARCHAR(50),
     expense_category_name NVARCHAR(255),
     vendor NVARCHAR(255),
     description NVARCHAR(MAX),
     amount FLOAT DEFAULT 0,
     currency NVARCHAR(10) DEFAULT 'INR',
     exchange_rate FLOAT DEFAULT 1,
     amount_inr FLOAT DEFAULT 0,
     expense_date NVARCHAR(50),
     payment_status NVARCHAR(50) DEFAULT 'Paid',
     notes NVARCHAR(MAX),
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='app_users' AND xtype='U')
   CREATE TABLE app_users (
     id NVARCHAR(50) PRIMARY KEY,
     name NVARCHAR(255) NOT NULL,
     email NVARCHAR(255) NOT NULL UNIQUE,
     password_hash NVARCHAR(255) NOT NULL,
     role NVARCHAR(50) NOT NULL,
     brand NVARCHAR(100) DEFAULT 'All',
     status NVARCHAR(50) DEFAULT 'Active',
     avatar NVARCHAR(500),
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='crm_audit_log' AND xtype='U')
   CREATE TABLE crm_audit_log (
     id INT IDENTITY(1,1) PRIMARY KEY,
     brand NVARCHAR(100),
     module NVARCHAR(100),
     action NVARCHAR(50),
     entity_id NVARCHAR(100),
     details NVARCHAR(MAX),
     performed_by NVARCHAR(255),
     timestamp NVARCHAR(50)
   )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='bank_accounts' AND xtype='U')
   CREATE TABLE bank_accounts (
     id NVARCHAR(50) PRIMARY KEY,
     brand NVARCHAR(100) NOT NULL,
     account_name NVARCHAR(255) NOT NULL,
     bank_name NVARCHAR(255) NOT NULL,
     account_number NVARCHAR(150) NOT NULL,
     ifsc_code NVARCHAR(50),
     branch_name NVARCHAR(100),
     upi_id NVARCHAR(100),
     account_type NVARCHAR(50) DEFAULT 'Current',
     status NVARCHAR(50) DEFAULT 'Active',
     notes NVARCHAR(MAX),
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,
];

export const COLUMN_MIGRATIONS = [
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'name') ALTER TABLE clients ADD name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'client_name') ALTER TABLE clients ADD client_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'contact_person') ALTER TABLE clients ADD contact_person NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'phone') ALTER TABLE clients ADD phone NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'email') ALTER TABLE clients ADD email NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'city') ALTER TABLE clients ADD city NVARCHAR(100) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'country') ALTER TABLE clients ADD country NVARCHAR(100) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'gst_number') ALTER TABLE clients ADD gst_number NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'preferred_currency') ALTER TABLE clients ADD preferred_currency NVARCHAR(10) DEFAULT 'INR';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'client_since') ALTER TABLE clients ADD client_since NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'status') ALTER TABLE clients ADD status NVARCHAR(50) DEFAULT 'Active';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'notes') ALTER TABLE clients ADD notes NVARCHAR(MAX) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'brand') ALTER TABLE clients ADD brand NVARCHAR(100) DEFAULT 'Device Doctor India';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'created_at') ALTER TABLE clients ADD created_at NVARCHAR(50);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'updated_at') ALTER TABLE clients ADD updated_at NVARCHAR(50);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'clients') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'client_id_code') ALTER TABLE clients ADD client_id_code NVARCHAR(150);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'project_id_code') ALTER TABLE projects ADD project_id_code NVARCHAR(150);`,
];

export const DATA_SYNC_STATEMENTS = [
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'category_id')
   EXEC('UPDATE other_expenses SET expense_category_id = category_id WHERE (expense_category_id IS NULL OR expense_category_id = '''') AND category_id IS NOT NULL AND category_id <> '''';');`,
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'client_name')
   EXEC('UPDATE clients SET name = client_name WHERE (name IS NULL OR name = '''') AND client_name IS NOT NULL AND client_name <> '''';');`,
];

export async function migrateAzureSqlSchema(p?: sql.ConnectionPool): Promise<void> {
  const activePool = p || globalPool;
  if (!activePool) return;

  // Execute column migration statements in parallel batches
  const CHUNK_SIZE = 10;
  for (let i = 0; i < COLUMN_MIGRATIONS.length; i += CHUNK_SIZE) {
    const chunk = COLUMN_MIGRATIONS.slice(i, i + CHUNK_SIZE);
    await Promise.allSettled(chunk.map((stmt) => activePool.request().query(stmt)));
  }

  for (const syncStmt of DATA_SYNC_STATEMENTS) {
    try {
      await activePool.request().query(syncStmt);
    } catch {
      // Ignore
    }
  }
}

const db = {
  getPool,
  getOrInitPool,
  initAzureSql,
  closePool,
  executeSql,
  getAzureDbStatus,
  refreshTableCounts,
  migrateAzureSqlSchema,
  isDbConnected,
  isTransientError,
  getSqlConfig,
};

export default db;
