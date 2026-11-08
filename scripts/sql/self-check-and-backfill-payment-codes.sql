-- ==============================================================================
-- Self-Check & Safe Backfill: Payments Missing payment_id_code
-- Target Table: payments
-- Purpose: Detect rows where payment_id_code is NULL/empty and backfill them
--          so the ID counter (calculateNextPaymentIdSql) never encounters a collision.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- STEP 1: SELF-CHECK QUERY (Read-Only)
-- Run this query to inspect all payment records currently missing payment_id_code
-- ------------------------------------------------------------------------------
SELECT 
    CAST(p.id AS NVARCHAR(150)) AS id,
    p.payment_id_code,
    p.brand,
    CAST(p.project_id AS NVARCHAR(150)) AS project_id,
    p.client_name,
    p.payment_date,
    p.amount_inr,
    p.payment_mode,
    p.reference_utr,
    p.payment_status,
    p.created_at
FROM payments p
WHERE p.payment_id_code IS NULL 
   OR LTRIM(RTRIM(CAST(p.payment_id_code AS NVARCHAR(150)))) = ''
ORDER BY p.brand, p.created_at;

-- ------------------------------------------------------------------------------
-- STEP 2: SAFE BACKFILL (Idempotent Transaction)
-- Backfills payment_id_code from id for rows where id is already a semantic code
-- (e.g., 'DDI-PAY-001'), and generates sequence codes for any GUID-only records.
-- ------------------------------------------------------------------------------
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

    PRINT 'Starting safe backfill of missing payment_id_code...';

    -- 2a. Direct backfill where id is already in the semantic code format '%-PAY-%'
    UPDATE payments
    SET 
      payment_id_code = CAST(id AS NVARCHAR(150)),
      updated_at = CONVERT(NVARCHAR(50), GETUTCDATE(), 127) + 'Z'
    WHERE (payment_id_code IS NULL OR LTRIM(RTRIM(CAST(payment_id_code AS NVARCHAR(150)))) = '')
      AND (
        CAST(id AS NVARCHAR(150)) LIKE 'DDI-PAY-%'
        OR CAST(id AS NVARCHAR(150)) LIKE 'CDS-PAY-%'
        OR CAST(id AS NVARCHAR(150)) LIKE 'FXL-PAY-%'
        OR CAST(id AS NVARCHAR(150)) LIKE 'DUNS-PAY-%'
      );

    PRINT 'Rows updated from semantic id: ' + CAST(@@ROWCOUNT AS NVARCHAR(10));

    -- 2b. Assign next available sequential code for any remaining GUID-only payments
    -- For 'Device Doctor India'
    WHILE EXISTS (
      SELECT 1 FROM payments 
      WHERE (payment_id_code IS NULL OR LTRIM(RTRIM(CAST(payment_id_code AS NVARCHAR(150)))) = '')
        AND brand = 'Device Doctor India'
    )
    BEGIN
      DECLARE @nextDdiSeq INT = 0;
      SELECT @nextDdiSeq = ISNULL(MAX(
        TRY_CAST(SUBSTRING(
          CASE 
            WHEN CAST(payment_id_code AS NVARCHAR(150)) LIKE 'DDI-PAY-%' THEN CAST(payment_id_code AS NVARCHAR(150))
            ELSE CAST(id AS NVARCHAR(150))
          END,
          LEN('DDI') + 6,
          20
        ) AS INT)
      ), 0)
      FROM payments WITH (UPDLOCK, HOLDLOCK)
      WHERE CAST(id AS NVARCHAR(150)) LIKE 'DDI-PAY-%' OR CAST(payment_id_code AS NVARCHAR(150)) LIKE 'DDI-PAY-%';

      DECLARE @newDdiCode NVARCHAR(50) = 'DDI-PAY-' + RIGHT('000' + CAST((@nextDdiSeq + 1) AS NVARCHAR(10)), 3);

      UPDATE TOP (1) payments
      SET 
        payment_id_code = @newDdiCode,
        updated_at = CONVERT(NVARCHAR(50), GETUTCDATE(), 127) + 'Z'
      WHERE (payment_id_code IS NULL OR LTRIM(RTRIM(CAST(payment_id_code AS NVARCHAR(150)))) = '')
        AND brand = 'Device Doctor India';
    END;

    -- For 'Codestro'
    WHILE EXISTS (
      SELECT 1 FROM payments 
      WHERE (payment_id_code IS NULL OR LTRIM(RTRIM(CAST(payment_id_code AS NVARCHAR(150)))) = '')
        AND brand = 'Codestro'
    )
    BEGIN
      DECLARE @nextCdsSeq INT = 0;
      SELECT @nextCdsSeq = ISNULL(MAX(
        TRY_CAST(SUBSTRING(
          CASE 
            WHEN CAST(payment_id_code AS NVARCHAR(150)) LIKE 'CDS-PAY-%' THEN CAST(payment_id_code AS NVARCHAR(150))
            ELSE CAST(id AS NVARCHAR(150))
          END,
          LEN('CDS') + 6,
          20
        ) AS INT)
      ), 0)
      FROM payments WITH (UPDLOCK, HOLDLOCK)
      WHERE CAST(id AS NVARCHAR(150)) LIKE 'CDS-PAY-%' OR CAST(payment_id_code AS NVARCHAR(150)) LIKE 'CDS-PAY-%';

      DECLARE @newCdsCode NVARCHAR(50) = 'CDS-PAY-' + RIGHT('000' + CAST((@nextCdsSeq + 1) AS NVARCHAR(10)), 3);

      UPDATE TOP (1) payments
      SET 
        payment_id_code = @newCdsCode,
        updated_at = CONVERT(NVARCHAR(50), GETUTCDATE(), 127) + 'Z'
      WHERE (payment_id_code IS NULL OR LTRIM(RTRIM(CAST(payment_id_code AS NVARCHAR(150)))) = '')
        AND brand = 'Codestro';
    END;

  COMMIT TRANSACTION;
  PRINT 'Backfill completed and committed successfully.';
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  PRINT 'ERROR occurred during payment code backfill:';
  PRINT ERROR_MESSAGE();
  THROW;
END CATCH;

-- ------------------------------------------------------------------------------
-- STEP 3: POST-VERIFICATION CHECK
-- Confirms that 0 records have missing payment_id_code
-- ------------------------------------------------------------------------------
SELECT 
    COUNT(*) AS remaining_missing_codes_count
FROM payments
WHERE payment_id_code IS NULL 
   OR LTRIM(RTRIM(CAST(payment_id_code AS NVARCHAR(150)))) = '';
