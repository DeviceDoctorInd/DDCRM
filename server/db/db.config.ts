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

// Configurable connection budget
export const getPoolMax = (): number => {
  const raw = process.env.AZURE_SQL_POOL_MAX;
  if (!raw) return 15;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) return 15;
  return Math.min(Math.max(parsed, 5), 25);
};

// Environment configuration helpers
export const getAuthType = () =>
  (process.env.AZURE_SQL_AUTHENTICATION || process.env.AZURE_SQL_AUTHENTICATION_TYPE || 'sql-server').toLowerCase();
export const getServer = () => process.env.AZURE_SQL_SERVER || 'ddrcm.database.windows.net';
export const getDatabase = () => process.env.AZURE_SQL_DATABASE || 'DDCRM';
export const getUser = () => process.env.AZURE_SQL_USER || 'CloudSA995f9e29';
export const getPassword = () => process.env.AZURE_SQL_PASSWORD || '';
export const getPort = () => parseInt(process.env.AZURE_SQL_PORT || '1433', 10);
export const getClientId = () => process.env.AZURE_CLIENT_ID || process.env.AZURE_SQL_CLIENT_ID || '';
export const getTenantId = () => process.env.AZURE_TENANT_ID || process.env.AZURE_SQL_TENANT_ID || '';

export interface EnvironmentValidationResult {
  isValid: boolean;
  authType: string;
  serverConfigured: boolean;
  databaseConfigured: boolean;
  userConfigured: boolean;
  passwordConfigured: boolean;
  missingVars: string[];
}

/**
 * Validate database environment configuration safely without exposing credentials
 */
export function validateDbEnvironment(): EnvironmentValidationResult {
  const authType = getAuthType();
  const server = getServer();
  const database = getDatabase();
  const user = getUser();
  const password = getPassword();
  const missingVars: string[] = [];

  if (!server) missingVars.push('AZURE_SQL_SERVER');
  if (!database) missingVars.push('AZURE_SQL_DATABASE');
  if (!user) missingVars.push('AZURE_SQL_USER');
  if (!password) missingVars.push('AZURE_SQL_PASSWORD');

  if (authType === 'azure-active-directory-password') {
    if (!getClientId()) missingVars.push('AZURE_CLIENT_ID / AZURE_SQL_CLIENT_ID');
    if (!getTenantId()) missingVars.push('AZURE_TENANT_ID / AZURE_SQL_TENANT_ID');
  }

  return {
    isValid: missingVars.length === 0,
    authType,
    serverConfigured: Boolean(server),
    databaseConfigured: Boolean(database),
    userConfigured: Boolean(user),
    passwordConfigured: Boolean(password),
    missingVars,
  };
}

/**
 * Standard Azure SQL Cloud Connection Pool Settings:
 * - max: 15 (configurable via AZURE_SQL_POOL_MAX [5-25]) prevents exhausting Azure SQL tier worker threads
 * - min: 0 prevents stale connections and allows Azure SQL Serverless auto-pause to engage cleanly
 * - idleTimeoutMillis: 30000 safely clears idle connections before Azure firewall drops them
 * - acquireTimeoutMillis: 30000 handles temporary Azure SQL serverless resume latency
 * - connectTimeout & requestTimeout: 30000ms ensures commands don't fail prematurely during cold start
 */
export const SQL_POOL_CONFIG = {
  get max(): number {
    return getPoolMax();
  },
  min: 0,
  idleTimeoutMillis: 30000,
  acquireTimeoutMillis: 30000,
} as const;

export const SQL_OPTIONS_CONFIG = {
  encrypt: true,
  trustServerCertificate: false,
  connectTimeout: 30000,
  requestTimeout: 30000,
  enableArithAbort: true,
  abortTransactionOnError: true,
} as const;

/**
 * Build optimized configuration object for mssql ConnectionPool
 */
export const getSqlConfig = (serverOverride?: string): sql.config => {
  const server = serverOverride || getServer();
  const database = getDatabase();
  const port = getPort();
  const user = getUser();
  const password = getPassword();
  const authType = getAuthType();

  const baseConfig: sql.config = {
    server,
    database,
    port,
    options: {
      ...SQL_OPTIONS_CONFIG,
    },
    pool: {
      ...SQL_POOL_CONFIG,
    },
  };

  if (authType === 'sql-server' || authType === 'sql' || authType === 'default') {
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

// --- Error Classification Types & Helpers ---

export class TransactionCommitAmbiguousError extends Error {
  code = 'TRANSACTION_COMMIT_AMBIGUOUS';
  constructor(message = 'Transaction commit outcome is ambiguous due to connection drop during commit.') {
    super(message);
    this.name = 'TransactionCommitAmbiguousError';
  }
}

export type DbErrorCategory =
  | 'POOL_ACQUISITION_TIMEOUT'
  | 'QUERY_TIMEOUT'
  | 'TRANSIENT_CONNECTION'
  | 'AUTH_FAILURE'
  | 'SYNTAX_ERROR'
  | 'CONSTRAINT_VIOLATION'
  | 'VALIDATION_ERROR'
  | 'TRANSACTION_COMMIT_AMBIGUOUS'
  | 'UNKNOWN_DATABASE_ERROR';

export interface ClassifiedDbError {
  category: DbErrorCategory;
  isTransient: boolean;
  isRetryable: boolean;
  httpStatus: number;
  userMessage: string;
  code?: string;
  originalMessage?: string;
}

/**
 * Strip sensitive credentials, passwords, usernames, and internal connection details from error strings
 */
export function sanitizeErrorMessage(msg: string): string {
  if (!msg) return '';
  return msg
    .replace(/(?:password|pwd|pass)\s*=\s*[^;,\s]+/gi, 'password=***')
    .replace(/(?:user id|uid|user)\s*=\s*[^;,\s]+/gi, 'user=***')
    .replace(/(?:server|data source)\s*=\s*[^;,\s]+/gi, 'server=***')
    .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/gi, '***@***')
    .replace(/database\.windows\.net/gi, '***')
    .replace(/DefaultEndpointsProtocol=[^;]+/gi, 'DefaultEndpointsProtocol=***')
    .replace(/AccountKey=[^;]+/gi, 'AccountKey=***');
}

/**
 * Checks whether an error is transient and recoverable via retry
 */
export function isTransientError(err: any): boolean {
  if (!err) return false;
  const anyErr = err as any;
  const msg = String(anyErr.message || anyErr);
  const code = String(anyErr.code || '');
  const number = Number(anyErr.number || 0);

  // 1. Transaction commit ambiguity is never transient or auto-retryable
  if (
    anyErr.name === 'TransactionCommitAmbiguousError' ||
    code === 'TRANSACTION_COMMIT_AMBIGUOUS' ||
    msg.includes('TRANSACTION_COMMIT_AMBIGUOUS')
  ) {
    return false;
  }

  // 2. Constraint violations are never transient
  if (
    number === 2627 ||
    number === 2601 ||
    number === 547 ||
    number === 515 ||
    msg.includes('PRIMARY KEY constraint') ||
    msg.includes('UNIQUE KEY constraint') ||
    msg.includes('FOREIGN KEY constraint') ||
    msg.includes('CHECK constraint') ||
    msg.includes('duplicate key')
  ) {
    return false;
  }

  // 3. Syntax errors are never transient
  if (
    number === 102 ||
    number === 156 ||
    number === 208 ||
    msg.includes('Incorrect syntax') ||
    msg.includes('Invalid object name')
  ) {
    return false;
  }

  // 4. Authentication errors are never transient
  if (
    number === 18456 ||
    number === 4060 ||
    code === 'ELOGIN' ||
    msg.includes('Login failed') ||
    msg.includes('Authentication failed')
  ) {
    return false;
  }

  // 5. Common Azure SQL transient error codes:
  // 40613: Database is paused / resuming
  // 40143: Connection could not be initialized
  // 40501: Service busy
  // 10928, 10929: Resource governance limit reached
  // 1205: Deadlock victim
  const transientNumbers = [40613, 40143, 40501, 10928, 10929, 1205];
  if (transientNumbers.includes(number)) return true;

  if (
    code === 'ECONNRESET' ||
    code === 'ETIMEOUT' ||
    code === 'ESOCKETTIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENOTFOUND' ||
    msg.includes('ResourceRequest timed out') ||
    msg.includes('Connection lost') ||
    msg.includes('Connection is closed') ||
    msg.includes('Failed to connect to') ||
    msg.includes('socket hang up') ||
    msg.includes('timeout')
  ) {
    return true;
  }
  return false;
}

/**
 * Classify database errors into structured operational categories
 */
export function classifyDbError(err: unknown): ClassifiedDbError {
  if (!err) {
    return {
      category: 'UNKNOWN_DATABASE_ERROR',
      isTransient: false,
      isRetryable: false,
      httpStatus: 500,
      userMessage: 'An unknown database error occurred.',
    };
  }

  const anyErr = err as any;
  const msg = String(anyErr.message || anyErr);
  const code = String(anyErr.code || '');
  const number = Number(anyErr.number || 0);

  // 1. Transaction Commit Ambiguity
  if (
    anyErr.name === 'TransactionCommitAmbiguousError' ||
    code === 'TRANSACTION_COMMIT_AMBIGUOUS' ||
    msg.includes('TRANSACTION_COMMIT_AMBIGUOUS')
  ) {
    return {
      category: 'TRANSACTION_COMMIT_AMBIGUOUS',
      isTransient: false,
      isRetryable: false,
      httpStatus: 500,
      userMessage: 'The transaction state is ambiguous due to connection termination during commit. Manual record verification required.',
      code: 'TRANSACTION_COMMIT_AMBIGUOUS',
      originalMessage: sanitizeErrorMessage(msg),
    };
  }

  // 2. Authentication Failure
  if (
    number === 18456 ||
    number === 4060 ||
    code === 'ELOGIN' ||
    msg.includes('Login failed') ||
    msg.includes('password verification failed') ||
    msg.includes('Authentication failed')
  ) {
    return {
      category: 'AUTH_FAILURE',
      isTransient: false,
      isRetryable: false,
      httpStatus: 503,
      userMessage: 'Database service authentication failed. Access is temporarily unavailable.',
      code: 'AUTH_FAILURE',
      originalMessage: 'Database service authentication failed.',
    };
  }

  // 3. Pool Acquisition Timeout
  if (
    anyErr.name === 'TimeoutError' ||
    msg.includes('ResourceRequest timed out') ||
    msg.includes('pool acquisition timeout') ||
    msg.includes('Connection acquisition timeout')
  ) {
    return {
      category: 'POOL_ACQUISITION_TIMEOUT',
      isTransient: true,
      isRetryable: true,
      httpStatus: 503,
      userMessage: 'Database connection pool is temporarily saturated. Please retry your request shortly.',
      code: 'POOL_SATURATION',
      originalMessage: sanitizeErrorMessage(msg),
    };
  }

  // 4. Constraint Violations
  if (
    number === 2627 ||
    number === 2601 ||
    number === 547 ||
    number === 515 ||
    msg.includes('PRIMARY KEY constraint') ||
    msg.includes('UNIQUE KEY constraint') ||
    msg.includes('FOREIGN KEY constraint') ||
    msg.includes('CHECK constraint') ||
    msg.includes('duplicate key')
  ) {
    return {
      category: 'CONSTRAINT_VIOLATION',
      isTransient: false,
      isRetryable: false,
      httpStatus: 409,
      userMessage: 'The requested operation violates database integrity constraints or duplicate record rules.',
      code: 'CONSTRAINT_VIOLATION',
      originalMessage: sanitizeErrorMessage(msg),
    };
  }

  // 5. Query Timeout
  if (
    code === 'ETIMEOUT' ||
    code === 'ESOCKETTIMEDOUT' ||
    msg.includes('operation timed out') ||
    msg.includes('Request failed to complete in') ||
    msg.includes('statement timeout')
  ) {
    return {
      category: 'QUERY_TIMEOUT',
      isTransient: true,
      isRetryable: true,
      httpStatus: 504,
      userMessage: 'Database query timed out while executing. Please retry shortly.',
      code: 'QUERY_TIMEOUT',
      originalMessage: sanitizeErrorMessage(msg),
    };
  }

  // 6. SQL Syntax / Query Error
  if (
    number === 102 ||
    number === 156 ||
    number === 208 ||
    msg.includes('Incorrect syntax') ||
    msg.includes('Invalid object name')
  ) {
    return {
      category: 'SYNTAX_ERROR',
      isTransient: false,
      isRetryable: false,
      httpStatus: 500,
      userMessage: 'A database query error occurred while processing the request.',
      code: 'SYNTAX_ERROR',
      originalMessage: sanitizeErrorMessage(msg),
    };
  }

  // 7. Transient Connection Failure
  if (isTransientError(err)) {
    return {
      category: 'TRANSIENT_CONNECTION',
      isTransient: true,
      isRetryable: true,
      httpStatus: 503,
      userMessage: 'Azure SQL database is temporarily unavailable or recovering. Please retry shortly.',
      code: 'TRANSIENT_CONNECTION',
      originalMessage: sanitizeErrorMessage(msg),
    };
  }

  return {
    category: 'UNKNOWN_DATABASE_ERROR',
    isTransient: false,
    isRetryable: false,
    httpStatus: 500,
    userMessage: 'An internal database error occurred.',
    originalMessage: sanitizeErrorMessage(msg),
  };
}

/**
 * Policy helper to safely gate in-memory mockStore fallback:
 * 1. Test Mode (NODE_ENV === 'test'): Always allowed so that automated test suites
 *    run cleanly against in-memory state without needing live Azure SQL.
 * 2. Production (NODE_ENV === 'production'): STRICTLY DISABLED. Even if an environment
 *    variable like ALLOW_MOCK_FALLBACK=true is accidentally set, production will NEVER
 *    fall back to mockStore.
 * 3. Development / Staging: Disabled by default. Enabled ONLY when explicitly opted-in
 *    with ALLOW_MOCK_FALLBACK='true' (e.g., for offline local coding).
 */
export function isMockFallbackAllowed(): boolean {
  if (process.env.NODE_ENV === 'test') {
    return true;
  }
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  return process.env.ALLOW_MOCK_FALLBACK === 'true';
}
