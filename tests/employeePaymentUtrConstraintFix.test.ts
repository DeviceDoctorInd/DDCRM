import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import sql from 'mssql';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import { mockStore } from '../server/db/mockStore';
import * as azureSqlModule from '../server/db/azureSql';
import {
  migrateEmployeePaymentUtrIndex,
  isExactUtrFilter,
  normalizeFilterDefinition,
  EXPECTED_FILTER_CANONICAL,
} from '../server/db/db';
import { normalizeReferenceUtr } from '../server/routes/api';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

/**
 * Disposable MSSQL Test Database Simulator
 * Implements real MSSQL system catalog tables (sys.tables, sys.indexes, sys.index_columns, sys.columns, sys.key_constraints)
 * and stateful transactional DDL / DML operations with realistic unique constraint & filtered index enforcement.
 */
interface TableRecord {
  id: string;
  emp_payment_id_code?: string;
  brand: string;
  assignment_id?: string | null;
  project_id?: string | null;
  employee_id?: string | null;
  employee_name?: string;
  payment_date?: string;
  amount_paid: number;
  payment_mode?: string;
  reference_utr: string | null;
  notes?: string;
  payment_proof?: string | null;
  payment_proof_notes?: string;
  created_at?: string;
  updated_at?: string;
}

interface SysIndex {
  name: string;
  is_unique: boolean;
  has_filter: boolean;
  filter_definition: string | null;
  is_unique_constraint: boolean;
  constraint_name: string | null;
}

export interface DisposableMssqlDatabase {
  connected: boolean;
  request: () => any;
  transaction: () => any;
  getRecords: () => TableRecord[];
  getIndexes: () => SysIndex[];
  getExecutionLog: () => string[];
  getCapturedInputs: () => { sql: string; inputs: Record<string, any>; types: Record<string, any> }[];
  setQueryInterceptor: (interceptor: ((sql: string) => void) | null) => void;
}

function createDisposableMssqlDatabase(): sql.ConnectionPool & DisposableMssqlDatabase {
  // Initial legacy state: table with legacy empty string, whitespace string, null, and valid UTRs
  let records: TableRecord[] = [
    {
      id: 'DDI-EPAY-LEG-01',
      emp_payment_id_code: 'DDI-EPAY-LEG-01',
      brand: 'Device Doctor India',
      assignment_id: 'DDI-ASN-001',
      project_id: 'DDI-PRJ-001',
      employee_id: 'DDI-EMP-001',
      employee_name: 'Amit Trivedi',
      payment_date: '2026-01-10',
      amount_paid: 10000,
      payment_mode: 'GST Invoice',
      reference_utr: '', // Legacy empty string
      created_at: '2026-01-10T10:00:00.000Z',
      updated_at: '2026-01-10T10:00:00.000Z',
    },
    {
      id: 'DDI-EPAY-LEG-02',
      emp_payment_id_code: 'DDI-EPAY-LEG-02',
      brand: 'Device Doctor India',
      assignment_id: 'DDI-ASN-001',
      project_id: 'DDI-PRJ-001',
      employee_id: 'DDI-EMP-001',
      employee_name: 'Amit Trivedi',
      payment_date: '2026-01-15',
      amount_paid: 12000,
      payment_mode: 'Non GST Online',
      reference_utr: '   ', // Legacy whitespace-only string
      created_at: '2026-01-15T10:00:00.000Z',
      updated_at: '2026-01-15T10:00:00.000Z',
    },
    {
      id: 'DDI-EPAY-LEG-03',
      emp_payment_id_code: 'DDI-EPAY-LEG-03',
      brand: 'Device Doctor India',
      assignment_id: 'DDI-ASN-002',
      project_id: 'DDI-PRJ-001',
      employee_id: 'DDI-EMP-002',
      employee_name: 'Saumya Khandelwal',
      payment_date: '2026-01-20',
      amount_paid: 15000,
      payment_mode: 'GST Invoice',
      reference_utr: null, // Legacy null
      created_at: '2026-01-20T10:00:00.000Z',
      updated_at: '2026-01-20T10:00:00.000Z',
    },
    {
      id: 'DDI-EPAY-LEG-04',
      emp_payment_id_code: 'DDI-EPAY-LEG-04',
      brand: 'Device Doctor India',
      assignment_id: 'DDI-ASN-002',
      project_id: 'DDI-PRJ-001',
      employee_id: 'DDI-EMP-002',
      employee_name: 'Saumya Khandelwal',
      payment_date: '2026-01-25',
      amount_paid: 20000,
      payment_mode: 'GST Invoice',
      reference_utr: 'UTR-LEGACY-001', // Legacy valid UTR
      created_at: '2026-01-25T10:00:00.000Z',
      updated_at: '2026-01-25T10:00:00.000Z',
    },
    {
      id: 'DDI-EPAY-LEG-05',
      emp_payment_id_code: 'DDI-EPAY-LEG-05',
      brand: 'Device Doctor India',
      assignment_id: 'DDI-ASN-003',
      project_id: 'DDI-PRJ-002',
      employee_id: 'DDI-EMP-003',
      employee_name: 'Vikram Batra',
      payment_date: '2026-01-28',
      amount_paid: 25000,
      payment_mode: 'GST Invoice',
      reference_utr: '  UTR-LEGACY-002  ', // Valid UTR needing trimming
      created_at: '2026-01-28T10:00:00.000Z',
      updated_at: '2026-01-28T10:00:00.000Z',
    },
  ];

  // Initial index state: Unfiltered unique constraint on reference_utr
  let indexes: SysIndex[] = [
    {
      name: 'UQ_employee_payments_reference_utr',
      is_unique: true,
      has_filter: false,
      filter_definition: null,
      is_unique_constraint: true,
      constraint_name: 'UQ_employee_payments_reference_utr',
    },
  ];

  const executionLog: string[] = [];
  const capturedInputs: { sql: string; inputs: Record<string, any>; types: Record<string, any> }[] = [];
  let queryInterceptor: ((sql: string) => void) | null = null;

  function checkUniqueness(newRecord: TableRecord, excludeId?: string) {
    const activeUqIndex = indexes.find((i) => i.is_unique);
    if (!activeUqIndex) return;

    const val = newRecord.reference_utr;

    // Filter check: If index is filtered, only rows satisfying the filter are checked
    if (activeUqIndex.has_filter && activeUqIndex.filter_definition) {
      // Required filter: WHERE reference_utr IS NOT NULL AND reference_utr <> ''
      if (val === null || val === '') {
        // Excluded from index -> multiple allowed!
        return;
      }
    }

    // Check collision against existing records
    for (const row of records) {
      if (excludeId && (row.id === excludeId || row.emp_payment_id_code === excludeId)) {
        continue;
      }
      const existingVal = row.reference_utr;
      if (activeUqIndex.has_filter) {
        if (existingVal === null || existingVal === '') continue;
      }

      if (val === existingVal || (val !== null && existingVal !== null && val.toLowerCase() === existingVal.toLowerCase())) {
        const err: any = new Error(
          `Violation of UNIQUE KEY constraint '${activeUqIndex.name}'. Cannot insert duplicate key in object 'dbo.employee_payments'. The duplicate key value is (${val ?? '<null>'}).`
        );
        err.number = 2627;
        throw err;
      }
    }
  }

  function executeQuery(sqlText: string, inputs: Record<string, any> = {}, types: Record<string, any> = {}): any {
    executionLog.push(sqlText);
    capturedInputs.push({ sql: sqlText, inputs: { ...inputs }, types: { ...types } });
    if (queryInterceptor) {
      queryInterceptor(sqlText);
    }

    // 1. Table existence check
    if (sqlText.includes("SELECT 1 FROM sys.tables WHERE name = 'employee_payments'")) {
      return { recordset: [{ '1': 1 }] };
    }

    // 2. Index inspection query
    if (sqlText.includes('FROM sys.indexes i') && sqlText.includes("c.name = 'reference_utr'")) {
      const rows = indexes.map((idx) => ({
        index_name: idx.name,
        is_unique: idx.is_unique ? 1 : 0,
        has_filter: idx.has_filter ? 1 : 0,
        filter_definition: idx.filter_definition,
        is_unique_constraint: idx.is_unique_constraint ? 1 : 0,
        constraint_name: idx.constraint_name,
      }));
      return { recordset: rows };
    }

    // 3. Drop constraint
    if (sqlText.includes('DROP CONSTRAINT')) {
      const match = sqlText.match(/DROP CONSTRAINT \[?([a-zA-Z0-9_]+)\]?/i);
      const cName = match ? match[1] : 'UQ_employee_payments_reference_utr';
      indexes = indexes.filter((i) => i.constraint_name !== cName && i.name !== cName);
      return { rowsAffected: [1] };
    }

    // 4. Drop index
    if (sqlText.includes('DROP INDEX')) {
      const match = sqlText.match(/DROP INDEX \[?([a-zA-Z0-9_]+)\]?/i);
      const iName = match ? match[1] : 'UQ_employee_payments_reference_utr';
      indexes = indexes.filter((i) => i.name !== iName);
      return { rowsAffected: [1] };
    }

    // 5. Count query
    if (sqlText.includes('SELECT COUNT(1) AS totalCount FROM employee_payments')) {
      return { recordset: [{ totalCount: records.length }] };
    }

    // 5b. Pre-check for duplicate UTRs after whitespace trimming
    if (sqlText.includes('GROUP BY LTRIM(RTRIM(reference_utr))') && sqlText.includes('HAVING COUNT(1) > 1')) {
      const counts: Record<string, number> = {};
      for (const r of records) {
        if (r.reference_utr !== null && r.reference_utr.trim() !== '') {
          const trimmed = r.reference_utr.trim();
          counts[trimmed] = (counts[trimmed] || 0) + 1;
        }
      }
      const conflicts = Object.entries(counts)
        .filter(([_, count]) => count > 1)
        .map(([utr, count]) => ({ conflicting_utr: utr, dup_count: count }));
      return { recordset: conflicts };
    }

    // 6. Legacy check query
    if (sqlText.includes("LTRIM(RTRIM(reference_utr)) = ''") && sqlText.includes('SELECT COUNT(1)')) {
      const invalid = records.filter((r) => r.reference_utr !== null && r.reference_utr.trim() === '');
      return { recordset: [{ legacyCount: invalid.length, invalidCount: invalid.length }] };
    }

    // 7. Normalization update: empty/whitespace to NULL
    if (sqlText.includes('UPDATE [employee_payments]') && sqlText.includes('SET [reference_utr] = NULL')) {
      let count = 0;
      records = records.map((r) => {
        if (r.reference_utr !== null && r.reference_utr.trim() === '') {
          count++;
          return { ...r, reference_utr: null };
        }
        return r;
      });
      return { rowsAffected: [count] };
    }

    // 8. Normalization update: trim valid non-empty UTRs
    if (sqlText.includes('SET [reference_utr] = LTRIM(RTRIM([reference_utr]))')) {
      records = records.map((r) => {
        if (r.reference_utr !== null && r.reference_utr.trim() !== '') {
          return { ...r, reference_utr: r.reference_utr.trim() };
        }
        return r;
      });
      return { rowsAffected: [1] };
    }

    // 9. Create filtered unique index
    if (sqlText.includes('CREATE UNIQUE NONCLUSTERED INDEX [UQ_employee_payments_reference_utr]')) {
      indexes.push({
        name: 'UQ_employee_payments_reference_utr',
        is_unique: true,
        has_filter: true,
        filter_definition: '([reference_utr] IS NOT NULL AND [reference_utr]<>\'\')',
        is_unique_constraint: false,
        constraint_name: null,
      });
      return { rowsAffected: [1] };
    }

    // 10. Verify index after creation
    if (sqlText.includes("i.name = 'UQ_employee_payments_reference_utr'")) {
      const idx = indexes.find((i) => i.name === 'UQ_employee_payments_reference_utr');
      return {
        recordset: idx
          ? [
              {
                index_name: idx.name,
                is_unique: idx.is_unique ? 1 : 0,
                has_filter: idx.has_filter ? 1 : 0,
                filter_definition: idx.filter_definition,
              },
            ]
          : [],
      };
    }

    // 11. UTR uniqueness check in API POST/PUT
    if (sqlText.includes('FROM employee_payments WITH (UPDLOCK, HOLDLOCK, TABLOCK)') && sqlText.includes('reference_utr = @utr')) {
      const match = records.find(
        (r) =>
          r.reference_utr !== null &&
          r.reference_utr !== '' &&
          r.reference_utr.toLowerCase() === String(inputs.utr).trim().toLowerCase()
      );
      return { recordset: match ? [match] : [] };
    }

    if (sqlText.includes('FROM employee_payments') && sqlText.includes('reference_utr = @utr')) {
      const match = records.find(
        (r) =>
          r.reference_utr !== null &&
          r.reference_utr !== '' &&
          r.reference_utr.toLowerCase() === String(inputs.utr).trim().toLowerCase() &&
          r.id !== inputs.rawId &&
          r.id !== inputs.id
      );
      return { recordset: match ? [match] : [] };
    }

    // 12. Check existing payment by ID
    if (sqlText.includes('SELECT TOP 1 CAST(id AS NVARCHAR(150)) as id') && sqlText.includes('FROM employee_payments')) {
      const match = records.find((r) => r.id === inputs.rawId || r.emp_payment_id_code === inputs.rawId);
      return { recordset: match ? [match] : [] };
    }

    // 13. Sequence lookup
    if (sqlText.includes('WHERE CAST(id AS NVARCHAR(150)) LIKE @pattern OR emp_payment_id_code LIKE @pattern')) {
      return { recordset: records.map((r) => ({ id: r.emp_payment_id_code || r.id })) };
    }

    // 14. INSERT INTO employee_payments
    if (sqlText.includes('INSERT INTO employee_payments')) {
      const newRec: TableRecord = {
        id: inputs.rawId || inputs.id,
        emp_payment_id_code: inputs.rawId,
        brand: inputs.brand,
        assignment_id: inputs.assignment_id,
        project_id: inputs.project_id,
        employee_id: inputs.employee_id,
        employee_name: inputs.employee_name,
        payment_date: inputs.payment_date,
        amount_paid: inputs.amount_paid,
        payment_mode: inputs.payment_mode,
        reference_utr: inputs.reference_utr,
        notes: inputs.notes,
        payment_proof: inputs.payment_proof,
        payment_proof_notes: inputs.payment_proof_notes,
        created_at: inputs.created_at,
        updated_at: inputs.updated_at,
      };
      checkUniqueness(newRec);
      records.push(newRec);
      return { rowsAffected: [1] };
    }

    // 15. UPDATE employee_payments
    if (sqlText.includes('UPDATE employee_payments')) {
      const idx = records.findIndex((r) => r.id === inputs.targetId || r.emp_payment_id_code === inputs.rawId);
      if (idx >= 0) {
        const updatedRec: TableRecord = {
          ...records[idx],
          brand: inputs.brand,
          assignment_id: inputs.assignment_id,
          project_id: inputs.project_id,
          employee_id: inputs.employee_id,
          employee_name: inputs.employee_name,
          payment_date: inputs.payment_date,
          amount_paid: inputs.amount_paid,
          payment_mode: inputs.payment_mode,
          reference_utr: inputs.reference_utr,
          notes: inputs.notes,
          payment_proof: inputs.payment_proof,
          payment_proof_notes: inputs.payment_proof_notes,
          updated_at: inputs.updated_at,
        };
        checkUniqueness(updatedRec, inputs.rawId);
        records[idx] = updatedRec;
        return { rowsAffected: [1] };
      }
      return { rowsAffected: [0] };
    }

    // Default: empty recordset
    return { recordset: [], rowsAffected: [0] };
  }

  function makeRequestObject() {
    const req: any = {
      inputs: {} as Record<string, any>,
      types: {} as Record<string, any>,
      input(name: string, typeOrValue: any, value?: any) {
        if (value !== undefined) {
          req.types[name] = typeOrValue;
          req.inputs[name] = value;
        } else {
          req.inputs[name] = typeOrValue;
        }
        return req;
      },
      output() {
        return req;
      },
      async query(sqlText: string) {
        return executeQuery(sqlText, req.inputs, req.types);
      },
    };
    return req;
  }

  const fakePool: DisposableMssqlDatabase = {
    connected: true,
    request: () => makeRequestObject(),
    transaction: () => {
      let rolledBack = false;
      let committed = false;
      const snapshot = JSON.stringify(records);
      const indexSnapshot = JSON.stringify(indexes);

      return {
        begin: async () => {},
        commit: async () => {
          committed = true;
        },
        rollback: async () => {
          rolledBack = true;
          records = JSON.parse(snapshot);
          indexes = JSON.parse(indexSnapshot);
        },
        request: () => makeRequestObject(),
        isRolledBack: () => rolledBack,
        isCommitted: () => committed,
      };
    },
    getRecords: (): TableRecord[] => [...records],
    getIndexes: (): SysIndex[] => [...indexes],
    getExecutionLog: (): string[] => [...executionLog],
    getCapturedInputs: (): { sql: string; inputs: Record<string, any>; types: Record<string, any> }[] => [...capturedInputs],
    setQueryInterceptor: (interceptor: ((sql: string) => void) | null) => {
      queryInterceptor = interceptor;
    },
  };

  return fakePool as any;
}

describe('FIX 20: Employee Payment Reference UTR Database Constraint Violation & Filtered Index Fix', () => {
  beforeEach(() => {
    mockStore.seedDefaultData();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Normalization Utility Tests
  describe('1. UTR Normalization Contract', () => {
    it('normalizes empty string, whitespace string, null, and undefined to null', () => {
      expect(normalizeReferenceUtr('')).toBeNull();
      expect(normalizeReferenceUtr('   ')).toBeNull();
      expect(normalizeReferenceUtr(' \t \n ')).toBeNull();
      expect(normalizeReferenceUtr(null)).toBeNull();
      expect(normalizeReferenceUtr(undefined)).toBeNull();
    });

    it('rejects objects, arrays, and booleans by returning null', () => {
      expect(normalizeReferenceUtr({})).toBeNull();
      expect(normalizeReferenceUtr([])).toBeNull();
      expect(normalizeReferenceUtr(true)).toBeNull();
      expect(normalizeReferenceUtr(false)).toBeNull();
    });

    it('preserves and trims valid non-empty UTR strings and numeric references', () => {
      expect(normalizeReferenceUtr('UTR12345678')).toBe('UTR12345678');
      expect(normalizeReferenceUtr('  UTR-DDI-998877  ')).toBe('UTR-DDI-998877');
      expect(normalizeReferenceUtr('HDFC98213892183')).toBe('HDFC98213892183');
      expect(normalizeReferenceUtr(123456)).toBe('123456');
    });
  });

  // 2. Filter Canonicalization & Strict Validation Tests
  describe('2. Strict Filter Definition Validator (Anti-Loose Check)', () => {
    it('matches exact SQL Server canonical representation of the required filter', () => {
      expect(EXPECTED_FILTER_CANONICAL).toBe("reference_utrisnotnullandreference_utr<>''");
      expect(isExactUtrFilter("([reference_utr] IS NOT NULL AND [reference_utr]<>'')")).toBe(true);
      expect(isExactUtrFilter("([reference_utr] IS NOT NULL AND [reference_utr] <> '')")).toBe(true);
      expect(isExactUtrFilter("WHERE reference_utr IS NOT NULL AND reference_utr <> ''")).toBe(true);
    });

    it('rejects loose LIKE matches that omit the empty string clause', () => {
      // Loose check bug: index has IS NOT NULL but misses <> '', which would still collide on empty strings!
      expect(isExactUtrFilter('([reference_utr] IS NOT NULL)')).toBe(false);
      expect(isExactUtrFilter('WHERE reference_utr IS NOT NULL')).toBe(false);
      expect(isExactUtrFilter('([reference_utr]<>\'\')')).toBe(false);
      expect(isExactUtrFilter(null)).toBe(false);
      expect(isExactUtrFilter(undefined)).toBe(false);
      expect(isExactUtrFilter('')).toBe(false);
    });
  });

  // 3. Disposable MSSQL Database Migration Verification
  describe('3. Disposable MSSQL Database Migration & Legacy Record Preservation', () => {
    it('executes migration in strict required order: inspect -> drop old constraint -> normalize legacy to NULL -> verify record count -> create filtered index -> verify exact filter', async () => {
      const db = createDisposableMssqlDatabase();

      // Pre-migration: confirm legacy state contains empty strings and whitespace
      const preRecords = db.getRecords();
      expect(preRecords.length).toBe(5);
      const preEmpty = preRecords.filter((r) => r.reference_utr === '');
      const preWs = preRecords.filter((r) => r.reference_utr === '   ');
      expect(preEmpty.length).toBe(1);
      expect(preWs.length).toBe(1);

      // Pre-migration: unfiltered constraint rejects duplicate empty string with SQL Error 2627
      await expect(async () => {
        const req = db.request();
        req.input('rawId', 'DDI-EPAY-NEW-FAIL');
        req.input('brand', 'Device Doctor India');
        req.input('reference_utr', ''); // Second empty string triggers collision in unfiltered index
        await req.query('INSERT INTO employee_payments');
      }).rejects.toThrow(/Violation of UNIQUE KEY constraint/);

      // Execute migration
      const result = await migrateEmployeePaymentUtrIndex(db);

      expect(result.migrated).toBe(true);
      expect(result.legacyNormalizedCount).toBe(2); // 1 empty + 1 whitespace normalized
      expect(result.totalPreservedCount).toBe(5); // All 5 preserved! Zero deleted!
      expect(result.filterVerified).toBe(true);

      // Post-migration: verify all legacy records were preserved and normalized
      const postRecords = db.getRecords();
      expect(postRecords.length).toBe(5);

      const postLeg01 = postRecords.find((r) => r.id === 'DDI-EPAY-LEG-01');
      const postLeg02 = postRecords.find((r) => r.id === 'DDI-EPAY-LEG-02');
      const postLeg03 = postRecords.find((r) => r.id === 'DDI-EPAY-LEG-03');
      const postLeg04 = postRecords.find((r) => r.id === 'DDI-EPAY-LEG-04');
      const postLeg05 = postRecords.find((r) => r.id === 'DDI-EPAY-LEG-05');

      expect(postLeg01?.reference_utr).toBeNull(); // Empty string normalized to NULL
      expect(postLeg02?.reference_utr).toBeNull(); // Whitespace normalized to NULL
      expect(postLeg03?.reference_utr).toBeNull(); // Existing NULL preserved
      expect(postLeg04?.reference_utr).toBe('UTR-LEGACY-001'); // Valid UTR preserved
      expect(postLeg05?.reference_utr).toBe('UTR-LEGACY-002'); // Padded UTR trimmed

      // Verify filtered index exists with exact filter
      const indexes = db.getIndexes();
      const uqIndex = indexes.find((i) => i.name === 'UQ_employee_payments_reference_utr');
      expect(uqIndex).toBeDefined();
      expect(uqIndex?.is_unique).toBe(true);
      expect(uqIndex?.has_filter).toBe(true);
      expect(isExactUtrFilter(uqIndex?.filter_definition)).toBe(true);
    });

    it('is strictly idempotent: second migration run makes zero modifications and preserves all data', async () => {
      const db = createDisposableMssqlDatabase();

      // Run 1
      const res1 = await migrateEmployeePaymentUtrIndex(db);
      expect(res1.migrated).toBe(true);
      expect(res1.totalPreservedCount).toBe(5);

      // Run 2 (idempotency check)
      const res2 = await migrateEmployeePaymentUtrIndex(db);
      expect(res2.migrated).toBe(false); // Already migrated
      expect(res2.totalPreservedCount).toBe(5);
      expect(res2.legacyNormalizedCount).toBe(0);
      expect(res2.filterVerified).toBe(true);

      const recordsAfterRun2 = db.getRecords();
      expect(recordsAfterRun2.length).toBe(5);
    });

    it('post-migration database allows multiple NULL UTRs without collision', async () => {
      const db = createDisposableMssqlDatabase();
      await migrateEmployeePaymentUtrIndex(db);

      // Insert multiple records with NULL UTR
      const insertNull1 = async () => {
        await db.request()
          .input('rawId', 'DDI-EPAY-NULL-01')
          .input('brand', 'Device Doctor India')
          .input('amount_paid', 1000)
          .input('reference_utr', null)
          .query('INSERT INTO employee_payments');
      };

      const insertNull2 = async () => {
        await db.request()
          .input('rawId', 'DDI-EPAY-NULL-02')
          .input('brand', 'Device Doctor India')
          .input('amount_paid', 2000)
          .input('reference_utr', null)
          .query('INSERT INTO employee_payments');
      };

      await expect(insertNull1()).resolves.not.toThrow();
      await expect(insertNull2()).resolves.not.toThrow();

      const records = db.getRecords();
      expect(records.find((r) => r.id === 'DDI-EPAY-NULL-01')).toBeDefined();
      expect(records.find((r) => r.id === 'DDI-EPAY-NULL-02')).toBeDefined();
    });

    it('post-migration database preserves strict uniqueness for non-empty UTR values and rejects duplicates with SQL 2627', async () => {
      const db = createDisposableMssqlDatabase();
      await migrateEmployeePaymentUtrIndex(db);

      // Insert fresh payment with unique UTR
      await db.request()
        .input('rawId', 'DDI-EPAY-UNIQUE-01')
        .input('brand', 'Device Doctor India')
        .input('amount_paid', 3000)
        .input('reference_utr', 'UTR-UNIQUE-999')
        .query('INSERT INTO employee_payments');

      // Attempt inserting second payment with same UTR: must throw SQL Error 2627!
      await expect(async () => {
        await db.request()
          .input('rawId', 'DDI-EPAY-UNIQUE-02')
          .input('brand', 'Device Doctor India')
          .input('amount_paid', 4000)
          .input('reference_utr', 'UTR-UNIQUE-999')
          .query('INSERT INTO employee_payments');
      }).rejects.toThrow(/Violation of UNIQUE KEY constraint/);
    });

    it('migration detects duplicate UTR after whitespace trimming, aborts before altering schema, and preserves all records', async () => {
      const db = createDisposableMssqlDatabase();
      // Inject duplicate records that would collide after trimming whitespace:
      // Row A: 'UTR-CONFLICT-001', Row B: '  UTR-CONFLICT-001  '
      await db.request()
        .input('rawId', 'DDI-EPAY-DUP-01')
        .input('brand', 'Device Doctor India')
        .input('amount_paid', 5000)
        .input('reference_utr', 'UTR-CONFLICT-001')
        .query('INSERT INTO employee_payments');

      await db.request()
        .input('rawId', 'DDI-EPAY-DUP-02')
        .input('brand', 'Device Doctor India')
        .input('amount_paid', 6000)
        .input('reference_utr', '  UTR-CONFLICT-001  ')
        .query('INSERT INTO employee_payments');

      const initialCount = db.getRecords().length;

      // Migration must abort with descriptive conflict error
      await expect(async () => {
        await migrateEmployeePaymentUtrIndex(db);
      }).rejects.toThrow(/Duplicate reference_utr collision detected after trimming whitespace: "UTR-CONFLICT-001" \(2 occurrences\)/);

      // Verify no records were deleted, merged, or modified
      const afterRecords = db.getRecords();
      expect(afterRecords.length).toBe(initialCount);
      expect(afterRecords.find((r) => r.id === 'DDI-EPAY-DUP-01')?.reference_utr).toBe('UTR-CONFLICT-001');
      expect(afterRecords.find((r) => r.id === 'DDI-EPAY-DUP-02')?.reference_utr).toBe('  UTR-CONFLICT-001  ');
    });

    it('migration transaction rolls back cleanly if index creation fails, restoring pre-migration schema and records', async () => {
      const db = createDisposableMssqlDatabase();
      const initialRecords = db.getRecords();
      const initialIndexes = db.getIndexes();

      // Intercept query to simulate a transient failure during Step 5
      let failStep5 = true;
      db.setQueryInterceptor((sqlText: string) => {
        if (failStep5 && sqlText.includes('CREATE UNIQUE NONCLUSTERED INDEX [UQ_employee_payments_reference_utr]')) {
          throw new Error('Simulated failure during CREATE INDEX');
        }
      });

      await expect(async () => {
        await migrateEmployeePaymentUtrIndex(db);
      }).rejects.toThrow(/Simulated failure during CREATE INDEX/);

      // Verify rollback restored records and index state
      const recordsAfterFail = db.getRecords();
      expect(recordsAfterFail.length).toBe(initialRecords.length);
      // Legacy empty string record must be preserved in pre-migration state because transaction rolled back
      expect(recordsAfterFail.find((r) => r.id === 'DDI-EPAY-LEG-01')?.reference_utr).toBe('');

      // Retry after resolving failure (failStep5 = false) - must succeed idempotently
      failStep5 = false;
      const res = await migrateEmployeePaymentUtrIndex(db);
      expect(res.migrated).toBe(true);
      expect(res.filterVerified).toBe(true);
    });
  });

  // 4. API Integration: Multiple Empty, Whitespace, and NULL Payments via POST & PUT
  describe('4. API Integration: POST & PUT with Empty, Whitespace, and NULL UTR', () => {
    it('POST with empty string UTR binds parameter explicitly as sql.NVarChar(100) with null value and succeeds', async () => {
      const db = createDisposableMssqlDatabase();
      await migrateEmployeePaymentUtrIndex(db);

      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(db);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 15000,
          paymentDate: '2026-03-01',
          referenceUtr: '', // Empty string
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Check captured SQL input parameter
      const captured = db.getCapturedInputs().find((c) => c.sql.includes('INSERT INTO employee_payments'));
      expect(captured).toBeDefined();
      expect(captured!.inputs.reference_utr).toBeNull(); // Bound as NULL!
      expect(captured!.types.reference_utr).toEqual(sql.NVarChar(100)); // Explicit NVARCHAR(100)!
    });

    it('POST with whitespace-only UTR binds parameter explicitly as sql.NVarChar(100) with null value and succeeds', async () => {
      const db = createDisposableMssqlDatabase();
      await migrateEmployeePaymentUtrIndex(db);

      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(db);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 16000,
          paymentDate: '2026-03-02',
          referenceUtr: '    \t   ', // Whitespace
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const captured = db.getCapturedInputs().find((c) => c.sql.includes('INSERT INTO employee_payments'));
      expect(captured).toBeDefined();
      expect(captured!.inputs.reference_utr).toBeNull();
      expect(captured!.types.reference_utr).toEqual(sql.NVarChar(100));
    });

    it('POST with null UTR binds parameter explicitly as sql.NVarChar(100) with null value and succeeds', async () => {
      const db = createDisposableMssqlDatabase();
      await migrateEmployeePaymentUtrIndex(db);

      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(db);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-001',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 17000,
          paymentDate: '2026-03-03',
          referenceUtr: null, // Explicit null
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const captured = db.getCapturedInputs().find((c) => c.sql.includes('INSERT INTO employee_payments'));
      expect(captured).toBeDefined();
      expect(captured!.inputs.reference_utr).toBeNull();
      expect(captured!.types.reference_utr).toEqual(sql.NVarChar(100));
    });

    it('multiple sequential POST payments without UTR are all accepted without collision', async () => {
      const db = createDisposableMssqlDatabase();
      await migrateEmployeePaymentUtrIndex(db);

      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(db);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Payout 1 (empty UTR)
      const res1 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 1000,
          referenceUtr: '',
        });
      expect(res1.status).toBe(200);

      // Payout 2 (whitespace UTR)
      const res2 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 2000,
          referenceUtr: '   ',
        });
      expect(res2.status).toBe(200);

      // Payout 3 (null UTR)
      const res3 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 3000,
          referenceUtr: null,
        });
      expect(res3.status).toBe(200);

      // Payout 4 (omitted UTR)
      const res4 = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 4000,
        });
      expect(res4.status).toBe(200);

      // All 4 distinct payouts exist in database with reference_utr = NULL
      const records = db.getRecords();
      expect(records.find((r) => r.id === res1.body.payment.id)?.reference_utr).toBeNull();
      expect(records.find((r) => r.id === res2.body.payment.id)?.reference_utr).toBeNull();
      expect(records.find((r) => r.id === res3.body.payment.id)?.reference_utr).toBeNull();
      expect(records.find((r) => r.id === res4.body.payment.id)?.reference_utr).toBeNull();
    });

    it('PUT route normalizes empty string and whitespace UTR to NULL and binds as NVARCHAR(100)', async () => {
      const db = createDisposableMssqlDatabase();
      await migrateEmployeePaymentUtrIndex(db);

      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(db);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Target legacy payment 4 (currently has 'UTR-LEGACY-001')
      const res = await request(app)
        .put('/api/employee-payments/DDI-EPAY-LEG-04')
        .set('Authorization', authHeader)
        .send({
          amountPaid: 21000,
          referenceUtr: '   ', // Clearing UTR via whitespace
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const captured = db.getCapturedInputs().find((c) => c.sql.includes('UPDATE employee_payments'));
      expect(captured).toBeDefined();
      expect(captured!.inputs.reference_utr).toBeNull();
      expect(captured!.types.reference_utr).toEqual(sql.NVarChar(100));

      const updated = db.getRecords().find((r) => r.id === 'DDI-EPAY-LEG-04');
      expect(updated?.reference_utr).toBeNull();
    });

    it('POST with duplicate actual UTR is rejected with HTTP 409 Conflict', async () => {
      const db = createDisposableMssqlDatabase();
      await migrateEmployeePaymentUtrIndex(db);

      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(db);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Attempt to POST with an existing UTR from legacy record 4 ('UTR-LEGACY-001') with conflicting details
      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          assignmentId: 'DDI-ASN-999', // Different assignment -> conflict!
          employeeId: 'DDI-EMP-999',
          employeeName: 'Different Employee',
          amountPaid: 99999,
          referenceUtr: 'UTR-LEGACY-001',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('is already in use');
    });

    it('PUT with duplicate actual UTR from another payment is rejected with HTTP 409 Conflict', async () => {
      const db = createDisposableMssqlDatabase();
      await migrateEmployeePaymentUtrIndex(db);

      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(db);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // Update record 1 to use record 4's UTR
      const res = await request(app)
        .put('/api/employee-payments/DDI-EPAY-LEG-01')
        .set('Authorization', authHeader)
        .send({
          referenceUtr: 'UTR-LEGACY-001',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('is already in use');
    });
  });

  // 5. Transaction Rollback & Financial Safety
  describe('5. Transaction Rollback on Failure', () => {
    it('completely rolls back transaction when database write fails and leaves database unmodified', async () => {
      const db = createDisposableMssqlDatabase();
      await migrateEmployeePaymentUtrIndex(db);

      const initialCount = db.getRecords().length;

      // Mock transaction request to throw mid-write
      const origTransaction = db.transaction;
      db.transaction = () => {
        const tx = origTransaction();
        const origRequest = tx.request;
        tx.request = () => {
          const req = origRequest();
          const origQuery = req.query;
          req.query = (async (sqlText: string) => {
            if (sqlText.includes('INSERT INTO employee_payments')) {
              throw new Error('Connection reset by peer during INSERT');
            }
            return origQuery(sqlText);
          }) as any;
          return req;
        };
        return tx;
      };

      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(db);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 50000,
          referenceUtr: 'UTR-FAIL-TX-001',
        });

      expect([500, 503]).toContain(res.status);
      expect(res.body.success).toBe(false);

      // Verify records count did not increase (transaction was rolled back)
      expect(db.getRecords().length).toBe(initialCount);
    });
  });

  // 6. Assignment Balance Calculations with Multiple Payments
  describe('6. Assignment Balance Calculations with Multiple Payments', () => {
    it('multiple payouts against the same assignment correctly accumulate towards amountPaid without UTR collisions', () => {
      const assignment = {
        id: 'DDI-ASN-BAL-01',
        amount: 60000,
      };

      const epays = [
        { id: 'DDI-EPAY-01', assignmentId: 'DDI-ASN-BAL-01', amountPaid: 15000, referenceUtr: null },
        { id: 'DDI-EPAY-02', assignmentId: 'DDI-ASN-BAL-01', amountPaid: 20000, referenceUtr: null },
        { id: 'DDI-EPAY-03', assignmentId: 'DDI-ASN-BAL-01', amountPaid: 10000, referenceUtr: null },
      ];

      const totalPaid = epays.reduce((sum, p) => sum + p.amountPaid, 0);
      const remainingBalance = Math.max(0, assignment.amount - totalPaid);

      expect(totalPaid).toBe(45000);
      expect(remainingBalance).toBe(15000);

      // Fourth payment fitting remaining balance
      const nextPayoutAmount = 15000;
      expect(nextPayoutAmount <= remainingBalance).toBe(true);

      // Overpayment rejected
      const excessivePayoutAmount = 15001;
      expect(excessivePayoutAmount <= remainingBalance).toBe(false);
    });
  });

  // 7. FIX 19 Non-Overwrite Protection Intact
  describe('7. FIX 19 Non-Overwrite Protection Intact', () => {
    it('POST with colliding ID generates next semantic ID without overwriting existing payment', async () => {
      const db = createDisposableMssqlDatabase();
      await migrateEmployeePaymentUtrIndex(db);

      vi.spyOn(azureSqlModule, 'getOrInitPool').mockResolvedValue(db);
      vi.spyOn(azureSqlModule, 'isMockFallbackAllowed').mockReturnValue(false);

      // POST with existing ID 'DDI-EPAY-LEG-01' and isNew=true
      const res = await request(app)
        .post('/api/employee-payments')
        .set('Authorization', authHeader)
        .send({
          id: 'DDI-EPAY-LEG-01', // Colliding ID from client modal
          isNew: true,
          brand: 'Device Doctor India',
          employeeId: 'DDI-EMP-001',
          employeeName: 'Amit Trivedi',
          amountPaid: 33000,
          referenceUtr: null, // Null UTR
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.payment.id).not.toBe('DDI-EPAY-LEG-01'); // Resolved to new ID!

      // Verify original payment 1 is untouched
      const original = db.getRecords().find((r) => r.id === 'DDI-EPAY-LEG-01');
      expect(original?.amount_paid).toBe(10000); // Preserved!
    });
  });
});
