-- ==============================================================================
-- READ-ONLY AUDIT REPORT: Payments Missing GST Invoices
-- Target: Real Azure SQL Database (payments, gst_invoices, clients, bank_accounts)
--
-- Filters:
--   1. payment_mode = 'GST Invoice'
--   2. payment_status = 'Received' (Strictly skips 'Pending' payments)
--   3. No matching row exists in gst_invoices
--
-- Features:
--   - Safe date parsing for VARCHAR / DATE formats.
--   - Indian Financial Year (FY) calculation (April 1 to March 31).
--   - Schema-safe client and bank account name resolution.
--   - 100% READ-ONLY (No INSERT, UPDATE, or DELETE operations).
-- ==============================================================================

SELECT 
    CAST(p.id AS NVARCHAR(150)) AS payment_id,
    ISNULL(CAST(p.payment_id_code AS NVARCHAR(150)), '') AS payment_id_code,
    p.brand,
    p.payment_date,
    -- Safe Indian Financial Year (FY) derivation (April 1 to March 31)
    CASE 
      WHEN TRY_CAST(p.payment_date AS DATE) IS NOT NULL THEN
        CASE 
          WHEN MONTH(TRY_CAST(p.payment_date AS DATE)) >= 4 
          THEN 'FY ' + CAST(YEAR(TRY_CAST(p.payment_date AS DATE)) AS NVARCHAR(4)) + '-' + RIGHT(CAST(YEAR(TRY_CAST(p.payment_date AS DATE)) + 1 AS NVARCHAR(4)), 2)
          ELSE 'FY ' + CAST(YEAR(TRY_CAST(p.payment_date AS DATE)) - 1 AS NVARCHAR(4)) + '-' + RIGHT(CAST(YEAR(TRY_CAST(p.payment_date AS DATE)) AS NVARCHAR(4)), 2)
        END
      WHEN p.payment_date LIKE '[1-2][0-9][0-9][0-9]%' THEN
        'FY ' + SUBSTRING(p.payment_date, 1, 4)
      ELSE 'Unknown FY'
    END AS indian_financial_year,
    p.payment_status,
    p.payment_mode,
    p.currency,
    p.amount_received,
    p.exchange_rate,
    p.amount_inr,
    -- App standard GST calculation: 18% output tax on amount_inr
    ROUND(ISNULL(p.amount_inr, ISNULL(p.amount_received, 0)) * 0.18, 0) AS calculated_gst_amount_inr,
    COALESCE(NULLIF(p.client_name, ''), c.name, 'Client') AS client_name,
    CAST(p.client_id AS NVARCHAR(150)) AS client_id,
    CAST(p.project_id AS NVARCHAR(150)) AS project_id,
    COALESCE(NULLIF(p.bank_account_name, ''), b.account_name, '') AS bank_account_name,
    CAST(p.bank_account_id AS NVARCHAR(150)) AS bank_account_id,
    p.reference_utr,
    p.notes,
    p.created_at
FROM payments p
LEFT JOIN clients c 
  ON CAST(c.id AS NVARCHAR(150)) = CAST(p.client_id AS NVARCHAR(150))
  OR (c.client_id_code IS NOT NULL AND CAST(c.client_id_code AS NVARCHAR(150)) = CAST(p.client_id AS NVARCHAR(150)))
LEFT JOIN bank_accounts b
  ON CAST(b.id AS NVARCHAR(150)) = CAST(p.bank_account_id AS NVARCHAR(150))
  OR (b.bank_account_id_code IS NOT NULL AND CAST(b.bank_account_id_code AS NVARCHAR(150)) = CAST(p.bank_account_id AS NVARCHAR(150)))
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
