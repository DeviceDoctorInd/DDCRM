import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export interface AzureDbStatus {
  connected: boolean;
  server: string;
  database: string;
  authType: string;
  user: string;
  error: string | null;
  lastChecked: string;
  tableCounts: Record<string, number>;
}

const getAuthType = () => (process.env.AZURE_SQL_AUTHENTICATION || process.env.AZURE_SQL_AUTHENTICATION_TYPE || 'sql-server').toLowerCase();
const getServer = () => process.env.AZURE_SQL_SERVER || 'ddcrm.database.windows.net';
const getDatabase = () => process.env.AZURE_SQL_DATABASE || 'DDCRM';
const getUser = () => process.env.AZURE_SQL_USER || 'CloudSA995f9e29';
const getPassword = () => process.env.AZURE_SQL_PASSWORD || 'Hemant@1318';
const getPort = () => parseInt(process.env.AZURE_SQL_PORT || '1433', 10);
const getClientId = () => process.env.AZURE_CLIENT_ID || process.env.AZURE_SQL_CLIENT_ID || '';
const getTenantId = () => process.env.AZURE_TENANT_ID || process.env.AZURE_SQL_TENANT_ID || '';
const getEncrypt = () => process.env.AZURE_SQL_ENCRYPT === 'false' ? false : true;

let pool: sql.ConnectionPool | null = null;
let isConnecting = false;
let lastError: string | null = null;
let isConnected = false;
let tableCountsCache: Record<string, number> = {};

export const getSqlConfig = (): sql.config => {
  const server = getServer();
  const database = getDatabase();
  const port = getPort();
  const user = getUser();
  const password = getPassword();
  const authType = getAuthType();
  const encrypt = getEncrypt();

  const baseConfig: sql.config = {
    server,
    database,
    port,
    options: {
      encrypt, // Explicitly enabled (true) for Azure SQL
      trustServerCertificate: false,
      connectTimeout: 4000,
      requestTimeout: 15000,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  if (authType === 'sql-server' || authType === 'sql' || authType === 'default') {
    // Standard / Native SQL Server Authentication (User & Password)
    return {
      ...baseConfig,
      user,
      password,
    };
  }

  // Microsoft Entra (Azure AD) Password Authentication
  return {
    ...baseConfig,
    authentication: {
      type: 'azure-active-directory-password',
      options: {
        userName: user,
        password,
        clientId: getClientId(),
        tenantId: getTenantId(),
      },
    },
  };
};

// Azure SQL DDL to initialize all 14 core tables
const DDL_STATEMENTS = [
  // 1. clients
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='clients' AND xtype='U')
   CREATE TABLE clients (
     id NVARCHAR(50) PRIMARY KEY,
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

  // 2. service_categories
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

  // 3. services
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

  // 4. projects
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='projects' AND xtype='U')
   CREATE TABLE projects (
     id NVARCHAR(150) PRIMARY KEY,
     brand NVARCHAR(100) NOT NULL,
     client_id NVARCHAR(50),
     client_name NVARCHAR(255),
     service_id NVARCHAR(50),
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

  // 5. payments
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='payments' AND xtype='U')
   CREATE TABLE payments (
     id NVARCHAR(50) PRIMARY KEY,
     brand NVARCHAR(100) NOT NULL,
     project_id NVARCHAR(150),
     client_id NVARCHAR(50),
     client_name NVARCHAR(255),
     payment_mode NVARCHAR(50) DEFAULT 'GST Invoice',
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

  // 6. gst_invoices
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

  // 7. employee_roles
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

  // 8. employees
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='employees' AND xtype='U')
   CREATE TABLE employees (
     id NVARCHAR(50) PRIMARY KEY,
     brand NVARCHAR(100) NOT NULL,
     name NVARCHAR(255) NOT NULL,
     role_id NVARCHAR(50),
     email NVARCHAR(255) NOT NULL,
     status NVARCHAR(50) DEFAULT 'Active',
     joining_date NVARCHAR(50),
     cost_of_employee FLOAT DEFAULT 0,
     employee_type NVARCHAR(50) DEFAULT 'Salary Basis',
     comes_under_tds NVARCHAR(10) DEFAULT 'No',
     notes NVARCHAR(MAX),
     created_at NVARCHAR(50),
     updated_at NVARCHAR(50)
   )`,

  // 9. assignments
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

  // 10. employee_payments
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

  // 11. expense_categories
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

  // 12. other_expenses
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

  // 13. app_users (Authentication & RBAC: Super Admin, Brand Admin, Project Manager, Accountant, Viewer)
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

  // 14. crm_audit_log
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
];

export async function initAzureSql(): Promise<boolean> {
  if (pool && isConnected) {
    return true;
  }
  if (isConnecting) {
    return false;
  }
  const password = getPassword();
  const user = getUser();
  const server = getServer();
  const database = getDatabase();
  const authType = getAuthType();
  const encrypt = getEncrypt();

  if (!password) {
    lastError = 'AZURE_SQL_PASSWORD not configured. Set AZURE_SQL_PASSWORD in environment.';
    console.log(`[Azure SQL] ${lastError} (User: ${user}, Server: ${server}, Encrypt: ${encrypt})`);
    return false;
  }

  isConnecting = true;
  const config = getSqlConfig();

  try {
    const authLabel = (authType === 'sql-server' || authType === 'sql')
      ? 'SQL Server Native Auth'
      : 'Microsoft Entra Password auth';
    console.log(`[Azure SQL] Attempting ${authLabel} to ${server} [DB: ${database}] as ${user}...`);
    try {
      pool = await new sql.ConnectionPool(config).connect();
    } catch (primaryErr: any) {
      const primaryErrors = primaryErr?.originalError?.errors || [];
      const primaryMsg = primaryErrors.map((e: any) => e.message || '').join(' ') + ' ' + (primaryErr?.message || '');
      const userDomain = user.includes('@') ? user.split('@').pop() || '' : '';
      const currentTenantId = (config.authentication as any)?.options?.tenantId;

      if (primaryMsg.includes('ENOTFOUND') && config.server === 'ddcrm.database.windows.net') {
        console.log(`[Azure SQL] Hostname 'ddcrm.database.windows.net' not found in DNS. Retrying with registered Azure host 'ddrcm.database.windows.net'...`);
        const fallbackConfig: sql.config = { ...config, server: 'ddrcm.database.windows.net' };
        pool = await new sql.ConnectionPool(fallbackConfig).connect();
      } else if (primaryMsg.includes('AADSTS90002') && userDomain && currentTenantId !== userDomain) {
        console.log(`[Azure SQL] Tenant ID '${currentTenantId}' not found. Retrying with domain '${userDomain}'...`);
        const fallbackConfig: sql.config = {
          ...config,
          authentication: {
            type: 'azure-active-directory-password',
            options: {
              userName: user,
              password: password,
              clientId: getClientId(),
              tenantId: userDomain,
            },
          },
        };
        pool = await new sql.ConnectionPool(fallbackConfig).connect();
      } else {
        throw primaryErr;
      }
    }
    isConnected = true;
    lastError = null;
    console.log(`[Azure SQL] Successfully connected to live database ${database} on ${server}!`);

    // Run table initialization
    for (const ddl of DDL_STATEMENTS) {
      await pool.request().query(ddl);
    }
    console.log(`[Azure SQL] Verified / initialized all 14 database tables schema.`);

    // Refresh table counts
    await refreshTableCounts();
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
      errorMsg = err.message || err.name;
    } else {
      errorMsg = String(err);
    }
    lastError = errorMsg;
    isConnected = false;
    console.warn(`[Azure SQL] Notice: Live Azure connection pending credentials / firewall access (${errorMsg}).`);
    return false;
  } finally {
    isConnecting = false;
  }
}

export async function refreshTableCounts(): Promise<Record<string, number>> {
  if (!pool || !isConnected) return tableCountsCache;

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
  ];

  const counts: Record<string, number> = {};
  for (const table of tables) {
    try {
      const res = await pool.request().query(`SELECT COUNT(*) as count FROM ${table}`);
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
    server: getServer(),
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

export function getPool(): sql.ConnectionPool | null {
  return pool;
}
