import { supabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * Query for high performing programs
 * Finds programs with 4+ months of data where metric is consistently above goal (80%+ of months)
 * Excludes wonky data and "lower is better" metrics
 * 
 * @param {number} year - Year to query (default: 2025)
 * @param {number} limit - Maximum number of results (default: 30)
 * @returns {Promise<Array>} Array of high performer results
 */
export async function getHighPerformers(year = 2025, limit = 30) {
  logger.info(`Querying high performers for year ${year}`);
  
  try {
    // Using Supabase RPC or direct query
    // Since Supabase doesn't support complex SQL directly, we'll use a raw query approach
    // For production, you might want to create a PostgreSQL function/view
    
    const { data, error } = await supabase.rpc('get_high_performers', {
      p_year: year,
      p_limit: limit
    });
    
    if (error) {
      // Fallback to direct query if RPC doesn't exist
      logger.warn('RPC function not found, using direct query');
      return await getHighPerformersDirect(year, limit);
    }
    
    logger.info(`Found ${data?.length || 0} high performers`);
    return data || [];
    
  } catch (error) {
    logger.error('Error querying high performers', error);
    throw error;
  }
}

/**
 * Direct query implementation (fallback)
 * Note: Supabase client has limitations with complex queries.
 * For production, consider creating a PostgreSQL view or function.
 */
async function getHighPerformersDirect(year, limit) {
  // Build query using Supabase filters
  // This is a simplified version - for complex queries, use a PostgreSQL function
  
  let query = supabase
    .from('monthly_metrics')
    .select('*')
    .eq('year', year)
    .not('goal', 'is', null)
    .not('actual', 'is', null)
    .not('amplifai_org', 'is', null)
    .not('amplifai_metric', 'in', '(AHT,ACW,TRANSFER_RATE,AVERAGE HANDLE TIME)')
    .gte('actual', 1)
    .gte('goal', 1);
  
  const { data: allMetrics, error } = await query;
  
  if (error) {
    throw new Error(`Database query failed: ${error.message}`);
  }
  
  // Get wonky data IDs to exclude
  const { data: wonkyData } = await supabase
    .from('wonky_data')
    .select('record_id')
    .eq('reviewed', false);
  
  const wonkyIds = new Set(wonkyData?.map(w => w.record_id) || []);
  
  // Filter out wonky data and group by program/metric
  const filtered = (allMetrics || []).filter(m => 
    !wonkyIds.has(m.id) &&
    m.actual >= m.goal * 0.3 &&
    m.actual <= m.goal * 3
  );
  
  // Group and aggregate
  const grouped = {};
  filtered.forEach(metric => {
    const key = `${metric.client}|${metric.amplifai_org}|${metric.program}|${metric.amplifai_metric}`;
    if (!grouped[key]) {
      grouped[key] = {
        client: metric.client,
        organization: metric.amplifai_org,
        program: metric.program,
        amplifai_metric: metric.amplifai_metric,
        months: new Set(),
        monthsAboveGoal: new Set(),
        actuals: [],
        goals: [],
      };
    }
    
    const monthKey = `${metric.month}-${metric.year}`;
    grouped[key].months.add(monthKey);
    grouped[key].actuals.push(metric.actual);
    grouped[key].goals.push(metric.goal);
    
    if (metric.actual >= metric.goal) {
      grouped[key].monthsAboveGoal.add(monthKey);
    }
  });
  
  // Calculate aggregates and filter
  const results = Object.values(grouped)
    .map(item => {
      const totalMonths = item.months.size;
      const monthsAboveGoal = item.monthsAboveGoal.size;
      const pctAboveGoal = totalMonths > 0 ? (monthsAboveGoal / totalMonths) * 100 : 0;
      
      return {
        client: item.client,
        organization: item.organization,
        program: item.program,
        amplifai_metric: item.amplifai_metric,
        total_months: totalMonths,
        months_above_goal: monthsAboveGoal,
        pct_above_goal: Math.round(pctAboveGoal * 10) / 10,
        avg_actual: Math.round((item.actuals.reduce((a, b) => a + b, 0) / item.actuals.length) * 100) / 100,
        avg_goal: Math.round((item.goals.reduce((a, b) => a + b, 0) / item.goals.length) * 100) / 100,
        months_tracked: Array.from(item.months).map(m => m.split('-')[0]).join(', '),
      };
    })
    .filter(item => 
      item.total_months >= 4 && 
      item.months_above_goal >= 3 &&
      item.pct_above_goal >= 80
    )
    .sort((a, b) => {
      if (b.pct_above_goal !== a.pct_above_goal) {
        return b.pct_above_goal - a.pct_above_goal;
      }
      return b.total_months - a.total_months;
    })
    .slice(0, limit);
  
  logger.info(`Processed ${results.length} high performers after filtering`);
  return results;
}

