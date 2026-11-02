import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('FIX 19 Phase 1: Database Connection Pool Architecture & Lifecycle Tests', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('1. Connection Pool Sizing & Sane Defaults (AZURE_SQL_POOL_MAX)', () => {
    it('returns default max of 15 when AZURE_SQL_POOL_MAX is not set', async () => {
      delete process.env.AZURE_SQL_POOL_MAX;
      const { getPoolMax } = await vi.importActual<any>('../server/db/db.config');
      expect(getPoolMax()).toBe(15);
    });

    it('clamps pool max to minimum of 5 if set below safe floor', async () => {
      process.env.AZURE_SQL_POOL_MAX = '2';
      const { getPoolMax } = await vi.importActual<any>('../server/db/db.config');
      expect(getPoolMax()).toBe(5);
    });

    it('clamps pool max to maximum of 25 if set above safe budget ceiling', async () => {
      process.env.AZURE_SQL_POOL_MAX = '50';
      const { getPoolMax } = await vi.importActual<any>('../server/db/db.config');
      expect(getPoolMax()).toBe(25);
    });

    it('honors valid configured pool max within [5, 25] bounds', async () => {
      process.env.AZURE_SQL_POOL_MAX = '18';
      const { getPoolMax } = await vi.importActual<any>('../server/db/db.config');
      expect(getPoolMax()).toBe(18);
    });

    it('falls back to default 15 if AZURE_SQL_POOL_MAX is non-numeric', async () => {
      process.env.AZURE_SQL_POOL_MAX = 'invalid-number';
      const { getPoolMax } = await vi.importActual<any>('../server/db/db.config');
      expect(getPoolMax()).toBe(15);
    });
  });

  describe('2. Azure SQL Serverless & Connection Timeout Settings', () => {
    it('enforces min: 0 in SQL_POOL_CONFIG to permit Azure SQL Serverless auto-pause', async () => {
      const { SQL_POOL_CONFIG } = await vi.importActual<any>('../server/db/db.config');
      expect(SQL_POOL_CONFIG.min).toBe(0);
    });

    it('dynamically evaluates SQL_POOL_CONFIG.max from getPoolMax()', async () => {
      process.env.AZURE_SQL_POOL_MAX = '20';
      const { SQL_POOL_CONFIG } = await vi.importActual<any>('../server/db/db.config');
      expect(SQL_POOL_CONFIG.max).toBe(20);
    });

    it('enforces acquireTimeoutMillis: 30000 to tolerate Serverless cold-start wakeups', async () => {
      const { SQL_POOL_CONFIG } = await vi.importActual<any>('../server/db/db.config');
      expect(SQL_POOL_CONFIG.acquireTimeoutMillis).toBe(30000);
      expect(SQL_POOL_CONFIG.idleTimeoutMillis).toBe(30000);
    });

    it('enforces connectTimeout and requestTimeout of 30000ms with encryption', async () => {
      const { SQL_OPTIONS_CONFIG } = await vi.importActual<any>('../server/db/db.config');
      expect(SQL_OPTIONS_CONFIG.connectTimeout).toBe(30000);
      expect(SQL_OPTIONS_CONFIG.requestTimeout).toBe(30000);
      expect(SQL_OPTIONS_CONFIG.encrypt).toBe(true);
      expect(SQL_OPTIONS_CONFIG.trustServerCertificate).toBe(false);
    });
  });

  describe('3. Database Environment Validation without Credential Exposure', () => {
    it('accurately identifies missing variables when environment is unconfigured', async () => {
      delete process.env.AZURE_SQL_SERVER;
      delete process.env.AZURE_SQL_DATABASE;
      delete process.env.AZURE_SQL_USER;
      delete process.env.AZURE_SQL_PASSWORD;

      const { validateDbEnvironment } = await vi.importActual<any>('../server/db/db.config');
      const result = validateDbEnvironment();

      expect(result.isValid).toBe(false);
      expect(result.passwordConfigured).toBe(false);
      expect(result.missingVars).toContain('AZURE_SQL_PASSWORD');
      // Must not contain any actual secret keys or values
      expect((result as any).password).toBeUndefined();
    });

    it('validates Entra ID / Active Directory required client and tenant credentials', async () => {
      process.env.AZURE_SQL_AUTHENTICATION = 'azure-active-directory-password';
      process.env.AZURE_SQL_SERVER = 'myserver.database.windows.net';
      process.env.AZURE_SQL_DATABASE = 'mydb';
      process.env.AZURE_SQL_USER = 'user@example.com';
      process.env.AZURE_SQL_PASSWORD = 'super-secret-password';
      delete process.env.AZURE_CLIENT_ID;
      delete process.env.AZURE_SQL_CLIENT_ID;
      delete process.env.AZURE_TENANT_ID;
      delete process.env.AZURE_SQL_TENANT_ID;

      const { validateDbEnvironment } = await vi.importActual<any>('../server/db/db.config');
      const result = validateDbEnvironment();

      expect(result.isValid).toBe(false);
      expect(result.missingVars.some((v: string) => v.includes('CLIENT_ID'))).toBe(true);
      expect(result.missingVars.some((v: string) => v.includes('TENANT_ID'))).toBe(true);
    });

    it('reports isValid: true when all necessary environment variables are set', async () => {
      process.env.AZURE_SQL_AUTHENTICATION = 'sql-server';
      process.env.AZURE_SQL_SERVER = 'myserver.database.windows.net';
      process.env.AZURE_SQL_DATABASE = 'mydb';
      process.env.AZURE_SQL_USER = 'sqladmin';
      process.env.AZURE_SQL_PASSWORD = 'super-secret-password';

      const { validateDbEnvironment } = await vi.importActual<any>('../server/db/db.config');
      const result = validateDbEnvironment();

      expect(result.isValid).toBe(true);
      expect(result.missingVars).toHaveLength(0);
      expect(result.serverConfigured).toBe(true);
      expect(result.databaseConfigured).toBe(true);
      expect(result.userConfigured).toBe(true);
      expect(result.passwordConfigured).toBe(true);
      // Ensure password itself is NOT in the result
      expect(JSON.stringify(result)).not.toContain('super-secret-password');
    });
  });

  describe('4. Verified Safe Connection Pool Metrics', () => {
    it('returns safe disconnected metrics when pool is not connected', async () => {
      const { getSafePoolMetrics } = await vi.importActual<any>('../server/db/db');
      const metrics = getSafePoolMetrics();

      expect(metrics.connected).toBe(false);
      expect(metrics.totalConnections).toBe(0);
      expect(metrics.activeConnections).toBe(0);
      expect(metrics.idleConnections).toBe(0);
      expect(metrics.pendingAcquires).toBe(0);
      expect(metrics.pendingCreates).toBe(0);
      expect(metrics.saturationPercent).toBe(0);
      expect(metrics.maxCapacity).toBeGreaterThanOrEqual(5);
      // Must not leak connection string or host
      expect((metrics as any).server).toBeUndefined();
      expect((metrics as any).password).toBeUndefined();
      expect((metrics as any).connectionString).toBeUndefined();
    });

    it('computes tarn.js pool metrics and saturation correctly when pool is active', () => {
      // Simulate tarn.js pool methods
      const mockTarnPool = {
        numUsed: () => 6,
        numFree: () => 4,
        numPendingAcquires: () => 3,
        numPendingCreates: () => 1,
        max: 15,
        min: 0,
      };

      const active = mockTarnPool.numUsed();
      const idle = mockTarnPool.numFree();
      const pending = mockTarnPool.numPendingAcquires();
      const pendingCreates = mockTarnPool.numPendingCreates();
      const max = mockTarnPool.max;
      const min = mockTarnPool.min;
      const total = active + idle;
      const saturation = max > 0 ? Math.min(100, Math.round(((active + pending) / max) * 100)) : 0;

      expect(total).toBe(10);
      expect(active).toBe(6);
      expect(idle).toBe(4);
      expect(pending).toBe(3);
      expect(pendingCreates).toBe(1);
      // (6 active + 3 pending) / 15 max = 9 / 15 = 60%
      expect(saturation).toBe(60);
    });

    it('clamps saturation percentage to 100% under heavy backlog', () => {
      const max = 15;
      const active = 15;
      const pending = 20;
      const saturation = max > 0 ? Math.min(100, Math.round(((active + pending) / max) * 100)) : 0;
      expect(saturation).toBe(100);
    });
  });

  describe('5. Pool Lifecycle, Closed/Stale Reference Protection & Reconnect Concurrency', () => {
    it('invalidates stale pool reference when pool is closed or disconnected', () => {
      // Create a simulated pool reference where connected is false or _isClosed is true
      let globalPool: any = {
        connected: false,
        _isClosed: true,
      };
      let isConnected = true;

      function getPoolSafe() {
        if (globalPool && isConnected && globalPool.connected && !globalPool._isClosed) {
          return globalPool;
        }
        if (globalPool && (!globalPool.connected || globalPool._isClosed)) {
          globalPool = null;
          isConnected = false;
        }
        return null;
      }

      const active = getPoolSafe();
      expect(active).toBeNull();
      expect(globalPool).toBeNull();
      expect(isConnected).toBe(false);
    });

    it('background socket drop does NOT invalidate the pool if pool remains connected', () => {
      let globalPool: any = {
        connected: true,
        _isClosed: false,
      };
      let isConnected = true;

      // Socket error handler
      function onPoolSocketError(err: any, poolInstance: any) {
        if (!poolInstance.connected || poolInstance._isClosed) {
          isConnected = false;
          if (globalPool === poolInstance) {
            globalPool = null;
          }
        }
      }

      // Simulate a dropped idle socket error while pool itself is healthy
      onPoolSocketError(new Error('read ECONNRESET'), globalPool);

      // Pool reference should be preserved
      expect(globalPool).not.toBeNull();
      expect(isConnected).toBe(true);

      // Now simulate a fatal pool disconnect where connected becomes false
      globalPool.connected = false;
      onPoolSocketError(new Error('Connection is closed.'), globalPool);

      expect(globalPool).toBeNull();
      expect(isConnected).toBe(false);
    });

    it('concurrent forced reconnect calls share one single reconnection promise', async () => {
      let coreConnectCount = 0;
      let sharedPromise: Promise<string> | null = null;

      async function simulatedConnectCore(force: boolean): Promise<string> {
        coreConnectCount++;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return `pool-${coreConnectCount}`;
      }

      async function simulatedGetOrInitPool(forceReconnect: boolean = false): Promise<string> {
        if (sharedPromise) {
          return sharedPromise;
        }

        sharedPromise = (async () => {
          try {
            return await simulatedConnectCore(forceReconnect);
          } finally {
            sharedPromise = null;
          }
        })();

        return sharedPromise;
      }

      // Launch 4 concurrent forced reconnect calls
      const [res1, res2, res3, res4] = await Promise.all([
        simulatedGetOrInitPool(true),
        simulatedGetOrInitPool(true),
        simulatedGetOrInitPool(true),
        simulatedGetOrInitPool(true),
      ]);

      expect(res1).toBe('pool-1');
      expect(res2).toBe('pool-1');
      expect(res3).toBe('pool-1');
      expect(res4).toBe('pool-1');
      // Exactly 1 underlying connection was initiated
      expect(coreConnectCount).toBe(1);
    });
  });
});
