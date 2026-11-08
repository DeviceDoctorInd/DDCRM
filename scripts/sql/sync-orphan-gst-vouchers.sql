-- ==============================================================================
-- Migration Script: Dynamic Synchronization of Missing GST Invoices
-- Target: Real Azure SQL Database (Payments & GST Invoices)
--
-- Safety Features:
-- 1. DRY-RUN MODE BY DEFAULT (@dryRun = 1): Only prints actions, never commits.
-- 2. NO INVENTED INVOICE NUMBERS: invoice_number is set to 'PENDING-ASSIGNMENT'.
-- 3. NO FAKE GUIDs: If parent project/client/payment GUID cannot be resolved,
--    the payment is SKIPPED with a descriptive warning.
-- 4. READ-FROM-REAL-DATA: All amounts, dates, and client details read from payments.
-- 5. SKIP PENDING: Strictly processes payment_status = 'Received'.
-- 6. GST LOGIC: Consistent with app (18% GST on amount_inr, no CGST/SGST breakdown).
--
-- DO NOT EXECUTE AUTOMATICALLY. Review first. Run with @dryRun = 1 to test.
-- ==============================================================================

SET XACT_ABORT ON;

-- >>> CONFIGURATION: Set to 0 to perform real insert and commit <<<
DECLARE @dryRun BIT = 1; 

BEGIN TRY
  BEGIN TRANSACTION;

    PRINT '====================================================================';
    IF @dryRun = 1
      PRINT '*** RUNNING IN DRY-RUN MODE (@dryRun = 1) - NO CHANGES WILL BE SAVED ***';
    ELSE
      PRINT '*** RUNNING IN LIVE COMMIT MODE (@dryRun = 0) - WRITES WILL BE COMMITTED ***';
    PRINT '====================================================================';

    -- 1. Inspect sys.columns for gst_invoices to detect UNIQUEIDENTIFIER vs NVARCHAR
    DECLARE @isGstIdGuid BIT = 0;
    DECLARE @isGstPayIdGuid BIT = 0;
    DECLARE @isGstProjIdGuid BIT = 0;
    DECLARE @isGstClientIdGuid BIT = 0;

    SELECT @isGstIdGuid = CASE WHEN TYPE_NAME(c.system_type_id) = 'uniqueidentifier' THEN 1 ELSE 0 END
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('gst_invoices') AND c.name = 'id';

    SELECT @isGstPayIdGuid = CASE WHEN TYPE_NAME(c.system_type_id) = 'uniqueidentifier' THEN 1 ELSE 0 END
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('gst_invoices') AND c.name = 'payment_id';

    SELECT @isGstProjIdGuid = CASE WHEN TYPE_NAME(c.system_type_id) = 'uniqueidentifier' THEN 1 ELSE 0 END
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('gst_invoices') AND c.name = 'project_id';

    SELECT @isGstClientIdGuid = CASE WHEN TYPE_NAME(c.system_type_id) = 'uniqueidentifier' THEN 1 ELSE 0 END
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('gst_invoices') AND c.name = 'client_id';

    PRINT 'Schema detection complete:';
    PRINT ' - gst_invoices.id is UNIQUEIDENTIFIER: ' + CAST(@isGstIdGuid AS NVARCHAR(10));
    PRINT ' - gst_invoices.payment_id is UNIQUEIDENTIFIER: ' + CAST(@isGstPayIdGuid AS NVARCHAR(10));
    PRINT ' - gst_invoices.project_id is UNIQUEIDENTIFIER: ' + CAST(@isGstProjIdGuid AS NVARCHAR(10));
    PRINT ' - gst_invoices.client_id is UNIQUEIDENTIFIER: ' + CAST(@isGstClientIdGuid AS NVARCHAR(10));

    -- 2. Populate temporary work table from real payments table
    IF OBJECT_ID('tempdb..#OrphanPaymentsToSync') IS NOT NULL 
      DROP TABLE #OrphanPaymentsToSync;

    CREATE TABLE #OrphanPaymentsToSync (
      seq_id INT IDENTITY(1,1) PRIMARY KEY,
      payment_id_str NVARCHAR(150),
      payment_id_code NVARCHAR(150),
      brand NVARCHAR(100),
      brand_prefix NVARCHAR(20),
      project_id_str NVARCHAR(150),
      client_id_str NVARCHAR(150),
      client_name NVARCHAR(255),
      payment_date NVARCHAR(50),
      amount_received DECIMAL(18,2),
      currency NVARCHAR(20),
      amount_inr DECIMAL(18,2),
      gst_amount_inr DECIMAL(18,2),
      notes NVARCHAR(MAX)
    );

    INSERT INTO #OrphanPaymentsToSync (
      payment_id_str,
      payment_id_code,
      brand,
      brand_prefix,
      project_id_str,
      client_id_str,
      client_name,
      payment_date,
      amount_received,
      currency,
      amount_inr,
      gst_amount_inr,
      notes
    )
    SELECT 
      CAST(p.id AS NVARCHAR(150)),
      ISNULL(CAST(p.payment_id_code AS NVARCHAR(150)), ''),
      ISNULL(p.brand, 'Device Doctor India'),
      CASE 
        WHEN p.brand = 'Device Doctor India' THEN 'DDI'
        WHEN p.brand = 'Codestro' THEN 'CDS'
        WHEN p.brand = 'FX Launch Pad' THEN 'FXL'
        WHEN p.brand = 'DUNS' THEN 'DUNS'
        ELSE 'DDI'
      END,
      CAST(p.project_id AS NVARCHAR(150)),
      CAST(p.client_id AS NVARCHAR(150)),
      COALESCE(NULLIF(p.client_name, ''), 'Client'),
      ISNULL(p.payment_date, CONVERT(NVARCHAR(10), GETUTCDATE(), 23)),
      ISNULL(p.amount_received, 0),
      ISNULL(p.currency, 'INR'),
      ISNULL(p.amount_inr, ISNULL(p.amount_received, 0)),
      -- Real app logic: 18% output tax on amount_inr (Math.round(amountINR * 0.18))
      ROUND(ISNULL(p.amount_inr, ISNULL(p.amount_received, 0)) * 0.18, 0),
      ISNULL(p.notes, '')
    FROM payments p
    WHERE LOWER(LTRIM(RTRIM(p.payment_mode))) = 'gst invoice'
      AND LOWER(LTRIM(RTRIM(p.payment_status))) = 'received' -- Strictly skip Pending
      AND NOT EXISTS (
        SELECT 1 
        FROM gst_invoices g
        WHERE CAST(g.payment_id AS NVARCHAR(150)) = CAST(p.id AS NVARCHAR(150))
           OR (
                p.payment_id_code IS NOT NULL 
                AND LTRIM(RTRIM(CAST(p.payment_id_code AS NVARCHAR(150)))) <> '' 
                AND CAST(g.payment_id AS NVARCHAR(150)) = CAST(p.payment_id_code AS NVARCHAR(150))
              )
      )
    ORDER BY p.brand, p.payment_date, p.created_at;

    DECLARE @totalOrphans INT = 0;
    SELECT @totalOrphans = COUNT(*) FROM #OrphanPaymentsToSync;
    PRINT 'Total real orphan Received GST payments identified: ' + CAST(@totalOrphans AS NVARCHAR(10));

    IF @totalOrphans = 0
    BEGIN
      PRINT 'No orphan payments found. Database is already fully synchronized.';
      IF @@TRANCOUNT > 0 COMMIT TRANSACTION;
      RETURN;
    END;

    -- 3. Dynamic Loop to process each real payment record
    DECLARE @currentSeq INT = 1;
    DECLARE @processedCount INT = 0;
    DECLARE @skippedCount INT = 0;
    DECLARE @now NVARCHAR(50) = CONVERT(NVARCHAR(50), GETUTCDATE(), 127) + 'Z';

    WHILE @currentSeq <= @totalOrphans
    BEGIN
      DECLARE @payIdStr NVARCHAR(150);
      DECLARE @payIdCode NVARCHAR(150);
      DECLARE @brand NVARCHAR(100);
      DECLARE @brandPrefix NVARCHAR(20);
      DECLARE @projIdStr NVARCHAR(150);
      DECLARE @cliIdStr NVARCHAR(150);
      DECLARE @cliName NVARCHAR(255);
      DECLARE @payDate NVARCHAR(50);
      DECLARE @amtRec DECIMAL(18,2);
      DECLARE @curr NVARCHAR(20);
      DECLARE @amtInr DECIMAL(18,2);
      DECLARE @gstAmtInr DECIMAL(18,2);
      DECLARE @notes NVARCHAR(MAX);

      SELECT 
        @payIdStr = payment_id_str,
        @payIdCode = payment_id_code,
        @brand = brand,
        @brandPrefix = brand_prefix,
        @projIdStr = project_id_str,
        @cliIdStr = client_id_str,
        @cliName = client_name,
        @payDate = payment_date,
        @amtRec = amount_received,
        @curr = currency,
        @amtInr = amount_inr,
        @gstAmtInr = gst_amount_inr,
        @notes = notes
      FROM #OrphanPaymentsToSync
      WHERE seq_id = @currentSeq;

      -- Check parent resolution without fake GUIDs
      DECLARE @resolvedPayId NVARCHAR(150) = NULL;
      DECLARE @resolvedProjId NVARCHAR(150) = NULL;
      DECLARE @resolvedClientId NVARCHAR(150) = NULL;
      DECLARE @canInsert BIT = 1;

      -- Payment ID resolution
      IF @isGstPayIdGuid = 1
      BEGIN
        SELECT TOP 1 @resolvedPayId = CAST(TRY_CAST(id AS UNIQUEIDENTIFIER) AS NVARCHAR(150))
        FROM payments
        WHERE CAST(id AS NVARCHAR(150)) = @payIdStr OR CAST(payment_id_code AS NVARCHAR(150)) = @payIdStr;

        IF @resolvedPayId IS NULL
        BEGIN
          PRINT 'WARNING: Skipped Payment [' + COALESCE(NULLIF(@payIdCode, ''), @payIdStr) 
                + '] - gst_invoices.payment_id requires UNIQUEIDENTIFIER but payment row has no valid GUID.';
          SET @canInsert = 0;
        END;
      END
      ELSE
      BEGIN
        SET @resolvedPayId = COALESCE(NULLIF(@payIdCode, ''), @payIdStr);
      END;

      -- Project ID resolution
      IF @canInsert = 1
      BEGIN
        IF @isGstProjIdGuid = 1
        BEGIN
          SELECT TOP 1 @resolvedProjId = CAST(TRY_CAST(id AS UNIQUEIDENTIFIER) AS NVARCHAR(150))
          FROM projects
          WHERE CAST(id AS NVARCHAR(150)) = @projIdStr OR CAST(project_id_code AS NVARCHAR(150)) = @projIdStr;

          IF @resolvedProjId IS NULL AND @projIdStr IS NOT NULL AND @projIdStr <> ''
            SET @resolvedProjId = CAST(TRY_CAST(@projIdStr AS UNIQUEIDENTIFIER) AS NVARCHAR(150));

          IF @resolvedProjId IS NULL AND @projIdStr IS NOT NULL AND @projIdStr <> ''
          BEGIN
            PRINT 'WARNING: Skipped Payment [' + COALESCE(NULLIF(@payIdCode, ''), @payIdStr) 
                  + '] - gst_invoices.project_id requires UNIQUEIDENTIFIER but project [' 
                  + @projIdStr + '] could not be resolved to a valid GUID in projects table.';
            SET @canInsert = 0;
          END;
        END
        ELSE
        BEGIN
          SET @resolvedProjId = @projIdStr;
        END;
      END;

      -- Client ID resolution
      IF @canInsert = 1
      BEGIN
        IF @isGstClientIdGuid = 1
        BEGIN
          SELECT TOP 1 @resolvedClientId = CAST(TRY_CAST(id AS UNIQUEIDENTIFIER) AS NVARCHAR(150))
          FROM clients
          WHERE CAST(id AS NVARCHAR(150)) = @cliIdStr OR CAST(client_id_code AS NVARCHAR(150)) = @cliIdStr;

          IF @resolvedClientId IS NULL AND @cliIdStr IS NOT NULL AND @cliIdStr <> ''
            SET @resolvedClientId = CAST(TRY_CAST(@cliIdStr AS UNIQUEIDENTIFIER) AS NVARCHAR(150));

          IF @resolvedClientId IS NULL AND @cliIdStr IS NOT NULL AND @cliIdStr <> ''
          BEGIN
            PRINT 'WARNING: Skipped Payment [' + COALESCE(NULLIF(@payIdCode, ''), @payIdStr) 
                  + '] - gst_invoices.client_id requires UNIQUEIDENTIFIER but client [' 
                  + @cliIdStr + '] could not be resolved to a valid GUID in clients table.';
            SET @canInsert = 0;
          END;
        END
        ELSE
        BEGIN
          SET @resolvedClientId = @cliIdStr;
        END;
      END;

      -- Process insert or print preview
      IF @canInsert = 1
      BEGIN
        -- Calculate next available sequential GST semantic ID for this brand under lock
        DECLARE @gstPattern NVARCHAR(50) = @brandPrefix + '-GST-%';
        DECLARE @maxGstSeq INT = 0;

        SELECT @maxGstSeq = ISNULL(MAX(
          TRY_CAST(SUBSTRING(
            CASE 
              WHEN CAST(invoice_id_code AS NVARCHAR(150)) LIKE @gstPattern 
              THEN CAST(invoice_id_code AS NVARCHAR(150))
              ELSE CAST(id AS NVARCHAR(150))
            END,
            LEN(@brandPrefix) + 6,
            20
          ) AS INT)
        ), 0)
        FROM gst_invoices WITH (UPDLOCK, HOLDLOCK)
        WHERE CAST(id AS NVARCHAR(150)) LIKE @gstPattern
           OR CAST(invoice_id_code AS NVARCHAR(150)) LIKE @gstPattern;

        DECLARE @assignedGstCode NVARCHAR(150) = @brandPrefix + '-GST-' + RIGHT('000' + CAST((@maxGstSeq + 1) AS NVARCHAR(10)), 3);
        DECLARE @assignedGstGuid UNIQUEIDENTIFIER = NEWID();

        -- Requirement 1: Do NOT invent invoice numbers. Set to 'PENDING-ASSIGNMENT'.
        DECLARE @assignedInvoiceNum NVARCHAR(100) = 'PENDING-ASSIGNMENT';

        DECLARE @autoNotes NVARCHAR(MAX) = 
          'Auto-synced from Payment ' + COALESCE(NULLIF(@payIdCode, ''), @payIdStr) + ' (GST Invoice Mode)'
          + CASE WHEN @notes IS NOT NULL AND LTRIM(RTRIM(@notes)) <> '' THEN '. ' + LTRIM(RTRIM(@notes)) ELSE '' END;

        IF @dryRun = 1
        BEGIN
          PRINT '[DRY-RUN PREVIEW] Would insert GST Voucher [' + @assignedGstCode + ']:'
                + ' Payment=[' + COALESCE(NULLIF(@payIdCode, ''), @payIdStr) + ']'
                + ', Brand=[' + @brand + ']'
                + ', InvoiceNo=[' + @assignedInvoiceNum + ']'
                + ', Date=[' + @payDate + ']'
                + ', AmountINR=[' + CAST(@amtInr AS NVARCHAR(30)) + ']'
                + ', GST_INR=[' + CAST(@gstAmtInr AS NVARCHAR(30)) + ']'
                + ', Client=[' + @cliName + ']'
                + ', ProjId=[' + ISNULL(@resolvedProjId, 'NULL') + ']'
                + ', ClientId=[' + ISNULL(@resolvedClientId, 'NULL') + ']';
          SET @processedCount = @processedCount + 1;
        END
        ELSE
        BEGIN
          INSERT INTO gst_invoices (
            id,
            invoice_id_code,
            brand,
            payment_id,
            project_id,
            client_id,
            client_name,
            payment_date,
            amount_received,
            currency,
            amount_inr,
            gst_amount_inr,
            invoice_number,
            uploaded_to_gst_portal,
            gst_portal_upload_date,
            notes,
            created_at,
            updated_at
          ) VALUES (
            CASE WHEN @isGstIdGuid = 1 THEN CAST(@assignedGstGuid AS NVARCHAR(150)) ELSE @assignedGstCode END,
            @assignedGstCode,
            @brand,
            @resolvedPayId,
            @resolvedProjId,
            @resolvedClientId,
            @cliName,
            @payDate,
            @amtRec,
            @curr,
            @amtInr,
            @gstAmtInr,
            @assignedInvoiceNum,
            'No',
            '',
            @autoNotes,
            @now,
            @now
          );

          PRINT '[COMMITTED] Inserted GST Voucher [' + @assignedGstCode + '] for Payment [' 
                + COALESCE(NULLIF(@payIdCode, ''), @payIdStr) + '], Amount INR [' 
                + CAST(@amtInr AS NVARCHAR(30)) + '], GST INR [' + CAST(@gstAmtInr AS NVARCHAR(30)) + ']';
          SET @processedCount = @processedCount + 1;
        END;
      END
      ELSE
      BEGIN
        SET @skippedCount = @skippedCount + 1;
      END;

      SET @currentSeq = @currentSeq + 1;
    END;

    DROP TABLE #OrphanPaymentsToSync;

    PRINT '====================================================================';
    PRINT 'SUMMARY: Processed = ' + CAST(@processedCount AS NVARCHAR(10)) 
          + ', Skipped = ' + CAST(@skippedCount AS NVARCHAR(10)) 
          + ' of ' + CAST(@totalOrphans AS NVARCHAR(10)) + ' total.';

    IF @dryRun = 1
    BEGIN
      IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
      PRINT '*** DRY-RUN COMPLETE: Transaction safely ROLLED BACK. ZERO rows written to database. ***';
      PRINT 'To execute real writes, edit line 18: set @dryRun = 0; and re-run.';
    END
    ELSE
    BEGIN
      IF @@TRANCOUNT > 0 COMMIT TRANSACTION;
      PRINT '*** LIVE MIGRATION COMMITTED: All valid GST vouchers saved successfully. ***';
    END;
    PRINT '====================================================================';

END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  PRINT 'ERROR occurred during dynamic GST voucher synchronization: ' + ERROR_MESSAGE();
  THROW;
END CATCH;
