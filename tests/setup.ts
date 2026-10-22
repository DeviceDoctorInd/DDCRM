import { vi, beforeAll } from 'vitest';
import { mockStore } from '../server/db/mockStore';

// Strict safety rule: disable Azure SQL credentials & force mock store mode
process.env.NODE_ENV = 'test';
process.env.AZURE_SQL_PASSWORD = '';
delete process.env.AZURE_SQL_PASSWORD;
delete process.env.AZURE_SQL_SERVER;

// Mock azureSql module to guarantee production database is NEVER touched
vi.mock('../server/db/azureSql', () => ({
  getAzureDbStatus: vi.fn(() => ({
    connected: false,
    server: 'test-mock-server',
    database: 'test-mock-db',
    authType: 'mock',
    user: 'mock-user',
    error: 'Test mode: Operating with high-availability in-memory store',
    lastChecked: new Date().toISOString(),
    tableCounts: {},
  })),
  getPool: vi.fn(() => null),
  getOrInitPool: vi.fn(async () => null),
  refreshTableCounts: vi.fn(async () => ({})),
  initAzureSql: vi.fn(async () => false),
  migrateAzureSqlSchema: vi.fn(async () => {}),
  isTransientError: vi.fn(() => false),
}));

// Also mock server/db/db to be doubly sure
vi.mock('../server/db/db', () => ({
  getPool: vi.fn(() => null),
  getOrInitPool: vi.fn(async () => null),
  isDbConnected: vi.fn(() => false),
  initAzureSql: vi.fn(async () => false),
  getAzureDbStatus: vi.fn(() => ({
    connected: false,
    server: 'test-mock-server',
    database: 'test-mock-db',
    authType: 'mock',
    user: 'mock-user',
    error: 'Test mode',
    lastChecked: new Date().toISOString(),
    tableCounts: {},
  })),
  refreshTableCounts: vi.fn(async () => ({})),
  migrateAzureSqlSchema: vi.fn(async () => {}),
  isTransientError: vi.fn(() => false),
}));

beforeAll(() => {
  // Initialize mock store for clean isolation per test suite
  mockStore.seedDefaultData();
});
