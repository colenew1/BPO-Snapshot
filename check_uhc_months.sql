-- Check what months have data for UHC organization
-- This will show you all months/years that have coaching data for UHC

-- Option 1: Simple month distribution for UHC
SELECT 
    month,
    year,
    COUNT(*) as record_count,
    COUNT(DISTINCT client) as unique_clients,
    COUNT(DISTINCT amplifai_metric) as unique_metrics
FROM behavioral_coaching
WHERE amplifai_org = 'UHC'
GROUP BY month, year
ORDER BY year DESC, 
    CASE month
        WHEN 'Jan' THEN 1
        WHEN 'Feb' THEN 2
        WHEN 'Mar' THEN 3
        WHEN 'Apr' THEN 4
        WHEN 'May' THEN 5
        WHEN 'Jun' THEN 6
        WHEN 'Jul' THEN 7
        WHEN 'Aug' THEN 8
        WHEN 'Sep' THEN 9
        WHEN 'Oct' THEN 10
        WHEN 'Nov' THEN 11
        WHEN 'Dec' THEN 12
    END DESC;

-- Option 2: Just show unique months/years (simpler view - fixed)
SELECT 
    month,
    year,
    COUNT(*) as record_count
FROM behavioral_coaching
WHERE amplifai_org = 'UHC'
GROUP BY month, year
ORDER BY year DESC, 
    CASE month
        WHEN 'Jan' THEN 1
        WHEN 'Feb' THEN 2
        WHEN 'Mar' THEN 3
        WHEN 'Apr' THEN 4
        WHEN 'May' THEN 5
        WHEN 'Jun' THEN 6
        WHEN 'Jul' THEN 7
        WHEN 'Aug' THEN 8
        WHEN 'Sep' THEN 9
        WHEN 'Oct' THEN 10
        WHEN 'Nov' THEN 11
        WHEN 'Dec' THEN 12
    END DESC;

-- Option 3: Show months for a specific year (2025)
SELECT 
    month,
    COUNT(*) as record_count,
    COUNT(DISTINCT client) as unique_clients,
    COUNT(DISTINCT amplifai_metric) as unique_metrics,
    STRING_AGG(DISTINCT amplifai_metric, ', ' ORDER BY amplifai_metric) as metrics_list
FROM behavioral_coaching
WHERE amplifai_org = 'UHC'
    AND year = 2025
GROUP BY month
ORDER BY 
    CASE month
        WHEN 'Jan' THEN 1
        WHEN 'Feb' THEN 2
        WHEN 'Mar' THEN 3
        WHEN 'Apr' THEN 4
        WHEN 'May' THEN 5
        WHEN 'Jun' THEN 6
        WHEN 'Jul' THEN 7
        WHEN 'Aug' THEN 8
        WHEN 'Sep' THEN 9
        WHEN 'Oct' THEN 10
        WHEN 'Nov' THEN 11
        WHEN 'Dec' THEN 12
    END DESC;

-- Option 4: Show sample records by month for UHC in 2025
SELECT 
    month,
    client,
    amplifai_metric,
    metric,
    behavior,
    coaching_count,
    year
FROM behavioral_coaching
WHERE amplifai_org = 'UHC'
    AND year = 2025
ORDER BY 
    CASE month
        WHEN 'Jan' THEN 1
        WHEN 'Feb' THEN 2
        WHEN 'Mar' THEN 3
        WHEN 'Apr' THEN 4
        WHEN 'May' THEN 5
        WHEN 'Jun' THEN 6
        WHEN 'Jul' THEN 7
        WHEN 'Aug' THEN 8
        WHEN 'Sep' THEN 9
        WHEN 'Oct' THEN 10
        WHEN 'Nov' THEN 11
        WHEN 'Dec' THEN 12
    END DESC,
    month,
    client,
    amplifai_metric
    LIMIT 100;

-- Option 5: Check June/July specifically for UHC + Alorica + NPS (to match what you're searching for)
SELECT 
    month,
    client,
    amplifai_org,
    organization,
    amplifai_metric,
    metric,
    COUNT(*) as record_count,
    SUM(coaching_count) as total_coaching_sessions
FROM behavioral_coaching
WHERE (amplifai_org = 'UHC' OR organization = 'UHC' OR organization ILIKE '%UHC%')
    AND year = 2025
    AND month IN ('Jun', 'Jul')
    AND client = 'Alorica'
    AND (amplifai_metric = 'NPS' OR metric ILIKE '%NPS%')
GROUP BY month, client, amplifai_org, organization, amplifai_metric, metric
ORDER BY month, client;

-- Option 6: Check ALL fields to see what's different between June/July and September
SELECT 
    month,
    client,
    amplifai_org,
    organization,
    amplifai_metric,
    metric,
    COUNT(*) as record_count
FROM behavioral_coaching
WHERE year = 2025
    AND month IN ('Jun', 'Jul', 'Sep')
    AND client = 'Alorica'
    AND (amplifai_org = 'UHC' OR organization ILIKE '%UHC%' OR organization = 'UNITED HEALTHCARE')
GROUP BY month, client, amplifai_org, organization, amplifai_metric, metric
ORDER BY month;

-- Option 7: Check if organization field is different (maybe n8n uses organization instead of amplifai_org)
SELECT DISTINCT
    organization,
    amplifai_org,
    COUNT(*) as record_count
FROM behavioral_coaching
WHERE year = 2025
    AND month IN ('Jun', 'Jul')
    AND client = 'Alorica'
    AND (amplifai_org = 'UHC' OR organization ILIKE '%UHC%' OR organization = 'UNITED HEALTHCARE')
GROUP BY organization, amplifai_org;

