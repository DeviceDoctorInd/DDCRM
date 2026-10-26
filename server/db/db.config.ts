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

/**
 * Standard Azure SQL Cloud Connection Pool Settings:
 * - max: 10 prevents exhausting Azure SQL tier worker threads
 * - min: 0 prevents stale connections when Azure SQL scales/drops idle TCP sockets
 * - idleTimeoutMillis: 30000 safely clears idle connections before Azure firewall drops them
 * - acquireTimeoutMillis: 30000 handles temporary Azure SQL serverless resume latency
 * - connectTimeout & requestTimeout: 30000ms ensures commands don't hang indefinitely
 */
export const SQL_POOL_CONFIG = {
  max: 10,
  min: 0,
  idleTimeoutMillis: 30000,
  acquireTimeoutMillis: 5000,
} as const;

export const SQL_OPTIONS_CONFIG = {
  encrypt: true,
  trustServerCertificate: false,
  connectTimeout: 5000,
  requestTimeout: 10000,
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

/**
 * Checks whether an error is transient and recoverable via retry
 */
export function isTransientError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err);
  const code = String(err.code || '');
  const number = Number(err.number || 0);

  // Common Azure SQL transient error codes:
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
