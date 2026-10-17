import sql from 'mssql';
import dotenv from 'dotenv';
import dns from 'dns';

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
let activeConnectedServer = getServer();

export const getSqlConfig = (serverOverride?: string): sql.config => {
  const server = serverOverride || activeConnectedServer || getServer();
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
      connectTimeout: 30000,
      requestTimeout: 30000,
    },
    pool: {
      max: 15,
      min: 2,
      idleTimeoutMillis: 300000,
      acquireTimeoutMillis: 30000,
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

// Schema Migrations to add missing columns across all tables and ensure seamless compatibility
export const COLUMN_MIGRATIONS = [
  // 1. clients
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

  // 2. service_categories
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'service_categories') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('service_categories') AND name = 'name') ALTER TABLE service_categories ADD name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'service_categories') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('service_categories') AND name = 'category_name') ALTER TABLE service_categories ADD category_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'service_categories') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('service_categories') AND name = 'description') ALTER TABLE service_categories ADD description NVARCHAR(MAX) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'service_categories') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('service_categories') AND name = 'status') ALTER TABLE service_categories ADD status NVARCHAR(50) DEFAULT 'Active';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'service_categories') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('service_categories') AND name = 'brand') ALTER TABLE service_categories ADD brand NVARCHAR(100) DEFAULT 'Device Doctor India';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'service_categories') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('service_categories') AND name = 'created_at') ALTER TABLE service_categories ADD created_at NVARCHAR(50);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'service_categories') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('service_categories') AND name = 'updated_at') ALTER TABLE service_categories ADD updated_at NVARCHAR(50);`,

  // 3. services
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'services') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('services') AND name = 'name') ALTER TABLE services ADD name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'services') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('services') AND name = 'service_name') ALTER TABLE services ADD service_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'services') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('services') AND name = 'category_id') ALTER TABLE services ADD category_id NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'services') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('services') AND name = 'description') ALTER TABLE services ADD description NVARCHAR(MAX) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'services') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('services') AND name = 'status') ALTER TABLE services ADD status NVARCHAR(50) DEFAULT 'Active';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'services') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('services') AND name = 'brand') ALTER TABLE services ADD brand NVARCHAR(100) DEFAULT 'Device Doctor India';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'services') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('services') AND name = 'created_at') ALTER TABLE services ADD created_at NVARCHAR(50);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'services') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('services') AND name = 'updated_at') ALTER TABLE services ADD updated_at NVARCHAR(50);`,

  // 4. projects
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'balance') ALTER TABLE projects ADD balance FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'client_id') ALTER TABLE projects ADD client_id NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'client_name') ALTER TABLE projects ADD client_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'service_id') ALTER TABLE projects ADD service_id NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'proposal_date') ALTER TABLE projects ADD proposal_date NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'contract_date') ALTER TABLE projects ADD contract_date NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'start_date') ALTER TABLE projects ADD start_date NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'committed_days') ALTER TABLE projects ADD committed_days INT DEFAULT 30;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'committed_end_date') ALTER TABLE projects ADD committed_end_date NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'actual_end_date') ALTER TABLE projects ADD actual_end_date NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'status') ALTER TABLE projects ADD status NVARCHAR(50) DEFAULT 'In Progress';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'payment_mode') ALTER TABLE projects ADD payment_mode NVARCHAR(50) DEFAULT 'GST Invoice';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'currency') ALTER TABLE projects ADD currency NVARCHAR(10) DEFAULT 'INR';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'contract') ALTER TABLE projects ADD contract FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'exchange_rate') ALTER TABLE projects ADD exchange_rate FLOAT DEFAULT 1;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'contract_value') ALTER TABLE projects ADD contract_value FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'total_received') ALTER TABLE projects ADD total_received FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'project_manager') ALTER TABLE projects ADD project_manager NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'notes') ALTER TABLE projects ADD notes NVARCHAR(MAX) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'proposal_document') ALTER TABLE projects ADD proposal_document NVARCHAR(MAX);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'contract_document') ALTER TABLE projects ADD contract_document NVARCHAR(MAX);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'payment_phases') ALTER TABLE projects ADD payment_phases NVARCHAR(MAX);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'brand') ALTER TABLE projects ADD brand NVARCHAR(100) DEFAULT 'Device Doctor India';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'created_at') ALTER TABLE projects ADD created_at NVARCHAR(50);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'projects') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'updated_at') ALTER TABLE projects ADD updated_at NVARCHAR(50);`,

  // 5. payments
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'days_overdue') ALTER TABLE payments ADD days_overdue INT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'project_id') ALTER TABLE payments ADD project_id NVARCHAR(150) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'client_id') ALTER TABLE payments ADD client_id NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'client_name') ALTER TABLE payments ADD client_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'payment_mode') ALTER TABLE payments ADD payment_mode NVARCHAR(50) DEFAULT 'GST Invoice';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'payment_date') ALTER TABLE payments ADD payment_date NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'due_date') ALTER TABLE payments ADD due_date NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'amount_received') ALTER TABLE payments ADD amount_received FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'currency') ALTER TABLE payments ADD currency NVARCHAR(10) DEFAULT 'INR';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'exchange_rate') ALTER TABLE payments ADD exchange_rate FLOAT DEFAULT 1;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'amount_inr') ALTER TABLE payments ADD amount_inr FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'reference_utr') ALTER TABLE payments ADD reference_utr NVARCHAR(100) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'payment_status') ALTER TABLE payments ADD payment_status NVARCHAR(50) DEFAULT 'Received';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'notes') ALTER TABLE payments ADD notes NVARCHAR(MAX) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'payment_proof') ALTER TABLE payments ADD payment_proof NVARCHAR(MAX);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'payment_proof_notes') ALTER TABLE payments ADD payment_proof_notes NVARCHAR(MAX);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'brand') ALTER TABLE payments ADD brand NVARCHAR(100) DEFAULT 'Device Doctor India';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'created_at') ALTER TABLE payments ADD created_at NVARCHAR(50);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'updated_at') ALTER TABLE payments ADD updated_at NVARCHAR(50);`,

  // 6. gst_invoices
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'gst_portal_upload_date') ALTER TABLE gst_invoices ADD gst_portal_upload_date NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'uploaded_to_gst_portal') ALTER TABLE gst_invoices ADD uploaded_to_gst_portal NVARCHAR(10) DEFAULT 'No';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'payment_id') ALTER TABLE gst_invoices ADD payment_id NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'project_id') ALTER TABLE gst_invoices ADD project_id NVARCHAR(150) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'client_id') ALTER TABLE gst_invoices ADD client_id NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'client_name') ALTER TABLE gst_invoices ADD client_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'payment_date') ALTER TABLE gst_invoices ADD payment_date NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'amount_received') ALTER TABLE gst_invoices ADD amount_received FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'currency') ALTER TABLE gst_invoices ADD currency NVARCHAR(10) DEFAULT 'INR';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'amount_inr') ALTER TABLE gst_invoices ADD amount_inr FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'gst_amount_inr') ALTER TABLE gst_invoices ADD gst_amount_inr FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'invoice_number') ALTER TABLE gst_invoices ADD invoice_number NVARCHAR(100) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'notes') ALTER TABLE gst_invoices ADD notes NVARCHAR(MAX) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'brand') ALTER TABLE gst_invoices ADD brand NVARCHAR(100) DEFAULT 'Device Doctor India';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'created_at') ALTER TABLE gst_invoices ADD created_at NVARCHAR(50);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'gst_invoices') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('gst_invoices') AND name = 'updated_at') ALTER TABLE gst_invoices ADD updated_at NVARCHAR(50);`,

  // 7. employee_roles
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_roles') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_roles') AND name = 'department') ALTER TABLE employee_roles ADD department NVARCHAR(255) DEFAULT 'Engineering';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_roles') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_roles') AND name = 'role_name') ALTER TABLE employee_roles ADD role_name NVARCHAR(255) DEFAULT 'Specialist';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_roles') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_roles') AND name = 'name') ALTER TABLE employee_roles ADD name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_roles') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_roles') AND name = 'status') ALTER TABLE employee_roles ADD status NVARCHAR(50) DEFAULT 'Active';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_roles') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_roles') AND name = 'description') ALTER TABLE employee_roles ADD description NVARCHAR(MAX) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_roles') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_roles') AND name = 'brand') ALTER TABLE employee_roles ADD brand NVARCHAR(100) DEFAULT 'Device Doctor India';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_roles') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_roles') AND name = 'created_at') ALTER TABLE employee_roles ADD created_at NVARCHAR(50);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_roles') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_roles') AND name = 'updated_at') ALTER TABLE employee_roles ADD updated_at NVARCHAR(50);`,

  // 8. employees
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employees') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'name') ALTER TABLE employees ADD name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employees') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'employee_name') ALTER TABLE employees ADD employee_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employees') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'role_id') ALTER TABLE employees ADD role_id NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employees') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'email') ALTER TABLE employees ADD email NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employees') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'status') ALTER TABLE employees ADD status NVARCHAR(50) DEFAULT 'Active';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employees') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'joining_date') ALTER TABLE employees ADD joining_date NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employees') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'cost_of_employee') ALTER TABLE employees ADD cost_of_employee FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employees') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'employee_type') ALTER TABLE employees ADD employee_type NVARCHAR(50) DEFAULT 'Salary Basis';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employees') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'comes_under_tds') ALTER TABLE employees ADD comes_under_tds NVARCHAR(10) DEFAULT 'No';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employees') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'notes') ALTER TABLE employees ADD notes NVARCHAR(MAX) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employees') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'brand') ALTER TABLE employees ADD brand NVARCHAR(100) DEFAULT 'Device Doctor India';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employees') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'created_at') ALTER TABLE employees ADD created_at NVARCHAR(50);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employees') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'updated_at') ALTER TABLE employees ADD updated_at NVARCHAR(50);`,

  // 9. assignments
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'work_assigned') ALTER TABLE assignments ADD work_assigned NVARCHAR(MAX) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'project_id') ALTER TABLE assignments ADD project_id NVARCHAR(150) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'client_id') ALTER TABLE assignments ADD client_id NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'client_name') ALTER TABLE assignments ADD client_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'employee_id') ALTER TABLE assignments ADD employee_id NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'employee_name') ALTER TABLE assignments ADD employee_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'role_name') ALTER TABLE assignments ADD role_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'assigned_date') ALTER TABLE assignments ADD assigned_date NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'amount') ALTER TABLE assignments ADD amount FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'amount_paid') ALTER TABLE assignments ADD amount_paid FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'payment_status') ALTER TABLE assignments ADD payment_status NVARCHAR(50) DEFAULT 'Pending';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'employee_notes') ALTER TABLE assignments ADD employee_notes NVARCHAR(MAX) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'last_note_update') ALTER TABLE assignments ADD last_note_update NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'brand') ALTER TABLE assignments ADD brand NVARCHAR(100) DEFAULT 'Device Doctor India';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'created_at') ALTER TABLE assignments ADD created_at NVARCHAR(50);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'assignments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('assignments') AND name = 'updated_at') ALTER TABLE assignments ADD updated_at NVARCHAR(50);`,

  // 10. employee_payments
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_payments') AND name = 'assignment_id') ALTER TABLE employee_payments ADD assignment_id NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_payments') AND name = 'project_id') ALTER TABLE employee_payments ADD project_id NVARCHAR(150) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_payments') AND name = 'employee_id') ALTER TABLE employee_payments ADD employee_id NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_payments') AND name = 'employee_name') ALTER TABLE employee_payments ADD employee_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_payments') AND name = 'payment_date') ALTER TABLE employee_payments ADD payment_date NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_payments') AND name = 'amount_paid') ALTER TABLE employee_payments ADD amount_paid FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_payments') AND name = 'payment_mode') ALTER TABLE employee_payments ADD payment_mode NVARCHAR(50) DEFAULT 'GST Invoice';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_payments') AND name = 'reference_utr') ALTER TABLE employee_payments ADD reference_utr NVARCHAR(100) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_payments') AND name = 'notes') ALTER TABLE employee_payments ADD notes NVARCHAR(MAX) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_payments') AND name = 'payment_proof') ALTER TABLE employee_payments ADD payment_proof NVARCHAR(MAX);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_payments') AND name = 'payment_proof_notes') ALTER TABLE employee_payments ADD payment_proof_notes NVARCHAR(MAX);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_payments') AND name = 'brand') ALTER TABLE employee_payments ADD brand NVARCHAR(100) DEFAULT 'Device Doctor India';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_payments') AND name = 'created_at') ALTER TABLE employee_payments ADD created_at NVARCHAR(50);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_payments') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_payments') AND name = 'updated_at') ALTER TABLE employee_payments ADD updated_at NVARCHAR(50);`,

  // 11. expense_categories
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'expense_categories') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('expense_categories') AND name = 'name') ALTER TABLE expense_categories ADD name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'expense_categories') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('expense_categories') AND name = 'category_name') ALTER TABLE expense_categories ADD category_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'expense_categories') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('expense_categories') AND name = 'description') ALTER TABLE expense_categories ADD description NVARCHAR(MAX) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'expense_categories') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('expense_categories') AND name = 'status') ALTER TABLE expense_categories ADD status NVARCHAR(50) DEFAULT 'Active';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'expense_categories') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('expense_categories') AND name = 'brand') ALTER TABLE expense_categories ADD brand NVARCHAR(100) DEFAULT 'Device Doctor India';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'expense_categories') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('expense_categories') AND name = 'created_at') ALTER TABLE expense_categories ADD created_at NVARCHAR(50);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'expense_categories') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('expense_categories') AND name = 'updated_at') ALTER TABLE expense_categories ADD updated_at NVARCHAR(50);`,

  // 12. other_expenses
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'project_id') ALTER TABLE other_expenses ADD project_id NVARCHAR(150) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'client_id') ALTER TABLE other_expenses ADD client_id NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'client_name') ALTER TABLE other_expenses ADD client_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'expense_category_id') ALTER TABLE other_expenses ADD expense_category_id NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'expense_category_name') ALTER TABLE other_expenses ADD expense_category_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'vendor') ALTER TABLE other_expenses ADD vendor NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'description') ALTER TABLE other_expenses ADD description NVARCHAR(MAX) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'amount') ALTER TABLE other_expenses ADD amount FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'currency') ALTER TABLE other_expenses ADD currency NVARCHAR(10) DEFAULT 'INR';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'exchange_rate') ALTER TABLE other_expenses ADD exchange_rate FLOAT DEFAULT 1;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'amount_inr') ALTER TABLE other_expenses ADD amount_inr FLOAT DEFAULT 0;`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'expense_date') ALTER TABLE other_expenses ADD expense_date NVARCHAR(50) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'payment_status') ALTER TABLE other_expenses ADD payment_status NVARCHAR(50) DEFAULT 'Paid';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'notes') ALTER TABLE other_expenses ADD notes NVARCHAR(MAX) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'brand') ALTER TABLE other_expenses ADD brand NVARCHAR(100) DEFAULT 'Device Doctor India';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'created_at') ALTER TABLE other_expenses ADD created_at NVARCHAR(50);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'other_expenses') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'updated_at') ALTER TABLE other_expenses ADD updated_at NVARCHAR(50);`,

  // 13. app_users
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'app_users') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app_users') AND name = 'name') ALTER TABLE app_users ADD name NVARCHAR(255) DEFAULT 'User';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'app_users') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app_users') AND name = 'username') ALTER TABLE app_users ADD username NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'app_users') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app_users') AND name = 'full_name') ALTER TABLE app_users ADD full_name NVARCHAR(255) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'app_users') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app_users') AND name = 'password_hash') ALTER TABLE app_users ADD password_hash NVARCHAR(255) DEFAULT 'Admin@2026';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'app_users') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app_users') AND name = 'role') ALTER TABLE app_users ADD role NVARCHAR(50) DEFAULT 'Super Admin';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'app_users') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app_users') AND name = 'brand') ALTER TABLE app_users ADD brand NVARCHAR(100) DEFAULT 'All';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'app_users') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app_users') AND name = 'status') ALTER TABLE app_users ADD status NVARCHAR(50) DEFAULT 'Active';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'app_users') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app_users') AND name = 'avatar') ALTER TABLE app_users ADD avatar NVARCHAR(500) DEFAULT '';`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'app_users') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app_users') AND name = 'created_at') ALTER TABLE app_users ADD created_at NVARCHAR(50);`,
  `IF EXISTS (SELECT * FROM sys.tables WHERE name = 'app_users') AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app_users') AND name = 'updated_at') ALTER TABLE app_users ADD updated_at NVARCHAR(50);`,

  // 14. Convert any uniqueidentifier foreign key / ID columns to NVARCHAR for universal compatibility
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'other_expenses' AND COLUMN_NAME = 'project_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE other_expenses ALTER COLUMN project_id NVARCHAR(150); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'other_expenses' AND COLUMN_NAME = 'client_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE other_expenses ALTER COLUMN client_id NVARCHAR(100); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'other_expenses' AND COLUMN_NAME = 'expense_category_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE other_expenses ALTER COLUMN expense_category_id NVARCHAR(100); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'payments' AND COLUMN_NAME = 'project_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE payments ALTER COLUMN project_id NVARCHAR(150); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'payments' AND COLUMN_NAME = 'client_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE payments ALTER COLUMN client_id NVARCHAR(100); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'gst_invoices' AND COLUMN_NAME = 'payment_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE gst_invoices ALTER COLUMN payment_id NVARCHAR(100); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'gst_invoices' AND COLUMN_NAME = 'project_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE gst_invoices ALTER COLUMN project_id NVARCHAR(150); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'gst_invoices' AND COLUMN_NAME = 'client_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE gst_invoices ALTER COLUMN client_id NVARCHAR(100); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'assignments' AND COLUMN_NAME = 'project_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE assignments ALTER COLUMN project_id NVARCHAR(150); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'assignments' AND COLUMN_NAME = 'client_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE assignments ALTER COLUMN client_id NVARCHAR(100); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'assignments' AND COLUMN_NAME = 'employee_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE assignments ALTER COLUMN employee_id NVARCHAR(100); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employee_payments' AND COLUMN_NAME = 'assignment_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE employee_payments ALTER COLUMN assignment_id NVARCHAR(100); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employee_payments' AND COLUMN_NAME = 'project_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE employee_payments ALTER COLUMN project_id NVARCHAR(150); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employee_payments' AND COLUMN_NAME = 'employee_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE employee_payments ALTER COLUMN employee_id NVARCHAR(100); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = 'role_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE employees ALTER COLUMN role_id NVARCHAR(100); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'services' AND COLUMN_NAME = 'category_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE services ALTER COLUMN category_id NVARCHAR(100); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'projects' AND COLUMN_NAME = 'client_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE projects ALTER COLUMN client_id NVARCHAR(100); END TRY BEGIN CATCH END CATCH;`,
  `IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'projects' AND COLUMN_NAME = 'service_id' AND DATA_TYPE = 'uniqueidentifier')
   BEGIN TRY ALTER TABLE projects ALTER COLUMN service_id NVARCHAR(100); END TRY BEGIN CATCH END CATCH;`,
];

// Data reconciliation statements to keep legacy and modern column names in sync
export const DATA_SYNC_STATEMENTS = [
  // Sync other_expenses category_id <-> expense_category_id
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'category_id')
   EXEC('UPDATE other_expenses SET expense_category_id = category_id WHERE (expense_category_id IS NULL OR expense_category_id = '''') AND category_id IS NOT NULL AND category_id <> '''';');`,
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('other_expenses') AND name = 'expense_category_id')
   EXEC('UPDATE other_expenses SET category_id = expense_category_id WHERE (category_id IS NULL OR category_id = '''') AND expense_category_id IS NOT NULL AND expense_category_id <> '''';');`,

  // Sync clients name <-> client_name
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'client_name')
   EXEC('UPDATE clients SET name = client_name WHERE (name IS NULL OR name = '''') AND client_name IS NOT NULL AND client_name <> '''';');`,
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('clients') AND name = 'name')
   EXEC('UPDATE clients SET client_name = name WHERE (client_name IS NULL OR client_name = '''') AND name IS NOT NULL AND name <> '''';');`,

  // Sync service_categories name <-> category_name
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('service_categories') AND name = 'category_name')
   EXEC('UPDATE service_categories SET name = category_name WHERE (name IS NULL OR name = '''') AND category_name IS NOT NULL AND category_name <> '''';');`,
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('service_categories') AND name = 'name')
   EXEC('UPDATE service_categories SET category_name = name WHERE (category_name IS NULL OR category_name = '''') AND name IS NOT NULL AND name <> '''';');`,

  // Sync services name <-> service_name
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('services') AND name = 'service_name')
   EXEC('UPDATE services SET name = service_name WHERE (name IS NULL OR name = '''') AND service_name IS NOT NULL AND service_name <> '''';');`,
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('services') AND name = 'name')
   EXEC('UPDATE services SET service_name = name WHERE (service_name IS NULL OR service_name = '''') AND name IS NOT NULL AND name <> '''';');`,

  // Sync expense_categories name <-> category_name
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('expense_categories') AND name = 'category_name')
   EXEC('UPDATE expense_categories SET name = category_name WHERE (name IS NULL OR name = '''') AND category_name IS NOT NULL AND category_name <> '''';');`,
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('expense_categories') AND name = 'name')
   EXEC('UPDATE expense_categories SET category_name = name WHERE (category_name IS NULL OR category_name = '''') AND name IS NOT NULL AND name <> '''';');`,

  // Sync employee_roles role_name <-> name
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_roles') AND name = 'name')
   EXEC('UPDATE employee_roles SET role_name = name WHERE (role_name IS NULL OR role_name = ''Specialist'' OR role_name = '''') AND name IS NOT NULL AND name <> '''';');`,
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_roles') AND name = 'role_name')
   EXEC('UPDATE employee_roles SET name = role_name WHERE (name IS NULL OR name = '''') AND role_name IS NOT NULL AND role_name <> '''';');`,

  // Sync employees name <-> employee_name
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'employee_name')
   EXEC('UPDATE employees SET name = employee_name WHERE (name IS NULL OR name = '''') AND employee_name IS NOT NULL AND employee_name <> '''';');`,
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'name')
   EXEC('UPDATE employees SET employee_name = name WHERE (employee_name IS NULL OR employee_name = '''') AND name IS NOT NULL AND name <> '''';');`,

  // Sync app_users name from full_name or username if empty
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app_users') AND name = 'full_name')
   EXEC('UPDATE app_users SET name = full_name WHERE (name IS NULL OR name = ''User'' OR name = '''') AND full_name IS NOT NULL AND full_name <> '''';');`,
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app_users') AND name = 'username')
   EXEC('UPDATE app_users SET name = username WHERE (name IS NULL OR name = ''User'' OR name = '''') AND username IS NOT NULL AND username <> '''';');`,

  // Calculate projects balance = contract_value - total_received if balance is 0 or null
  `IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'balance')
   BEGIN
     UPDATE projects 
     SET balance = ISNULL(contract_value, 0) - ISNULL(total_received, 0) 
     WHERE balance IS NULL OR balance = 0;
   END;`,
];

export async function migrateAzureSqlSchema(p?: sql.ConnectionPool): Promise<void> {
  const activePool = p || pool;
  if (!activePool) return;

  console.log('[Azure SQL Migration] Checking schema and verifying all columns exist...');

  // Execute column migration statements in parallel batches of 10 to speed up startup while respecting pool concurrency
  const CHUNK_SIZE = 10;
  for (let i = 0; i < COLUMN_MIGRATIONS.length; i += CHUNK_SIZE) {
    const chunk = COLUMN_MIGRATIONS.slice(i, i + CHUNK_SIZE);
    await Promise.allSettled(chunk.map(stmt => activePool.request().query(stmt)));
  }

  // Execute data reconciliation queries
  for (const syncStmt of DATA_SYNC_STATEMENTS) {
    try {
      await activePool.request().query(syncStmt);
    } catch {
      // Ignore individual sync errors
    }
  }

  // Backfill updated_at = created_at where updated_at is null
  const backfillTables = [
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
  ];

  for (const tbl of backfillTables) {
    try {
      await activePool.request().query(`
        IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('${tbl}') AND name = 'updated_at')
        BEGIN
          UPDATE ${tbl} 
          SET updated_at = ISNULL(created_at, CONVERT(NVARCHAR(50), GETUTCDATE(), 126)) 
          WHERE updated_at IS NULL OR updated_at = '';
        END
      `);
    } catch {
      // Ignore
    }
  }
  console.log('[Azure SQL Migration] Schema verification completed successfully.');
}

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

  try {
    // Proactively resolve DNS to prevent ENOTFOUND and avoid timeout delays
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
      : 'Microsoft Entra Password auth';
    console.log(`[Azure SQL] Connecting via ${authLabel} to ${targetServer} [DB: ${database}] as ${user}...`);

    try {
      pool = await new sql.ConnectionPool(config).connect();
    } catch (primaryErr: any) {
      const primaryErrors = primaryErr?.originalError?.errors || [];
      const primaryMsg = primaryErrors.map((e: any) => e.message || '').join(' ') + ' ' + (primaryErr?.message || '');

      if (primaryMsg.includes('ENOTFOUND') && targetServer !== 'ddrcm.database.windows.net') {
        console.log(`[Azure SQL] Hostname '${targetServer}' not found in DNS. Retrying with registered Azure host 'ddrcm.database.windows.net'...`);
        activeConnectedServer = 'ddrcm.database.windows.net';
        const fallbackConfig = getSqlConfig('ddrcm.database.windows.net');
        pool = await new sql.ConnectionPool(fallbackConfig).connect();
      } else {
        throw primaryErr;
      }
    }

    isConnected = true;
    lastError = null;
    console.log(`[Azure SQL] Successfully connected to live database ${database} on ${activeConnectedServer}!`);

    // Run table initialization
    for (const ddl of DDL_STATEMENTS) {
      await pool.request().query(ddl);
    }
    console.log(`[Azure SQL] Verified / initialized all 14 database tables schema.`);

    // Run schema migrations to add any missing columns (such as updated_at) to existing tables
    await migrateAzureSqlSchema(pool);

    // Ensure protected default admin users exist in app_users
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM app_users WHERE LOWER(email) = 'rathorehemant114@gmail.com')
        INSERT INTO app_users (id, auth_user_id, name, full_name, email, password_hash, role, brand, status)
        VALUES (NEWID(), NEWID(), 'Hemant Rathore', 'Hemant Rathore', 'rathorehemant114@gmail.com', 'Admin@2026', 'Super Admin', 'All', 'Active');
        
        IF NOT EXISTS (SELECT 1 FROM app_users WHERE LOWER(email) = 'devicedoctorindia.in@gmail.com')
        INSERT INTO app_users (id, auth_user_id, name, full_name, email, password_hash, role, brand, status)
        VALUES (NEWID(), NEWID(), 'Device Doctor India', 'Device Doctor India', 'devicedoctorindia.in@gmail.com', 'Admin@2026', 'Super Admin', 'All', 'Active');

        IF NOT EXISTS (SELECT 1 FROM app_users WHERE LOWER(email) = 'admin@codestro.com')
        INSERT INTO app_users (id, auth_user_id, name, full_name, email, password_hash, role, brand, status)
        VALUES (NEWID(), NEWID(), 'Codestro Admin', 'Codestro Admin', 'admin@codestro.com', 'Codestro@2026', 'Brand Admin', 'Codestro Solutions', 'Active');
        
        IF NOT EXISTS (SELECT 1 FROM app_users WHERE LOWER(email) = 'karthik.pm@devicedoctor.in')
        INSERT INTO app_users (id, auth_user_id, name, full_name, email, password_hash, role, brand, status)
        VALUES (NEWID(), NEWID(), 'Karthik PM', 'Karthik PM', 'karthik.pm@devicedoctor.in', 'Project@2026', 'Project Manager', 'All', 'Active');
        
        IF NOT EXISTS (SELECT 1 FROM app_users WHERE LOWER(email) = 'finance@devicedoctor.in')
        INSERT INTO app_users (id, auth_user_id, name, full_name, email, password_hash, role, brand, status)
        VALUES (NEWID(), NEWID(), 'Priya Sharma', 'Priya Sharma', 'finance@devicedoctor.in', 'Finance@2026', 'Accountant', 'All', 'Active');
        
        IF NOT EXISTS (SELECT 1 FROM app_users WHERE LOWER(email) = 'viewer@devicedoctor.in')
        INSERT INTO app_users (id, auth_user_id, name, full_name, email, password_hash, role, brand, status)
        VALUES (NEWID(), NEWID(), 'Executive Viewer', 'Executive Viewer', 'viewer@devicedoctor.in', 'Viewer@2026', 'Viewer', 'All', 'Active');
      `);
    } catch (userSeedErr) {
      console.warn('[Azure SQL] User verification notice:', userSeedErr);
    }

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
    pool = null;
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

export function getPool(): sql.ConnectionPool | null {
  return isConnected && pool ? pool : null;
}

export async function getOrInitPool(): Promise<sql.ConnectionPool | null> {
  if (isConnected && pool) {
    return pool;
  }
  await initAzureSql();
  return isConnected && pool ? pool : null;
}

