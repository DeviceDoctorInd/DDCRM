import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestApp } from './testApp';
import { getValidToken, getViewerToken } from './helpers/auth';
import { isMockFallbackAllowed } from '../server/db/db.config';

// Mock CrmContext so LoginScreen renders standalone
vi.mock('../src/context/CrmContext', () => ({
  useCrm: () => ({
    login: vi.fn(),
    logout: vi.fn(),
    selectBrandWorkspace: vi.fn(),
    authUser: null,
    hasConfirmedWorkspace: false,
    theme: 'light',
    toggleTheme: vi.fn(),
    databaseStatus: { connected: true, isMock: false },
  }),
}));

import { LoginScreen } from '../src/components/auth/LoginScreen';

const app = createTestApp();

describe('Step 10B — Startup & Azure SQL Connection Performance Optimization Tests', () => {
  describe('1. Unauthenticated Startup & Zero CRM Data Leakage', () => {
    it('unauthenticated GET /api/db/status succeeds without requiring auth tokens', async () => {
      const res = await request(app).get('/api/db/status');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body).toHaveProperty('connected');
      expect(res.body).toHaveProperty('isMock');
      // Must not leak sensitive connection strings or server details
      expect(res.body.server).toBeUndefined();
      expect(res.body.database).toBeUndefined();
      expect(res.body.user).toBeUndefined();
      expect(res.body.password).toBeUndefined();
      expect(res.body.tableCounts).toBeUndefined();
    });

    it('unauthenticated requests to operational CRM endpoints return 401 Unauthorized and block data exposure', async () => {
      const protectedEndpoints = [
        '/api/clients',
        '/api/projects',
        '/api/payments',
        '/api/bank-accounts',
        '/api/gst-invoices',
        '/api/employees',
        '/api/employee-payments',
        '/api/expenses',
        '/api/users',
      ];

      for (const endpoint of protectedEndpoints) {
        const res = await request(app).get(endpoint);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toMatch(/access denied|no authentication token/i);
      }
    });

    it('invalid or expired bearer token cannot retrieve CRM module data', async () => {
      const res = await request(app)
        .get('/api/clients')
        .set('Authorization', 'Bearer invalid.expired.token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Independent Login Screen Rendering', () => {
    it('login screen renders immediately without requiring CRM module data loading', () => {
      const html = renderToStaticMarkup(React.createElement(LoginScreen));
      expect(html).toContain('Operator Sign In');
      expect(html).toContain('Work Email Address / Admin ID');
      expect(html).toContain('Security Password');
      expect(html).toContain('Azure SQL Live');
      // Confirms form controls are present and ready for interaction
      expect(html).toContain('Authenticate &amp; Continue to Workspace Selection');
    });
  });

  describe('3. Login and Brand Workspace Isolation', () => {
    it('successful login validates credentials and returns session token without exposing raw CRM collections', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'rathorehemant114@gmail.com',
          password: 'Admin@2026',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('rathorehemant114@gmail.com');
      // Login endpoint returns user metadata, not bulk CRM tables
      expect(res.body.clients).toBeUndefined();
      expect(res.body.projects).toBeUndefined();
    });

    it('switching workspace partitions enforces strict brand isolation and prevents cross-brand leakage', async () => {
      const token = getValidToken();

      // Brand 1: Device Doctor India
      const resDDI = await request(app)
        .get('/api/clients')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Active-Brand', 'Device Doctor India');

      expect(resDDI.status).toBe(200);
      expect(Array.isArray(resDDI.body)).toBe(true);
      resDDI.body.forEach((client: any) => {
        expect(client.brand).toBe('Device Doctor India');
      });

      // Brand 2: Codestro
      const resCodestro = await request(app)
        .get('/api/clients')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Active-Brand', 'Codestro');

      expect(resCodestro.status).toBe(200);
      expect(Array.isArray(resCodestro.body)).toBe(true);
      resCodestro.body.forEach((client: any) => {
        expect(client.brand).toBe('Codestro');
      });
    });
  });

  describe('4. Connection Pool Concurrency & Singleton Contract', () => {
    it('concurrent connection requests share the single in-flight promise and do not duplicate pools', async () => {
      let connectionCount = 0;
      let sharedPromise: Promise<string> | null = null;

      // Simulate the getOrInitPool deduplication pattern implemented in db.ts
      async function simulateGetOrInitPool() {
        if (sharedPromise) {
          return sharedPromise;
        }

        sharedPromise = (async () => {
          try {
            connectionCount++;
            await new Promise((resolve) => setTimeout(resolve, 20));
            return 'connected-pool-instance';
          } finally {
            sharedPromise = null;
          }
        })();

        return sharedPromise;
      }

      // Fire 5 concurrent connection requests simultaneously
      const results = await Promise.all([
        simulateGetOrInitPool(),
        simulateGetOrInitPool(),
        simulateGetOrInitPool(),
        simulateGetOrInitPool(),
        simulateGetOrInitPool(),
      ]);

      expect(results).toEqual([
        'connected-pool-instance',
        'connected-pool-instance',
        'connected-pool-instance',
        'connected-pool-instance',
        'connected-pool-instance',
      ]);
      // Exactly 1 connection attempt was initiated despite 5 concurrent callers
      expect(connectionCount).toBe(1);
    });

    it('pool initialization failure is caught safely and subsequent calls can retry without permanent rejection', async () => {
      let attempts = 0;
      let poolPromise: Promise<string | null> | null = null;

      async function simulatePoolWithFailure(shouldFail: boolean) {
        if (poolPromise) return poolPromise;

        poolPromise = (async () => {
          try {
            attempts++;
            if (shouldFail) {
              throw new Error('FirewallBlocked');
            }
            return 'active-pool';
          } catch {
            return null;
          }
        })();

        try {
          return await poolPromise;
        } finally {
          poolPromise = null;
        }
      }

      // First attempt fails
      const firstResult = await simulatePoolWithFailure(true);
      expect(firstResult).toBeNull();
      expect(attempts).toBe(1);

      // Second attempt retries cleanly because in-flight promise was cleared in finally
      const secondResult = await simulatePoolWithFailure(false);
      expect(secondResult).toBe('active-pool');
      expect(attempts).toBe(2);
    });
  });

  describe('5. Database Schema & Startup Work Ordering', () => {
    it('DDL statements define all core tables before column migrations', async () => {
      const realDb = await vi.importActual<any>('../server/db/db');
      expect(realDb.DDL_STATEMENTS.length).toBeGreaterThanOrEqual(15);
      expect(realDb.COLUMN_MIGRATIONS.length).toBeGreaterThanOrEqual(30);
      expect(realDb.DATA_SYNC_STATEMENTS.length).toBeGreaterThanOrEqual(2);

      // Confirm required tables are included
      const ddlText = realDb.DDL_STATEMENTS.join('\n');
      expect(ddlText).toContain('clients');
      expect(ddlText).toContain('projects');
      expect(ddlText).toContain('payments');
      expect(ddlText).toContain('app_users');
      expect(ddlText).toContain('bank_accounts');
      expect(ddlText).toContain('gst_invoices');
    });

    it('data sync statements ensure historical column compatibility', async () => {
      const realDb = await vi.importActual<any>('../server/db/db');
      const syncText = realDb.DATA_SYNC_STATEMENTS.join('\n');
      expect(syncText).toContain('other_expenses');
      expect(syncText).toContain('clients');
    });
  });

  describe('6. Production Fail-Closed Policy Invariance', () => {
    it('strictly forbids mock store fallback in production mode even if env var opt-in is attempted', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalAllow = process.env.ALLOW_MOCK_FALLBACK;

      try {
        process.env.NODE_ENV = 'production';
        process.env.ALLOW_MOCK_FALLBACK = 'true';

        expect(isMockFallbackAllowed()).toBe(false);
      } finally {
        process.env.NODE_ENV = originalEnv;
        process.env.ALLOW_MOCK_FALLBACK = originalAllow;
      }
    });

    it('allows mock store fallback in test mode for isolated unit testing', () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(isMockFallbackAllowed()).toBe(true);
    });
  });
});
