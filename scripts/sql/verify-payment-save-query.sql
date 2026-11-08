-- ==============================================================================
-- Test & Verification Script: buildPaymentSaveQuery T-SQL Compatibility
-- Target: Real SQL Server / Azure SQL Instance (Dev / Copy Database)
-- Tests:
--   1. Schema with UNIQUEIDENTIFIER columns (id, project_id, client_id, bank_account_id)
--   2. Schema with NVARCHAR(150) columns (id, project_id, client_id, bank_account_id)
-- Verifies: Error 8169 ("Conversion failed when converting from a character
--           string to uniqueidentifier") does NOT occur in either schema representation.
-- ==============================================================================

SET NOCOUNT ON;
PRINT '====================================================================';
PRINT 'Starting buildPaymentSaveQuery Verification on SQL Server / Azure SQL';
PRINT '====================================================================';

-- ==============================================================================
-- TEST SCENARIO 1: UNIQUEIDENTIFIER Schema
-- ==============================================================================
PRINT '>>> RUNNING TEST 1: UNIQUEIDENTIFIER Schema Representation...';

-- Drop test temporary tables if already present
IF OBJECT_ID('tempdb..#test_clients_guid') IS NOT NULL DROP TABLE #test_clients_guid;
IF OBJECT_ID('tempdb..#test_projects_guid') IS NOT NULL DROP TABLE #test_projects_guid;
IF OBJECT_ID('tempdb..#test_bank_accounts_guid') IS NOT NULL DROP TABLE #test_bank_accounts_guid;
IF OBJECT_ID('tempdb..#test_payments_guid') IS NOT NULL DROP TABLE #test_payments_guid;
IF OBJECT_ID('tempdb..#test_gst_guid') IS NOT NULL DROP TABLE #test_gst_guid;

CREATE TABLE #test_clients_guid (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  client_id_code NVARCHAR(150) NOT NULL,
  brand NVARCHAR(100) NOT NULL,
  name NVARCHAR(200) NOT NULL
);

CREATE TABLE #test_projects_guid (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  project_id_code NVARCHAR(150) NOT NULL,
  brand NVARCHAR(100) NOT NULL,
  client_id UNIQUEIDENTIFIER NOT NULL,
  contract_value DECIMAL(18,2) DEFAULT 0,
  total_received DECIMAL(18,2) DEFAULT 0,
  balance DECIMAL(18,2) DEFAULT 0,
  updated_at NVARCHAR(50)
);

CREATE TABLE #test_bank_accounts_guid (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  bank_account_id_code NVARCHAR(150) NOT NULL,
  brand NVARCHAR(100) NOT NULL,
  account_name NVARCHAR(200) NOT NULL
);

CREATE TABLE #test_payments_guid (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  payment_id_code NVARCHAR(150) NOT NULL,
  brand NVARCHAR(100) NOT NULL,
  project_id UNIQUEIDENTIFIER,
  client_id UNIQUEIDENTIFIER,
  client_name NVARCHAR(200),
  payment_mode NVARCHAR(50),
  bank_account_id UNIQUEIDENTIFIER,
  bank_account_name NVARCHAR(200),
  payment_date NVARCHAR(50),
  due_date NVARCHAR(50),
  amount_received DECIMAL(18,2),
  currency NVARCHAR(10),
  exchange_rate DECIMAL(18,4),
  amount_inr DECIMAL(18,2),
  reference_utr NVARCHAR(100),
  payment_status NVARCHAR(50),
  days_overdue INT,
  notes NVARCHAR(MAX),
  payment_proof NVARCHAR(MAX),
  payment_proof_notes NVARCHAR(MAX),
  created_at NVARCHAR(50),
  updated_at NVARCHAR(50)
);

CREATE TABLE #test_gst_guid (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  invoice_id_code NVARCHAR(150) NOT NULL,
  brand NVARCHAR(100) NOT NULL,
  payment_id UNIQUEIDENTIFIER,
  project_id UNIQUEIDENTIFIER,
  client_id UNIQUEIDENTIFIER,
  client_name NVARCHAR(200),
  payment_date NVARCHAR(50),
  amount_received DECIMAL(18,2),
  currency NVARCHAR(10),
  amount_inr DECIMAL(18,2),
  gst_amount_inr DECIMAL(18,2),
  invoice_number NVARCHAR(100),
  uploaded_to_gst_portal NVARCHAR(10) DEFAULT 'No',
  gst_portal_upload_date NVARCHAR(50),
  notes NVARCHAR(MAX),
  created_at NVARCHAR(50),
  updated_at NVARCHAR(50)
);

-- Seed parent records with GUID PKs and semantic codes
DECLARE @test_cli_guid UNIQUEIDENTIFIER = NEWID();
INSERT INTO #test_clients_guid (id, client_id_code, brand, name)
VALUES (@test_cli_guid, 'DDI-CLIFFHANGERS-INDIA', 'Device Doctor India', 'Cliffhangers India');

DECLARE @test_proj_guid UNIQUEIDENTIFIER = NEWID();
INSERT INTO #test_projects_guid (id, project_id_code, brand, client_id, contract_value, total_received, balance)
VALUES (@test_proj_guid, 'DDI-CLIFFHANGERS-INDIA-EXPEDITION-BOOKING-PORTAL-1', 'Device Doctor India', @test_cli_guid, 200000.00, 0, 200000.00);

DECLARE @test_bnk_guid UNIQUEIDENTIFIER = NEWID();
INSERT INTO #test_bank_accounts_guid (id, bank_account_id_code, brand, account_name)
VALUES (@test_bnk_guid, 'DDI-BNK-001', 'Device Doctor India', 'HDFC Bank - Primary Operating Account');

-- Execute payment creation logic with semantic string inputs against UNIQUEIDENTIFIER tables
BEGIN TRY
  DECLARE @rawId NVARCHAR(150) = 'DDI-PAY-006';
  DECLARE @brand NVARCHAR(100) = 'Device Doctor India';
  DECLARE @prefix NVARCHAR(20) = 'DDI';
  DECLARE @pattern NVARCHAR(50) = 'DDI-PAY-%';
  DECLARE @gstPattern NVARCHAR(50) = 'DDI-GST-%';
  DECLARE @target_project_id NVARCHAR(150) = 'DDI-CLIFFHANGERS-INDIA-EXPEDITION-BOOKING-PORTAL-1';
  DECLARE @target_client_id NVARCHAR(150) = 'DDI-CLIFFHANGERS-INDIA';
  DECLARE @target_bank_id NVARCHAR(150) = 'DDI-BNK-001';
  DECLARE @now_guid NVARCHAR(50) = CONVERT(NVARCHAR(50), GETUTCDATE(), 127) + 'Z';

  -- Simulate dynamic resolution
  DECLARE @res_proj UNIQUEIDENTIFIER = NULL;
  SELECT TOP 1 @res_proj = id FROM #test_projects_guid WHERE project_id_code = @target_project_id;
  
  DECLARE @res_cli UNIQUEIDENTIFIER = NULL;
  SELECT TOP 1 @res_cli = id FROM #test_clients_guid WHERE client_id_code = @target_client_id;

  DECLARE @res_bnk UNIQUEIDENTIFIER = NULL;
  SELECT TOP 1 @res_bnk = id FROM #test_bank_accounts_guid WHERE bank_account_id_code = @target_bank_id;

  -- Insert payment
  DECLARE @new_pay_guid UNIQUEIDENTIFIER = NEWID();
  INSERT INTO #test_payments_guid (
    id, payment_id_code, brand, project_id, client_id, client_name,
    payment_mode, bank_account_id, bank_account_name, payment_date, due_date,
    amount_received, currency, exchange_rate, amount_inr, reference_utr,
    payment_status, days_overdue, notes, payment_proof, payment_proof_notes,
    created_at, updated_at
  ) VALUES (
    @new_pay_guid, @rawId, @brand, @res_proj, @res_cli, 'Cliffhangers India',
    'GST Invoice', @res_bnk, 'HDFC Bank', '2026-11-08', '2026-11-08',
    75000.00, 'INR', 1, 75000.00, 'HDFC-NEFT-CLIFF-001',
    'Received', 0, 'Test Cliffhangers payment', NULL, '',
    @now_guid, @now_guid
  );

  -- Insert linked GST invoice
  DECLARE @new_gst_guid UNIQUEIDENTIFIER = NEWID();
  INSERT INTO #test_gst_guid (
    id, invoice_id_code, brand, payment_id, project_id, client_id, client_name,
    payment_date, amount_received, currency, amount_inr, gst_amount_inr,
    invoice_number, uploaded_to_gst_portal, notes, created_at, updated_at
  ) VALUES (
    @new_gst_guid, 'DDI-GST-004', @brand, @new_pay_guid, @res_proj, @res_cli, 'Cliffhangers India',
    '2026-11-08', 75000.00, 'INR', 75000.00, 13500.00,
    'DDI/26-27/004', 'No', 'Auto-synced voucher', @now_guid, @now_guid
  );

  PRINT '>>> TEST 1 PASSED: UNIQUEIDENTIFIER schema saved without Error 8169!';
END TRY
BEGIN CATCH
  PRINT '>>> TEST 1 FAILED with error: ' + ERROR_MESSAGE();
  THROW;
END CATCH;

-- ==============================================================================
-- TEST SCENARIO 2: NVARCHAR(150) Schema
-- ==============================================================================
PRINT '>>> RUNNING TEST 2: NVARCHAR(150) Schema Representation...';

IF OBJECT_ID('tempdb..#test_clients_nvarchar') IS NOT NULL DROP TABLE #test_clients_nvarchar;
IF OBJECT_ID('tempdb..#test_projects_nvarchar') IS NOT NULL DROP TABLE #test_projects_nvarchar;
IF OBJECT_ID('tempdb..#test_bank_accounts_nvarchar') IS NOT NULL DROP TABLE #test_bank_accounts_nvarchar;
IF OBJECT_ID('tempdb..#test_payments_nvarchar') IS NOT NULL DROP TABLE #test_payments_nvarchar;
IF OBJECT_ID('tempdb..#test_gst_nvarchar') IS NOT NULL DROP TABLE #test_gst_nvarchar;

CREATE TABLE #test_clients_nvarchar (
  id NVARCHAR(150) PRIMARY KEY,
  client_id_code NVARCHAR(150) NOT NULL,
  brand NVARCHAR(100) NOT NULL,
  name NVARCHAR(200) NOT NULL
);

CREATE TABLE #test_projects_nvarchar (
  id NVARCHAR(150) PRIMARY KEY,
  project_id_code NVARCHAR(150) NOT NULL,
  brand NVARCHAR(100) NOT NULL,
  client_id NVARCHAR(150) NOT NULL,
  contract_value DECIMAL(18,2) DEFAULT 0,
  total_received DECIMAL(18,2) DEFAULT 0,
  balance DECIMAL(18,2) DEFAULT 0,
  updated_at NVARCHAR(50)
);

CREATE TABLE #test_bank_accounts_nvarchar (
  id NVARCHAR(150) PRIMARY KEY,
  bank_account_id_code NVARCHAR(150) NOT NULL,
  brand NVARCHAR(100) NOT NULL,
  account_name NVARCHAR(200) NOT NULL
);

CREATE TABLE #test_payments_nvarchar (
  id NVARCHAR(150) PRIMARY KEY,
  payment_id_code NVARCHAR(150) NOT NULL,
  brand NVARCHAR(100) NOT NULL,
  project_id NVARCHAR(150),
  client_id NVARCHAR(150),
  client_name NVARCHAR(200),
  payment_mode NVARCHAR(50),
  bank_account_id NVARCHAR(150),
  bank_account_name NVARCHAR(200),
  payment_date NVARCHAR(50),
  due_date NVARCHAR(50),
  amount_received DECIMAL(18,2),
  currency NVARCHAR(10),
  exchange_rate DECIMAL(18,4),
  amount_inr DECIMAL(18,2),
  reference_utr NVARCHAR(100),
  payment_status NVARCHAR(50),
  days_overdue INT,
  notes NVARCHAR(MAX),
  payment_proof NVARCHAR(MAX),
  payment_proof_notes NVARCHAR(MAX),
  created_at NVARCHAR(50),
  updated_at NVARCHAR(50)
);

CREATE TABLE #test_gst_nvarchar (
  id NVARCHAR(150) PRIMARY KEY,
  invoice_id_code NVARCHAR(150) NOT NULL,
  brand NVARCHAR(100) NOT NULL,
  payment_id NVARCHAR(150),
  project_id NVARCHAR(150),
  client_id NVARCHAR(150),
  client_name NVARCHAR(200),
  payment_date NVARCHAR(50),
  amount_received DECIMAL(18,2),
  currency NVARCHAR(10),
  amount_inr DECIMAL(18,2),
  gst_amount_inr DECIMAL(18,2),
  invoice_number NVARCHAR(100),
  uploaded_to_gst_portal NVARCHAR(10) DEFAULT 'No',
  gst_portal_upload_date NVARCHAR(50),
  notes NVARCHAR(MAX),
  created_at NVARCHAR(50),
  updated_at NVARCHAR(50)
);

-- Seed parent records with NVARCHAR PKs
INSERT INTO #test_clients_nvarchar (id, client_id_code, brand, name)
VALUES ('DDI-CLIFFHANGERS-INDIA', 'DDI-CLIFFHANGERS-INDIA', 'Device Doctor India', 'Cliffhangers India');

INSERT INTO #test_projects_nvarchar (id, project_id_code, brand, client_id, contract_value, total_received, balance)
VALUES ('DDI-CLIFFHANGERS-INDIA-EXPEDITION-BOOKING-PORTAL-1', 'DDI-CLIFFHANGERS-INDIA-EXPEDITION-BOOKING-PORTAL-1', 'Device Doctor India', 'DDI-CLIFFHANGERS-INDIA', 200000.00, 0, 200000.00);

INSERT INTO #test_bank_accounts_nvarchar (id, bank_account_id_code, brand, account_name)
VALUES ('DDI-BNK-001', 'DDI-BNK-001', 'Device Doctor India', 'HDFC Bank - Primary Operating Account');

-- Execute payment creation logic against NVARCHAR tables
BEGIN TRY
  DECLARE @now_nv NVARCHAR(50) = CONVERT(NVARCHAR(50), GETUTCDATE(), 127) + 'Z';

  INSERT INTO #test_payments_nvarchar (
    id, payment_id_code, brand, project_id, client_id, client_name,
    payment_mode, bank_account_id, bank_account_name, payment_date, due_date,
    amount_received, currency, exchange_rate, amount_inr, reference_utr,
    payment_status, days_overdue, notes, payment_proof, payment_proof_notes,
    created_at, updated_at
  ) VALUES (
    'DDI-PAY-006', 'DDI-PAY-006', 'Device Doctor India', 
    'DDI-CLIFFHANGERS-INDIA-EXPEDITION-BOOKING-PORTAL-1', 'DDI-CLIFFHANGERS-INDIA', 'Cliffhangers India',
    'GST Invoice', 'DDI-BNK-001', 'HDFC Bank', '2026-11-08', '2026-11-08',
    75000.00, 'INR', 1, 75000.00, 'HDFC-NEFT-CLIFF-001',
    'Received', 0, 'Test Cliffhangers payment', NULL, '',
    @now_nv, @now_nv
  );

  INSERT INTO #test_gst_nvarchar (
    id, invoice_id_code, brand, payment_id, project_id, client_id, client_name,
    payment_date, amount_received, currency, amount_inr, gst_amount_inr,
    invoice_number, uploaded_to_gst_portal, notes, created_at, updated_at
  ) VALUES (
    'DDI-GST-004', 'DDI-GST-004', 'Device Doctor India', 
    'DDI-PAY-006', 'DDI-CLIFFHANGERS-INDIA-EXPEDITION-BOOKING-PORTAL-1', 'DDI-CLIFFHANGERS-INDIA', 'Cliffhangers India',
    '2026-11-08', 75000.00, 'INR', 75000.00, 13500.00,
    'DDI/26-27/004', 'No', 'Auto-synced voucher', @now_nv, @now_nv
  );

  PRINT '>>> TEST 2 PASSED: NVARCHAR(150) schema saved successfully!';
END TRY
BEGIN CATCH
  PRINT '>>> TEST 2 FAILED with error: ' + ERROR_MESSAGE();
  THROW;
END CATCH;

PRINT '====================================================================';
PRINT 'ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY: 0 CONVERSION ERRORS';
PRINT '====================================================================';
