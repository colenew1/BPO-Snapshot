-- PostgreSQL function for high performers query
-- This is more efficient than the JavaScript fallback
-- Run this in your Supabase SQL editor

CREATE OR REPLACE FUNCTION get_high_performers(
  p_year INTEGER DEFAULT 2025,
  p_limit INTEGER DEFAULT 30
)
RETURNS TABLE (
  client TEXT,
  organization TEXT,
  program TEXT,
  amplifai_metric TEXT,
  total_months INTEGER,
  months_above_goal INTEGER,
  pct_above_goal NUMERIC,
  avg_actual NUMERIC,
  avg_goal NUMERIC,
  months_tracked TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mm.client,
    mm.amplifai_org as organization,
    mm.program,
    mm.amplifai_metric,
    COUNT(DISTINCT mm.month || '-' || mm.year)::INTEGER as total_months,
    COUNT(DISTINCT CASE WHEN mm.actual >= mm.goal THEN mm.month || '-' || mm.year END)::INTEGER as months_above_goal,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN mm.actual >= mm.goal THEN mm.month || '-' || mm.year END)::numeric / 
          COUNT(DISTINCT mm.month || '-' || mm.year)::numeric, 1) as pct_above_goal,
    ROUND(AVG(mm.actual)::numeric, 2) as avg_actual,
    ROUND(AVG(mm.goal)::numeric, 2) as avg_goal,
    STRING_AGG(DISTINCT mm.month, ', ' ORDER BY mm.month) as months_tracked
  FROM monthly_metrics mm
  WHERE mm.year = p_year
    AND mm.goal IS NOT NULL
    AND mm.actual IS NOT NULL
    AND mm.amplifai_org IS NOT NULL
    AND mm.amplifai_metric NOT IN ('AHT', 'ACW', 'TRANSFER_RATE', 'AVERAGE HANDLE TIME')
    AND mm.actual BETWEEN mm.goal * 0.3 AND mm.goal * 3
    AND mm.actual >= 1
    AND mm.goal >= 1
    AND mm.id NOT IN (SELECT record_id FROM wonky_data WHERE reviewed = FALSE)
  GROUP BY mm.client, mm.amplifai_org, mm.program, mm.amplifai_metric
  HAVING COUNT(DISTINCT mm.month || '-' || mm.year) >= 4
    AND COUNT(DISTINCT CASE WHEN mm.actual >= mm.goal THEN mm.month || '-' || mm.year END) >= 3
  ORDER BY pct_above_goal DESC, total_months DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission (adjust as needed for your setup)
-- GRANT EXECUTE ON FUNCTION get_high_performers TO authenticated;

