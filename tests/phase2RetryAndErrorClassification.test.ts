import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  classifyDbError,
  sanitizeErrorMessage,
  isTransientError,
  TransactionCommitAmbiguousError,
} from '../server/db/db.config';
import {
  executeSqlWithAutoMigration,
  sendDatabaseError,
  sendDatabaseUnavailable,
} from '../server/routes/api';
import * as azureSqlModule from '../server/db/azureSql';

describe('FIX 19 Phase 2: API Query Reliability, Bounded Retries & Standardized Database Error Classification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Error Sanitization (Zero Credential Leakage)', () => {
    it('redacts passwords and credentials from error strings', () => {
      const sensitiveMsg = 'Error connecting: Server=tcp:ddcrm.database.windows.net,1433;User ID=ddcrm_admin;Password=SuperSecretPass123!;';
      const sanitized = sanitizeErrorMessage(sensitiveMsg);

      expect(sanitized).not.toContain('SuperSecretPass123!');
      expect(sanitized).not.toContain('ddcrm_admin');
      expect(sanitized).not.toContain('database.windows.net');
      expect(sanitized).toContain('password=***');
      expect(sanitized).toContain('user=***');
    });

    it('redacts storage account keys and connection strings', () => {
      const storageMsg = 'BlobStorageError: DefaultEndpointsProtocol=https;AccountName=ddcrmstorage;AccountKey=ab12cd34ef56gh78==;';
      const sanitized = sanitizeErrorMessage(storageMsg);

      expect(sanitized).not.toContain('ab12cd34ef56gh78==');
      expect(sanitized).toContain('DefaultEndpointsProtocol=***');
      expect(sanitized).toContain('AccountKey=***');
    });

    it('redacts email addresses from error messages', () => {
      const emailMsg = 'Failed to notify admin user at contact@devicedoctor.in regarding SQL failover';
      const sanitized = sanitizeErrorMessage(emailMsg);

      expect(sanitized).not.toContain('contact@devicedoctor.in');
      expect(sanitized).toContain('***@***');
    });

    it('preserves non-sensitive operational information', () => {
      const normalMsg = 'Violation of PRIMARY KEY constraint PK_payments. Cannot insert duplicate key in object dbo.payments.';
      const sanitized = sanitizeErrorMessage(normalMsg);

      expect(sanitized).toContain('Violation of PRIMARY KEY constraint');
      expect(sanitized).toContain('dbo.payments');
    });
  });

  describe('2. Error Classification Mapping & Operational Categorization', () => {
    it('classifies pool acquisition timeouts as POOL_ACQUISITION_TIMEOUT (HTTP 503, retryable)', () => {
      const err = new Error('ResourceRequest timed out');
      const classification = classifyDbError(err);

      expect(classification.category).toBe('POOL_ACQUISITION_TIMEOUT');
      expect(classification.httpStatus).toBe(503);
      expect(classification.isTransient).toBe(true);
      expect(classification.isRetryable).toBe(true);
    });

    it('classifies query execution timeouts as QUERY_TIMEOUT (HTTP 504, retryable)', () => {
      const err = Object.assign(new Error('Request failed to complete in 30000ms'), { code: 'ETIMEOUT' });
      const classification = classifyDbError(err);

      expect(classification.category).toBe('QUERY_TIMEOUT');
      expect(classification.httpStatus).toBe(504);
      expect(classification.isTransient).toBe(true);
      expect(classification.isRetryable).toBe(true);
    });

    it('classifies transient socket drops as TRANSIENT_CONNECTION (HTTP 503, retryable)', () => {
      const err = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
      const classification = classifyDbError(err);

      expect(classification.category).toBe('TRANSIENT_CONNECTION');
      expect(classification.httpStatus).toBe(503);
      expect(classification.isTransient).toBe(true);
      expect(classification.isRetryable).toBe(true);
    });

    it('classifies Azure SQL database resuming error 40613 as TRANSIENT_CONNECTION (HTTP 503, retryable)', () => {
      const err = Object.assign(new Error('Database ddcrm on server is not currently available.'), { number: 40613 });
      const classification = classifyDbError(err);

      expect(classification.category).toBe('TRANSIENT_CONNECTION');
      expect(classification.httpStatus).toBe(503);
      expect(classification.isTransient).toBe(true);
      expect(classification.isRetryable).toBe(true);
    });

    it('classifies deadlock victim error 1205 as TRANSIENT_CONNECTION (HTTP 503, retryable)', () => {
      const err = Object.assign(new Error('Transaction (Process ID 54) was deadlocked on lock resources with another process.'), { number: 1205 });
      const classification = classifyDbError(err);

      expect(classification.category).toBe('TRANSIENT_CONNECTION');
      expect(classification.httpStatus).toBe(503);
      expect(classification.isTransient).toBe(true);
      expect(classification.isRetryable).toBe(true);
    });

    it('classifies authentication failures as AUTH_FAILURE (HTTP 503, non-retryable)', () => {
      const err = Object.assign(new Error('Login failed for user ddcrm_user.'), { number: 18456, code: 'ELOGIN' });
      const classification = classifyDbError(err);

      expect(classification.category).toBe('AUTH_FAILURE');
      expect(classification.httpStatus).toBe(503);
      expect(classification.isTransient).toBe(false);
      expect(classification.isRetryable).toBe(false);
    });

    it('classifies constraint violations as CONSTRAINT_VIOLATION (HTTP 409, non-retryable)', () => {
      const duplicateKeyErr = Object.assign(new Error('Cannot insert duplicate key in object payments with unique index UQ_reference_utr.'), { number: 2627 });
      const classification = classifyDbError(duplicateKeyErr);

      expect(classification.category).toBe('CONSTRAINT_VIOLATION');
      expect(classification.httpStatus).toBe(409);
      expect(classification.isTransient).toBe(false);
      expect(classification.isRetryable).toBe(false);
    });

    it('classifies foreign key violations as CONSTRAINT_VIOLATION (HTTP 409, non-retryable)', () => {
      const fkErr = Object.assign(new Error('The DELETE statement conflicted with the REFERENCE constraint FK_projects_clients.'), { number: 547 });
      const classification = classifyDbError(fkErr);

      expect(classification.category).toBe('CONSTRAINT_VIOLATION');
      expect(classification.httpStatus).toBe(409);
      expect(classification.isTransient).toBe(false);
      expect(classification.isRetryable).toBe(false);
    });

    it('classifies SQL syntax errors as SYNTAX_ERROR (HTTP 500, non-retryable)', () => {
      const syntaxErr = Object.assign(new Error("Incorrect syntax near 'SELCT'."), { number: 102 });
      const classification = classifyDbError(syntaxErr);

      expect(classification.category).toBe('SYNTAX_ERROR');
      expect(classification.httpStatus).toBe(500);
      expect(classification.isTransient).toBe(false);
      expect(classification.isRetryable).toBe(false);
    });

    it('classifies TransactionCommitAmbiguousError as TRANSACTION_COMMIT_AMBIGUOUS (HTTP 500, non-retryable)', () => {
      const ambiguousErr = new TransactionCommitAmbiguousError('Connection severed while executing COMMIT TRANSACTION.');
      const classification = classifyDbError(ambiguousErr);

      expect(classification.category).toBe('TRANSACTION_COMMIT_AMBIGUOUS');
      expect(classification.httpStatus).toBe(500);
      expect(classification.isTransient).toBe(false);
      expect(classification.isRetryable).toBe(false);
    });
  });

  describe('3. isTransientError Guard Rails', () => {
    it('returns false for constraint violations', () => {
      expect(isTransientError({ number: 2627, message: 'duplicate key' })).toBe(false);
      expect(isTransientError({ number: 2601, message: 'unique index' })).toBe(false);
      expect(isTransientError({ number: 547, message: 'FOREIGN KEY constraint' })).toBe(false);
      expect(isTransientError({ number: 515, message: 'Cannot insert NULL' })).toBe(false);
    });

    it('returns false for syntax and schema errors', () => {
      expect(isTransientError({ number: 102, message: 'Incorrect syntax' })).toBe(false);
      expect(isTransientError({ number: 208, message: 'Invalid object name' })).toBe(false);
    });

    it('returns false for authentication failures', () => {
      expect(isTransientError({ number: 18456, message: 'Login failed' })).toBe(false);
      expect(isTransientError({ code: 'ELOGIN', message: 'Authentication failed' })).toBe(false);
    });

    it('returns false for transaction commit ambiguity', () => {
      expect(isTransientError(new TransactionCommitAmbiguousError())).toBe(false);
      expect(isTransientError({ code: 'TRANSACTION_COMMIT_AMBIGUOUS', message: 'ambiguous commit' })).toBe(false);
    });

    it('returns true for genuine network/transient conditions', () => {
      expect(isTransientError({ code: 'ECONNRESET' })).toBe(true);
      expect(isTransientError({ number: 40613 })).toBe(true);
      expect(isTransientError({ number: 1205 })).toBe(true);
      expect(isTransientError({ message: 'ResourceRequest timed out' })).toBe(true);
      expect(isTransientError({ message: 'Connection is closed' })).toBe(true);
    });
  });

  describe('4. executeSqlWithAutoMigration Bounded Retry & Active Pool Propagation', () => {
    it('passes the currently active pool to queryFn on first attempt', async () => {
      const mockPool: any = { connected: true, id: 'pool-initial' };
      const queryFn = vi.fn().mockResolvedValue({ recordset: [{ id: 'TEST-001' }] });

      const result = await executeSqlWithAutoMigration(mockPool, queryFn);

      expect(queryFn).toHaveBeenCalledTimes(1);
      expect(queryFn).toHaveBeenCalledWith(mockPool);
      expect(result).toEqual({ recordset: [{ id: 'TEST-001' }] });
    });

    it('re-acquires pool and passes fresh pool into queryFn on retry of eligible transient error', async () => {
      const initialDeadPool: any = { connected: false, id: 'pool-dead' };
      const freshActivePool: any = { connected: true, id: 'pool-fresh' };

      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(freshActivePool);

      let callCount = 0;
      const queryFn = vi.fn().mockImplementation(async (activePool: any) => {
        callCount++;
        if (callCount === 1) {
          expect(activePool.id).toBe('pool-dead');
          const transientErr = Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' });
          throw transientErr;
        }
        expect(activePool.id).toBe('pool-fresh');
        return { success: true, count: 42 };
      });

      const result = await executeSqlWithAutoMigration(initialDeadPool, queryFn, { isReadOnly: true, maxRetries: 2 });

      expect(callCount).toBe(2);
      expect(result).toEqual({ success: true, count: 42 });
      expect(azureSqlModule.getOrInitPool).toHaveBeenCalledWith(true);
    });

    it('stops at bounded maxRetries and throws if transient error persists', async () => {
      const deadPool: any = { connected: false, id: 'pool-dead' };
      const freshPool: any = { connected: true, id: 'pool-fresh' };

      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(freshPool);

      const transientErr = Object.assign(new Error('ResourceRequest timed out'), { code: 'ETIMEOUT' });
      const queryFn = vi.fn().mockRejectedValue(transientErr);

      await expect(
        executeSqlWithAutoMigration(deadPool, queryFn, { isReadOnly: true, maxRetries: 2 })
      ).rejects.toThrow('ResourceRequest timed out');

      // 1 initial attempt + 2 retries = 3 attempts total
      expect(queryFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('5. Strict Financial Safety (Zero Automatic Retries for Financial Writes)', () => {
    it('NEVER retries transient errors when isFinancialMutation is true', async () => {
      const pool: any = { connected: true, id: 'pool-live' };
      const getOrInitSpy = vi.spyOn(azureSqlModule, 'getOrInitPool');

      const transientErr = Object.assign(new Error('Connection lost during write'), { code: 'ECONNRESET' });
      const queryFn = vi.fn().mockRejectedValue(transientErr);

      await expect(
        executeSqlWithAutoMigration(pool, queryFn, {
          tableName: 'payments',
          isFinancialMutation: true,
          maxRetries: 5, // Even if maxRetries is requested, isFinancialMutation must force 0 retries
        })
      ).rejects.toThrow('Connection lost during write');

      // Strict requirement: Exactly 1 invocation, zero retries
      expect(queryFn).toHaveBeenCalledTimes(1);
      // getOrInitPool must not be invoked for financial retry
      expect(getOrInitSpy).not.toHaveBeenCalled();
    });

    it('NEVER retries employee payments mutation when isFinancialMutation is true', async () => {
      const pool: any = { connected: true };
      const transientErr = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      const queryFn = vi.fn().mockRejectedValue(transientErr);

      await expect(
        executeSqlWithAutoMigration(pool, queryFn, {
          tableName: 'employee_payments',
          isFinancialMutation: true,
        })
      ).rejects.toThrow('socket hang up');

      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it('NEVER retries expense mutations when isFinancialMutation is true', async () => {
      const pool: any = { connected: true };
      const transientErr = Object.assign(new Error('Database is busy'), { number: 40501 });
      const queryFn = vi.fn().mockRejectedValue(transientErr);

      await expect(
        executeSqlWithAutoMigration(pool, queryFn, {
          tableName: 'other_expenses',
          isFinancialMutation: true,
        })
      ).rejects.toThrow('Database is busy');

      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it('NEVER retries GST invoice mutations when isFinancialMutation is true', async () => {
      const pool: any = { connected: true };
      const transientErr = Object.assign(new Error('Connection reset by peer'), { code: 'ECONNRESET' });
      const queryFn = vi.fn().mockRejectedValue(transientErr);

      await expect(
        executeSqlWithAutoMigration(pool, queryFn, {
          tableName: 'gst_invoices',
          isFinancialMutation: true,
        })
      ).rejects.toThrow('Connection reset by peer');

      expect(queryFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('6. sendDatabaseError HTTP Status & Category Isolation', () => {
    function createMockResponse() {
      const res: any = {};
      res.statusCode = 200;
      res.body = null;
      res.status = vi.fn().mockImplementation((code: number) => {
        res.statusCode = code;
        return res;
      });
      res.json = vi.fn().mockImplementation((data: any) => {
        res.body = data;
        return res;
      });
      return res;
    }

    it('returns HTTP 409 for constraint violations instead of generic 503', () => {
      const res = createMockResponse();
      const err = Object.assign(new Error('Violation of UNIQUE KEY constraint UQ_payments_utr.'), { number: 2627 });

      sendDatabaseError(res, err, 'save payment');

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Database Constraint Violation');
      expect(res.body.category).toBe('CONSTRAINT_VIOLATION');
      expect(res.body.message).toContain('violates database integrity constraints');
    });

    it('returns HTTP 500 for SQL syntax errors', () => {
      const res = createMockResponse();
      const err = Object.assign(new Error("Incorrect syntax near 'FROM'."), { number: 102 });

      sendDatabaseError(res, err, 'execute custom query');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Database Query Error');
      expect(res.body.category).toBe('SYNTAX_ERROR');
    });

    it('returns HTTP 504 for query execution timeouts', () => {
      const res = createMockResponse();
      const err = Object.assign(new Error('statement timeout occurred after 30000ms'), { code: 'ETIMEOUT' });

      sendDatabaseError(res, err, 'recalculate analytics');

      expect(res.status).toHaveBeenCalledWith(504);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Database Query Timeout');
      expect(res.body.category).toBe('QUERY_TIMEOUT');
    });

    it('returns HTTP 503 for pool acquisition timeouts', () => {
      const res = createMockResponse();
      const err = new Error('ResourceRequest timed out');

      sendDatabaseError(res, err, 'fetch clients');

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(res.body.category).toBe('POOL_ACQUISITION_TIMEOUT');
    });

    it('returns HTTP 503 for transient connection loss', () => {
      const res = createMockResponse();
      const err = Object.assign(new Error('Connection lost - read ECONNRESET'), { code: 'ECONNRESET' });

      sendDatabaseError(res, err, 'fetch projects');

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Azure SQL Database Unavailable');
      expect(res.body.category).toBe('TRANSIENT_CONNECTION');
    });

    it('returns HTTP 500 with TRANSACTION_COMMIT_AMBIGUOUS for ambiguous commit state', () => {
      const res = createMockResponse();
      const err = new TransactionCommitAmbiguousError('Server dropped socket during commit');

      sendDatabaseError(res, err, 'commit financial transaction');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('TRANSACTION_COMMIT_AMBIGUOUS');
      expect(res.body.category).toBe('TRANSACTION_COMMIT_AMBIGUOUS');
      expect(res.body.message).toContain('Transaction state is ambiguous');
    });

    it('redacts sensitive credentials if included in the error message', () => {
      const res = createMockResponse();
      const sensitiveErr = new Error('Connection failed: Server=ddcrm.database.windows.net;Password=MySecretP@ss123;User ID=sa;');

      sendDatabaseError(res, sensitiveErr, 'connect pool');

      expect(res.body.details).not.toContain('MySecretP@ss123');
      expect(res.body.details).not.toContain('database.windows.net');
      expect(res.body.details).toContain('password=***');
    });
  });

  describe('7. sendDatabaseUnavailable Helper', () => {
    it('sanitizes details in sendDatabaseUnavailable without credential leakage', () => {
      const res: any = {
        statusCode: 200,
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };

      sendDatabaseUnavailable(res, 'save payment', 'Password=supersecret;User ID=admin;Server=ddcrm.database.windows.net');

      expect(res.status).toHaveBeenCalledWith(503);
      const jsonArg = res.json.mock.calls[0][0];
      expect(jsonArg.details).not.toContain('supersecret');
      expect(jsonArg.details).not.toContain('database.windows.net');
      expect(jsonArg.details).toContain('password=***');
      expect(jsonArg.details).toContain('user=***');
    });
  });

  describe('8. Default-Deny Retry Policy & Write Safety Guards', () => {
    it('1. Read-only queries retry transient failures up to the configured limit', async () => {
      const pool: any = { connected: true };
      const freshPool: any = { connected: true, id: 'fresh' };
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(freshPool);

      let attempts = 0;
      const queryFn = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts <= 2) throw Object.assign(new Error('transient timeout'), { code: 'ETIMEOUT' });
        return { recordset: [{ id: 'SRV-01' }] };
      });

      const res = await executeSqlWithAutoMigration(pool, queryFn, { tableName: 'services', isReadOnly: true, maxRetries: 2 });
      expect(attempts).toBe(3); // 1 initial + 2 retries
      expect(res).toEqual({ recordset: [{ id: 'SRV-01' }] });
    });

    it('2. INSERT queries do not retry by default', async () => {
      const pool: any = { connected: true };
      const queryFn = vi.fn().mockRejectedValue(Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }));

      await expect(
        executeSqlWithAutoMigration(pool, queryFn, { tableName: 'projects' })
      ).rejects.toThrow('connection reset');

      expect(queryFn).toHaveBeenCalledTimes(1); // 0 retries
    });

    it('3. UPDATE queries do not retry by default', async () => {
      const pool: any = { connected: true };
      const queryFn = vi.fn().mockRejectedValue(Object.assign(new Error('socket hung up'), { code: 'ECONNRESET' }));

      await expect(
        executeSqlWithAutoMigration(pool, queryFn, { tableName: 'clients' })
      ).rejects.toThrow('socket hung up');

      expect(queryFn).toHaveBeenCalledTimes(1); // 0 retries
    });

    it('4. DELETE queries do not retry by default', async () => {
      const pool: any = { connected: true };
      const queryFn = vi.fn().mockRejectedValue(Object.assign(new Error('timeout on delete'), { code: 'ETIMEOUT' }));

      await expect(
        executeSqlWithAutoMigration(pool, queryFn, { tableName: 'service_categories' })
      ).rejects.toThrow('timeout on delete');

      expect(queryFn).toHaveBeenCalledTimes(1); // 0 retries
    });

    it('5. Missing operation metadata results in zero retries', async () => {
      const pool: any = { connected: true };
      const queryFn = vi.fn().mockRejectedValue(Object.assign(new Error('network glitch'), { code: 'ECONNRESET' }));

      // Missing options completely
      await expect(executeSqlWithAutoMigration(pool, queryFn)).rejects.toThrow('network glitch');
      expect(queryFn).toHaveBeenCalledTimes(1);

      // String only without isReadOnly
      queryFn.mockClear();
      await expect(executeSqlWithAutoMigration(pool, queryFn, 'app_users')).rejects.toThrow('network glitch');
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it('6. Financial mutations cannot retry even if conflicting retry options are supplied', async () => {
      const pool: any = { connected: true };
      const queryFn = vi.fn().mockRejectedValue(Object.assign(new Error('deadlock victim'), { number: 1205 }));

      await expect(
        executeSqlWithAutoMigration(pool, queryFn, {
          tableName: 'payments',
          isFinancialMutation: true,
          isReadOnly: true, // Conflicting option
          maxRetries: 5,   // Conflicting option
        } as any)
      ).rejects.toThrow('deadlock victim');

      expect(queryFn).toHaveBeenCalledTimes(1); // Strictly 0 retries
    });

    it('7. The GST invoice update helper is protected with isFinancialMutation: true', async () => {
      const pool: any = { connected: true };
      const queryFn = vi.fn().mockRejectedValue(Object.assign(new Error('timeout updating GST invoice'), { code: 'ETIMEOUT' }));

      await expect(
        executeSqlWithAutoMigration(pool, queryFn, { tableName: 'gst_invoices', isFinancialMutation: true })
      ).rejects.toThrow('timeout updating GST invoice');

      expect(queryFn).toHaveBeenCalledTimes(1); // Zero retries
    });

    it('8. Project INSERT cannot execute twice after an ambiguous timeout', async () => {
      const pool: any = { connected: true };
      let insertExecutionCount = 0;
      const projectInsertFn = vi.fn().mockImplementation(async () => {
        insertExecutionCount++;
        // Ambiguous timeout: SQL Server may or may not have committed
        throw Object.assign(new Error('Statement timed out after 30000ms'), { code: 'ETIMEOUT' });
      });

      await expect(
        executeSqlWithAutoMigration(pool, projectInsertFn, { tableName: 'projects' })
      ).rejects.toThrow('Statement timed out');

      // Default-deny prevents a second INSERT that would corrupt state or fail with duplicate key
      expect(insertExecutionCount).toBe(1);
    });

    it('9. Audit-log INSERT cannot execute twice after an ambiguous timeout', async () => {
      const pool: any = { connected: true };
      let logCount = 0;
      const auditLogFn = vi.fn().mockImplementation(async () => {
        logCount++;
        throw Object.assign(new Error('Connection reset during audit write'), { code: 'ECONNRESET' });
      });

      await expect(
        executeSqlWithAutoMigration(pool, auditLogFn, { tableName: 'crm_audit_log' })
      ).rejects.toThrow('Connection reset during audit write');

      // Default-deny guarantees no duplicate audit log entries are generated
      expect(logCount).toBe(1);
    });

    it('10. Active-pool propagation continues working for eligible retries', async () => {
      const deadPool: any = { connected: false, id: 'stale-pool' };
      const freshPool: any = { connected: true, id: 'active-fresh-pool' };
      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(freshPool);

      const receivedPoolIds: string[] = [];
      const readFn = vi.fn().mockImplementation(async (poolArg: any) => {
        receivedPoolIds.push(poolArg.id);
        if (receivedPoolIds.length === 1) {
          throw Object.assign(new Error('stale socket'), { code: 'ECONNRESET' });
        }
        return { success: true };
      });

      const res = await executeSqlWithAutoMigration(deadPool, readFn, { tableName: 'clients', isReadOnly: true, maxRetries: 1 });
      expect(res).toEqual({ success: true });
      expect(receivedPoolIds).toEqual(['stale-pool', 'active-fresh-pool']);
    });

    it('11. executeSql in server/db/db.ts also enforces default-deny', async () => {
      const db = await vi.importActual<any>('../server/db/db');
      const fakePool: any = { connected: true, request: vi.fn() };
      db.setGlobalPoolForTesting(fakePool, true);

      try {
        const writeFn = vi.fn().mockRejectedValue(Object.assign(new Error('ETIMEOUT in executeSql'), { code: 'ETIMEOUT' }));

        // Missing or non-read-only options -> 0 retries
        await expect(db.executeSql(writeFn, 'some_table')).rejects.toThrow('ETIMEOUT in executeSql');
        expect(writeFn).toHaveBeenCalledTimes(1);

        // Financial mutation with conflicting maxRetries -> 0 retries
        writeFn.mockClear();
        await expect(
          db.executeSql(writeFn, { tableName: 'payments', isFinancialMutation: true, maxRetries: 3 } as any)
        ).rejects.toThrow('ETIMEOUT in executeSql');
        expect(writeFn).toHaveBeenCalledTimes(1);
      } finally {
        db.setGlobalPoolForTesting(null, false);
      }
    });
  });
});
