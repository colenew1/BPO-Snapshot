-- Diagnostic SQL queries to debug coaching data filtering
-- Run these in your Supabase SQL editor

-- 1. Check what fields exist in behavioral_coaching table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'behavioral_coaching'
ORDER BY ordinal_position;

-- 2. Check sample records from behavioral_coaching for UHC in 2025
SELECT 
  client,
  amplifai_org,
  amplifai_metric,
  metric,
  month,
  year,
  behavior,
  coaching_count,
  COUNT(*) as record_count
FROM behavioral_coaching
WHERE amplifai_org = 'UHC'
  AND year = 2025
GROUP BY client, amplifai_org, amplifai_metric, metric, month, year, behavior, coaching_count
ORDER BY month, client
LIMIT 20;

-- 3. Check what unique values exist for Alorica + UHC + 2025
SELECT DISTINCT
  client,
  amplifai_org,
  amplifai_metric,
  metric,
  month
FROM behavioral_coaching
WHERE client = 'Alorica'
  AND amplifai_org = 'UHC'
  AND year = 2025
ORDER BY month, amplifai_metric;

-- 4. Check for NPS-related metrics (should match when searching for NPS)
SELECT 
  client,
  amplifai_metric,
  metric,
  month,
  SUM(coaching_count) as total_sessions,
  COUNT(*) as behavior_count
FROM behavioral_coaching
WHERE client = 'Alorica'
  AND amplifai_org = 'UHC'
  AND year = 2025
  AND (
    amplifai_metric ILIKE '%NPS%' 
    OR metric ILIKE '%NPS%'
    OR amplifai_metric = 'NPS'
    OR metric = 'NPS'
  )
GROUP BY client, amplifai_metric, metric, month
ORDER BY month;

-- 5. Check June and May data specifically (for Jul vs Jun comparison, coaching should be Jun and May)
SELECT 
  client,
  amplifai_metric,
  metric,
  month,
  behavior,
  SUM(coaching_count) as sessions,
  COUNT(*) as records
FROM behavioral_coaching
WHERE client = 'Alorica'
  AND amplifai_org = 'UHC'
  AND year = 2025
  AND month IN ('Jun', 'May')
GROUP BY client, amplifai_metric, metric, month, behavior
ORDER BY month, sessions DESC;

-- 6. Check if amplifai_metric is NULL or empty
SELECT 
  COUNT(*) as total_records,
  COUNT(amplifai_metric) as has_amplifai_metric,
  COUNT(metric) as has_metric,
  COUNT(CASE WHEN amplifai_metric IS NULL OR amplifai_metric = '' THEN 1 END) as null_amplifai_metric,
  COUNT(CASE WHEN metric IS NULL OR metric = '' THEN 1 END) as null_metric
FROM behavioral_coaching
WHERE client = 'Alorica'
  AND amplifai_org = 'UHC'
  AND year = 2025;

