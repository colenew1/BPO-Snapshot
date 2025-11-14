import { supabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * Replicates the "Parse Data" logic from n8n workflow
 * This is the core calculation logic that must match exactly
 */
export async function processSnapshotData(params) {
  logger.info('Processing snapshot data', params);
  
  // Determine periods
  let currentPeriod, previousPeriod;
  if (params.comparison_type === 'month') {
    currentPeriod = [params.current_month];
    previousPeriod = [params.previous_month];
    logger.info(`Input periods - Current: ${currentPeriod.join(', ')}, Previous: ${previousPeriod.join(', ')}`);
  } else {
    // Quarter mapping
    const quarterMonths = {
      'Q1': ['Jan', 'Feb', 'Mar'],
      'Q2': ['Apr', 'May', 'Jun'],
      'Q3': ['Jul', 'Aug', 'Sep'],
      'Q4': ['Oct', 'Nov', 'Dec']
    };
    currentPeriod = quarterMonths[params.current_quarter];
    previousPeriod = quarterMonths[params.previous_quarter];
  }
  
  // Month shifting logic for coaching (coaching is from previous period)
  const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const shiftMonthBack = (month) => {
    const idx = monthOrder.indexOf(month);
    return idx > 0 ? monthOrder[idx - 1] : monthOrder[11];
  };
  
  // Shift coaching periods back by 1 month
  let currentCoachingPeriod, previousCoachingPeriod;
  
  if (params.comparison_type === 'month') {
    currentCoachingPeriod = currentPeriod.map(shiftMonthBack);
    previousCoachingPeriod = previousPeriod.map(shiftMonthBack);
    logger.info(`Coaching periods (shifted back 1 month) - Current: ${currentCoachingPeriod.join(', ')}, Previous: ${previousCoachingPeriod.join(', ')}`);
  } else {
    currentCoachingPeriod = previousPeriod;
    previousCoachingPeriod = previousPeriod.map(m => {
      const idx = monthOrder.indexOf(m);
      return monthOrder[(idx - 3 + 12) % 12];
    });
  }
  
  // Helper: Check if value is valid
  const isValid = (v) => v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
  
  // Helper function for flexible matching
  const normalizeString = (str) => {
    if (!str) return '';
    return String(str).trim().toUpperCase();
  };
  
  // Normalize month names (handle "Jun" vs "June", etc.)
  const normalizeMonth = (month) => {
    if (!month) return '';
    const m = String(month).trim();
    const monthMap = {
      'JAN': 'JAN', 'JANUARY': 'JAN',
      'FEB': 'FEB', 'FEBRUARY': 'FEB',
      'MAR': 'MAR', 'MARCH': 'MAR',
      'APR': 'APR', 'APRIL': 'APR',
      'MAY': 'MAY',
      'JUN': 'JUN', 'JUNE': 'JUN',
      'JUL': 'JUL', 'JULY': 'JUL',
      'AUG': 'AUG', 'AUGUST': 'AUG',
      'SEP': 'SEP', 'SEPTEMBER': 'SEP',
      'OCT': 'OCT', 'OCTOBER': 'OCT',
      'NOV': 'NOV', 'NOVEMBER': 'NOV',
      'DEC': 'DEC', 'DECEMBER': 'DEC'
    };
    return monthMap[m.toUpperCase()] || m.toUpperCase();
  };
  
  // Fetch monthly metrics
  logger.info(`Fetching monthly_metrics for org: ${params.organization}, year: ${params.year}`);
  const { data: allMonthlyMetrics, error: metricsError } = await supabase
    .from('monthly_metrics')
    .select('*')
    .eq('amplifai_org', params.organization)
    .eq('year', params.year);
  
  if (metricsError) {
    logger.error('Monthly metrics query error:', metricsError);
    throw new Error(`Failed to fetch monthly metrics: ${metricsError.message} (code: ${metricsError.code})`);
  }
  
  logger.info(`Fetched ${allMonthlyMetrics?.length || 0} monthly metrics records`);
  
  // First, test if we can access the behavioral_coaching table at all
  logger.info('Testing access to behavioral_coaching table...');
  const { data: testData, error: testError, count: testCount } = await supabase
    .from('behavioral_coaching')
    .select('*', { count: 'exact', head: true });
  
  if (testError) {
    logger.error('Cannot access behavioral_coaching table:', testError);
    logger.error('Error details:', JSON.stringify(testError, null, 2));
    throw new Error(`Cannot access behavioral_coaching table: ${testError.message} (code: ${testError.code}, hint: ${testError.hint || 'none'})`);
  }
  
  logger.info(`Table access test: Found ${testCount || 0} total records in behavioral_coaching table`);
  
  // Fetch behavioral coaching
  logger.info(`Fetching behavioral_coaching for org: ${params.organization}, year: ${params.year}`);
  const { data: allBehavioralCoaching, error: coachingError } = await supabase
    .from('behavioral_coaching')
    .select('*')
    .eq('amplifai_org', params.organization)
    .eq('year', params.year);
  
  if (coachingError) {
    logger.error('Behavioral coaching query error:', coachingError);
    logger.error('Error details:', JSON.stringify(coachingError, null, 2));
    throw new Error(`Failed to fetch coaching data: ${coachingError.message} (code: ${coachingError.code}, hint: ${coachingError.hint || 'none'})`);
  }
  
  logger.info(`Fetched ${allBehavioralCoaching?.length || 0} total coaching records for ${params.organization} in ${params.year}`);
  
  // If no data returned, check if it's an RLS/permissions issue
  if ((!allMonthlyMetrics || allMonthlyMetrics.length === 0) && (!allBehavioralCoaching || allBehavioralCoaching.length === 0)) {
    logger.warn('No data returned from either table. This might indicate:');
    logger.warn('1. RLS (Row Level Security) policies blocking access');
    logger.warn('2. Need service role key instead of anon key');
    logger.warn('3. No data exists for this org/year combination');
  }
  
  // DEBUG: See what we actually got from database
  if (allBehavioralCoaching && allBehavioralCoaching.length > 0) {
    // Get unique values to see what's available
    const sampleRecord = allBehavioralCoaching[0];
    const uniqueClients = [...new Set(allBehavioralCoaching.map(r => r.client))];
    // Check both amplifai_metric and metric fields
    const uniqueAmplifaiMetrics = [...new Set(allBehavioralCoaching.map(r => r.amplifai_metric).filter(Boolean))];
    const uniqueMetrics = [...new Set(allBehavioralCoaching.map(r => r.metric).filter(Boolean))];
    const uniqueMonths = [...new Set(allBehavioralCoaching.map(r => r.month))];
    
    logger.info('Sample record from DB:', JSON.stringify({
      client: sampleRecord.client,
      amplifai_org: sampleRecord.amplifai_org,
      amplifai_metric: sampleRecord.amplifai_metric,
      metric: sampleRecord.metric,
      month: sampleRecord.month,
      year: sampleRecord.year,
      behavior: sampleRecord.behavior,
      coaching_count: sampleRecord.coaching_count
    }, null, 2));
    
    logger.info('Available values in DB:', {
      clients: uniqueClients,
      amplifai_metrics: uniqueAmplifaiMetrics,
      metrics: uniqueMetrics,
      months: uniqueMonths.sort()
    });
    
    logger.info('Filter criteria:', {
      lookingForClients: params.clients,
      lookingForOrg: params.organization,
      lookingForMetric: params.metric_name,
      lookingForMonths: currentCoachingPeriod,
      lookingForYear: params.year
    });
    
    // Check how many match each filter (using flexible matching)
    const normalizedMetricName = normalizeString(params.metric_name);
    const normalizedCurrentCoachingPeriod = currentCoachingPeriod.map(normalizeMonth);
    
    const clientMatches = allBehavioralCoaching.filter(r => params.clients.includes(r.client)).length;
    const orgMatches = allBehavioralCoaching.filter(r => normalizeString(r.amplifai_org) === normalizeString(params.organization)).length;
    // Check both amplifai_metric and metric field with flexible matching
    const metricMatchesCount = allBehavioralCoaching.filter(r => {
      const amplifaiMatch = normalizeString(r.amplifai_metric) === normalizedMetricName;
      const metricMatch = normalizeString(r.metric) === normalizedMetricName;
      return amplifaiMatch || metricMatch;
    }).length;
    const monthMatches = allBehavioralCoaching.filter(r => {
      const normalizedMonth = normalizeMonth(r.month);
      return normalizedCurrentCoachingPeriod.includes(normalizedMonth);
    }).length;
    
    logger.info('Filter match counts:', {
      clientMatches,
      orgMatches,
      metricMatches: metricMatchesCount,
      monthMatches,
      totalRecords: allBehavioralCoaching.length
    });
    
    // Show first few records that match org but not other filters
    if (metricMatchesCount === 0 && orgMatches > 0) {
      const orgMatched = allBehavioralCoaching.filter(r => r.amplifai_org === params.organization).slice(0, 3);
      logger.warn('Sample records that match org but not metric:', orgMatched.map(r => ({
        client: r.client,
        amplifai_metric: r.amplifai_metric,
        metric: r.metric,
        month: r.month
      })));
    }
  } else {
    logger.warn('No coaching records found in database at all!');
    logger.warn('This could mean:');
    logger.warn('1. RLS policies are blocking access (try SUPABASE_SERVICE_ROLE_KEY)');
    logger.warn('2. No data exists for this org/year');
    logger.warn('3. Database connection issue');
  }
  
  // Filter metrics for current period
  const currentMetrics = (allMonthlyMetrics || []).filter(item => {
    return params.clients.includes(item.client) &&
           item.amplifai_org === params.organization &&
           item.amplifai_metric === params.metric_name &&
           currentPeriod.includes(item.month) &&
           item.year === params.year;
  });
  
  // Filter metrics for previous period
  const previousMetrics = (allMonthlyMetrics || []).filter(item => {
    return params.clients.includes(item.client) &&
           item.amplifai_org === params.organization &&
           item.amplifai_metric === params.metric_name &&
           previousPeriod.includes(item.month) &&
           item.year === params.year;
  });
  
  // Calculate metric averages
  const currentValues = currentMetrics.map(item => item.actual).filter(isValid).map(Number);
  const previousValues = previousMetrics.map(item => item.actual).filter(isValid).map(Number);
  
  const currentAvg = currentValues.length > 0 ? currentValues.reduce((a, b) => a + b, 0) / currentValues.length : null;
  const previousAvg = previousValues.length > 0 ? previousValues.reduce((a, b) => a + b, 0) / previousValues.length : null;
  
  const change = (currentAvg !== null && previousAvg !== null) ? currentAvg - previousAvg : null;
  const percentChange = (change !== null && previousAvg !== 0) ? ((change / previousAvg) * 100).toFixed(2) : null;
  
  // Get unique programs from both current and previous periods
  const allPrograms = new Set([
    ...currentMetrics.map(item => item.program),
    ...previousMetrics.map(item => item.program)
  ].filter(Boolean)); // Filter out null/undefined
  const programsCount = allPrograms.size;
  
  // Helper function for flexible matching
  const normalizeString = (str) => {
    if (!str) return '';
    return String(str).trim().toUpperCase();
  };
  
  // Normalize metric name for comparison (handle whitespace, case)
  const normalizedMetricName = normalizeString(params.metric_name);
  
  // Normalize month names (handle "Jun" vs "June", etc.)
  const normalizeMonth = (month) => {
    if (!month) return '';
    const m = String(month).trim();
    const monthMap = {
      'JAN': 'JAN', 'JANUARY': 'JAN',
      'FEB': 'FEB', 'FEBRUARY': 'FEB',
      'MAR': 'MAR', 'MARCH': 'MAR',
      'APR': 'APR', 'APRIL': 'APR',
      'MAY': 'MAY',
      'JUN': 'JUN', 'JUNE': 'JUN',
      'JUL': 'JUL', 'JULY': 'JUL',
      'AUG': 'AUG', 'AUGUST': 'AUG',
      'SEP': 'SEP', 'SEPTEMBER': 'SEP',
      'OCT': 'OCT', 'OCTOBER': 'OCT',
      'NOV': 'NOV', 'NOVEMBER': 'NOV',
      'DEC': 'DEC', 'DECEMBER': 'DEC'
    };
    return monthMap[m.toUpperCase()] || m.toUpperCase();
  };
  
  const normalizedCurrentCoachingPeriod = currentCoachingPeriod.map(normalizeMonth);
  
  // Filter coaching for SHIFTED current period
  // Use flexible matching: case-insensitive, trimmed, with fallback to metric field
  logger.info(`=== FILTERING CURRENT COACHING ===`);
  logger.info(`Looking for: clients=${JSON.stringify(params.clients)}, org="${params.organization}", metric="${params.metric_name}", months=${JSON.stringify(currentCoachingPeriod)}, year=${params.year}`);
  logger.info(`Total records in database: ${allBehavioralCoaching?.length || 0}`);
  
  // Quick check: how many match just org and year?
  const orgYearMatches = (allBehavioralCoaching || []).filter(r => 
    normalizeString(r.amplifai_org) === normalizeString(params.organization) && 
    r.year === params.year
  ).length;
  logger.info(`Records matching org+year: ${orgYearMatches}`);
  
  // Count matches at each filter stage (initialize outside filter)
  let clientMatches = 0;
  let orgMatches = 0;
  let metricMatches = 0;
  let monthMatches = 0;
  let yearMatches = 0;
  
  const currentCoaching = (allBehavioralCoaching || []).filter(item => {
    const clientMatch = params.clients.includes(item.client);
    if (clientMatch) clientMatches++;
    
    const orgMatch = normalizeString(item.amplifai_org) === normalizeString(params.organization);
    if (orgMatch) orgMatches++;
    
    // Try amplifai_metric first (standardized), then fallback to metric field
    const amplifaiMetricMatch = normalizeString(item.amplifai_metric) === normalizedMetricName;
    const metricFieldMatch = normalizeString(item.metric) === normalizedMetricName;
    const metricMatch = amplifaiMetricMatch || metricFieldMatch;
    if (metricMatch) metricMatches++;
    
    // Month matching: Database uses exact format (Apr, May, Jun, etc.)
    // Try direct match first (most reliable), then normalized as fallback
    const directMonthMatch = currentCoachingPeriod.includes(item.month);
    let monthMatch;
    if (!directMonthMatch) {
      // Fallback to normalized match for variations (Sep vs September, etc.)
      const normalizedItemMonth = normalizeMonth(item.month);
      const normalizedMonthMatch = normalizedCurrentCoachingPeriod.includes(normalizedItemMonth);
      monthMatch = normalizedMonthMatch;
    } else {
      monthMatch = true;
    }
    if (monthMatch) monthMatches++;
    
    const yearMatch = item.year === params.year;
    if (yearMatch) yearMatches++;
    
    // Log first few records that match org/year but fail other filters
    if (orgMatch && yearMatch && (!clientMatch || !metricMatch || !monthMatch) && clientMatches + orgMatches + metricMatches + monthMatches + yearMatches < 10) {
      logger.info(`Record filtered: client=${item.client} (match:${clientMatch}), metric=${item.amplifai_metric || item.metric} (match:${metricMatch}), month=${item.month} (match:${monthMatch})`);
    }
    
    return clientMatch && orgMatch && metricMatch && monthMatch && yearMatch;
  });
  
  logger.info(`Filter breakdown - Client: ${clientMatches}, Org: ${orgMatches}, Metric: ${metricMatches}, Month: ${monthMatches}, Year: ${yearMatches}`);
  logger.info(`Final filtered count: ${currentCoaching.length}`);
  
  logger.info(`Current coaching period: ${currentCoachingPeriod.join(', ')}, found ${currentCoaching.length} records`);
  logger.info(`Normalized current coaching period: ${normalizedCurrentCoachingPeriod.join(', ')}`);
  
  // Log what months are actually in the filtered coaching data
  if (currentCoaching.length > 0) {
    const monthsInResults = [...new Set(currentCoaching.map(r => r.month))];
    const monthCounts = {};
    currentCoaching.forEach(r => {
      monthCounts[r.month] = (monthCounts[r.month] || 0) + 1;
    });
    logger.info(`Months found in current coaching results: ${monthsInResults.join(', ')}`);
    logger.info(`Month distribution: ${Object.entries(monthCounts).map(([m, c]) => `${m}:${c}`).join(', ')}`);
    
    // Warn if we're getting months we didn't expect
    const unexpectedMonths = monthsInResults.filter(m => !currentCoachingPeriod.includes(m));
    if (unexpectedMonths.length > 0) {
      logger.warn(`Unexpected months in results: ${unexpectedMonths.join(', ')}. Expected: ${currentCoachingPeriod.join(', ')}`);
    }
  }
  
  if (currentCoaching.length === 0 && allBehavioralCoaching && allBehavioralCoaching.length > 0) {
    logger.warn('No coaching records matched filters! Check the debug logs above for mismatch reasons.');
    
    // Show what months are available in the database for this org/year/metric
    const availableMonthsForMetric = [...new Set(allBehavioralCoaching
      .filter(r => {
        const orgMatch = normalizeString(r.amplifai_org) === normalizeString(params.organization);
        const yearMatch = r.year === params.year;
        const amplifaiMetricMatch = normalizeString(r.amplifai_metric) === normalizedMetricName;
        const metricFieldMatch = normalizeString(r.metric) === normalizedMetricName;
        return orgMatch && yearMatch && (amplifaiMetricMatch || metricFieldMatch);
      })
      .map(r => r.month))];
    logger.warn(`Available months in DB for ${params.organization}/${params.metric_name}/${params.year}: ${availableMonthsForMetric.sort().join(', ')}`);
    logger.warn(`Looking for months: ${currentCoachingPeriod.join(', ')} (normalized: ${normalizedCurrentCoachingPeriod.join(', ')})`);
    
    // Show sample records that match org/year/metric but not month
    const matchingRecords = allBehavioralCoaching.filter(r => {
      const clientMatch = params.clients.includes(r.client);
      const orgMatch = normalizeString(r.amplifai_org) === normalizeString(params.organization);
      const yearMatch = r.year === params.year;
      const amplifaiMetricMatch = normalizeString(r.amplifai_metric) === normalizedMetricName;
      const metricFieldMatch = normalizeString(r.metric) === normalizedMetricName;
      return clientMatch && orgMatch && yearMatch && (amplifaiMetricMatch || metricFieldMatch);
    });
    
    if (matchingRecords.length > 0) {
      const monthsInMatchingRecords = [...new Set(matchingRecords.map(r => r.month))];
      logger.warn(`Found ${matchingRecords.length} records matching org/year/metric, but with months: ${monthsInMatchingRecords.sort().join(', ')}`);
      logger.warn(`Sample matching record: client=${matchingRecords[0].client}, month=${matchingRecords[0].month}, amplifai_metric=${matchingRecords[0].amplifai_metric}, metric=${matchingRecords[0].metric}`);
    }
  }
  
  // Filter coaching for SHIFTED previous period
  // Use same flexible matching as current period
  const normalizedPreviousCoachingPeriod = previousCoachingPeriod.map(normalizeMonth);
  
  const previousCoaching = (allBehavioralCoaching || []).filter(item => {
    const clientMatch = params.clients.includes(item.client);
    const orgMatch = normalizeString(item.amplifai_org) === normalizeString(params.organization);
    
    // Try amplifai_metric first (standardized), then fallback to metric field
    const amplifaiMetricMatch = normalizeString(item.amplifai_metric) === normalizedMetricName;
    const metricFieldMatch = normalizeString(item.metric) === normalizedMetricName;
    const metricMatch = amplifaiMetricMatch || metricFieldMatch;
    
    // Month matching: Database uses exact format (Apr, May, Jun, etc.)
    // Try direct match first (most reliable), then normalized as fallback
    const directMonthMatch = previousCoachingPeriod.includes(item.month);
    let monthMatch;
    if (!directMonthMatch) {
      // Fallback to normalized match for variations (Sep vs September, etc.)
      const normalizedItemMonth = normalizeMonth(item.month);
      const normalizedMonthMatch = normalizedPreviousCoachingPeriod.includes(normalizedItemMonth);
      monthMatch = normalizedMonthMatch;
      
      // Log month matching details for debugging
      if (clientMatch && orgMatch && metricMatch && yearMatch && !monthMatch) {
        logger.debug(`Previous period month mismatch - Record month: "${item.month}" (normalized: ${normalizedItemMonth}), Looking for: ${previousCoachingPeriod.join(', ')} (normalized: ${normalizedPreviousCoachingPeriod.join(', ')})`);
      }
    } else {
      monthMatch = true;
    }
    const yearMatch = item.year === params.year;
    
    return clientMatch && orgMatch && metricMatch && monthMatch && yearMatch;
  });
  
  logger.info(`Previous coaching period: ${previousCoachingPeriod.join(', ')}, found ${previousCoaching.length} records`);
  logger.info(`Normalized previous coaching period: ${normalizedPreviousCoachingPeriod.join(', ')}`);
  
  // Log what months are actually in the filtered coaching data
  if (previousCoaching.length > 0) {
    const monthsInResults = [...new Set(previousCoaching.map(r => r.month))];
    const normalizedMonthsInResults = [...new Set(previousCoaching.map(r => normalizeMonth(r.month)))];
    logger.info(`Months found in previous coaching results: ${monthsInResults.join(', ')} (normalized: ${normalizedMonthsInResults.join(', ')})`);
  }
  
  if (previousCoaching.length === 0 && allBehavioralCoaching && allBehavioralCoaching.length > 0) {
    logger.warn('No previous period coaching records matched filters!');
    logger.warn(`Looking for months: ${previousCoachingPeriod.join(', ')} (normalized: ${normalizedPreviousCoachingPeriod.join(', ')}), Year: ${params.year}`);
    // Check if those months exist at all
    const availableMonths = [...new Set(allBehavioralCoaching
      .filter(r => {
        const orgMatch = normalizeString(r.amplifai_org) === normalizeString(params.organization);
        const yearMatch = r.year === params.year;
        return orgMatch && yearMatch;
      })
      .map(r => r.month))];
    logger.warn(`Available months in DB for ${params.organization} ${params.year}: ${availableMonths.sort().join(', ')}`);
    
    // Also check what metrics are available for those months
    const availableMetrics = [...new Set(allBehavioralCoaching
      .filter(r => {
        const orgMatch = normalizeString(r.amplifai_org) === normalizeString(params.organization);
        const yearMatch = r.year === params.year;
        const monthMatch = previousCoachingPeriod.map(normalizeMonth).includes(normalizeMonth(r.month));
        return orgMatch && yearMatch && monthMatch;
      })
      .map(r => r.amplifai_metric || r.metric)
      .filter(Boolean))];
    logger.warn(`Available metrics for previous period months: ${availableMetrics.join(', ')}`);
  }
  
  // Calculate coaching summaries
  logger.info(`Processing coaching data - Current: ${currentCoaching.length} records, Previous: ${previousCoaching.length} records`);
  
  // Log sample records to verify coaching_count field
  if (currentCoaching.length > 0) {
    logger.info('Sample current coaching records (first 5):', currentCoaching.slice(0, 5).map(item => ({
      client: item.client,
      month: item.month,
      behavior: item.behavior,
      coaching_count: item.coaching_count,
      coaching_count_type: typeof item.coaching_count,
      amplifai_metric: item.amplifai_metric,
      metric: item.metric
    })));
    
    // Check if coaching_count values are valid
    const validCounts = currentCoaching.filter(item => item.coaching_count != null && item.coaching_count !== undefined && !isNaN(Number(item.coaching_count)));
    const invalidCounts = currentCoaching.length - validCounts.length;
    logger.info(`Coaching count validation - Valid: ${validCounts.length}, Invalid/null: ${invalidCounts}`);
  } else {
    logger.warn('NO CURRENT COACHING RECORDS TO PROCESS!');
  }
  
  if (previousCoaching.length > 0) {
    logger.info('Sample previous coaching records (first 3):', previousCoaching.slice(0, 3).map(item => ({
      client: item.client,
      month: item.month,
      behavior: item.behavior,
      coaching_count: item.coaching_count
    })));
  } else {
    logger.warn('NO PREVIOUS COACHING RECORDS TO PROCESS!');
  }
  
  const currentSessions = currentCoaching.reduce((sum, item) => {
    const count = Number(item.coaching_count) || 0;
    if (count > 0) {
      logger.debug(`Adding to current sessions: ${count} from ${item.behavior} (month: ${item.month})`);
    }
    return sum + count;
  }, 0);
  const previousSessions = previousCoaching.reduce((sum, item) => {
    const count = Number(item.coaching_count) || 0;
    return sum + count;
  }, 0);
  
  logger.info(`Coaching session totals - Current: ${currentSessions} (from ${currentCoaching.length} records), Previous: ${previousSessions} (from ${previousCoaching.length} records)`);
  
  if (currentSessions === 0 && currentCoaching.length > 0) {
    logger.error('WARNING: Current coaching has records but sessions = 0! All coaching_count values might be null/0');
    const counts = currentCoaching.map(r => r.coaching_count);
    logger.error(`Coaching count values: ${JSON.stringify(counts.slice(0, 10))}`);
  }
  
  // Only average rows with non-NULL effectiveness
  const currentCoachingWithEffectiveness = currentCoaching.filter(item => 
    item.effectiveness_pct !== null && 
    item.effectiveness_pct !== undefined
  );
  
  const currentEffectiveness = currentCoachingWithEffectiveness.length > 0
    ? currentCoachingWithEffectiveness.reduce((sum, item) => sum + item.effectiveness_pct, 0) / currentCoachingWithEffectiveness.length
    : null;
  
  const previousCoachingWithEffectiveness = previousCoaching.filter(item => 
    item.effectiveness_pct !== null && 
    item.effectiveness_pct !== undefined
  );
  
  const previousEffectiveness = previousCoachingWithEffectiveness.length > 0
    ? previousCoachingWithEffectiveness.reduce((sum, item) => sum + item.effectiveness_pct, 0) / previousCoachingWithEffectiveness.length
    : null;
  
  // Helper function to get sub-behaviors for a behavior
  // This matches the n8n workflow exactly
  const getSubBehaviors = (coachingData, behaviorName) => {
    const subBehaviorCounts = {};
    let totalForBehavior = 0;
    
    // First pass: count all sessions for this behavior
    coachingData
      .filter(item => item.behavior === behaviorName)
      .forEach(item => {
        totalForBehavior += (item.coaching_count || 0);
      });
    
    // Second pass: count by sub-behavior
    coachingData
      .filter(item => item.behavior === behaviorName && item.sub_behavior)
      .forEach(item => {
        const subBehavior = item.sub_behavior;
        const count = item.coaching_count || 0;
        subBehaviorCounts[subBehavior] = (subBehaviorCounts[subBehavior] || 0) + count;
      });
    
    // Sort and return top 3 - match n8n format exactly
    return Object.entries(subBehaviorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([subBehavior, count]) => ({
        sub_behavior: subBehavior,  // n8n uses sub_behavior, not name
        sessions: count,
        percent_of_behavior: totalForBehavior > 0 ? ((count / totalForBehavior) * 100).toFixed(1) + '%' : '0%'  // n8n uses percent_of_behavior
      }));
  };
  
  // Top behaviors for current period WITH SUB-BEHAVIORS
  logger.info('Starting behavior aggregation for current period...');
  const behaviorCounts = {};
  currentCoaching.forEach(item => {
    const behavior = item.behavior;
    if (behavior) {
      const count = Number(item.coaching_count) || 0;
      behaviorCounts[behavior] = (behaviorCounts[behavior] || 0) + count;
      logger.debug(`Behavior "${behavior}": adding ${count}, total now: ${behaviorCounts[behavior]}`);
    } else {
      logger.warn(`Record with no behavior: ${JSON.stringify(item)}`);
    }
  });
  
  logger.info(`Found ${Object.keys(behaviorCounts).length} unique behaviors in current period`);
  logger.info(`Behavior counts: ${JSON.stringify(Object.entries(behaviorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5))}`);
  
  const topBehaviors = Object.entries(behaviorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([behavior, count]) => {
      const subBehaviors = getSubBehaviors(currentCoaching, behavior);
      logger.debug(`Processing behavior "${behavior}": ${count} sessions, ${subBehaviors.length} sub-behaviors`);
      return {
        behavior,
        sessions: count,
        percent_of_total: currentSessions > 0 ? ((count / currentSessions) * 100).toFixed(1) + '%' : '0%',
        sub_behaviors: subBehaviors
      };
    });
  
  logger.info(`Top behaviors created: ${topBehaviors.length} behaviors with ${currentSessions} total sessions`);
  if (topBehaviors.length === 0) {
    logger.error('NO TOP BEHAVIORS CREATED! This means behaviorCounts is empty or all counts are 0');
  }
  
  // Log the structure being created
  if (topBehaviors.length > 0) {
    logger.info('Sample top behavior structure:', JSON.stringify(topBehaviors[0], null, 2));
  } else {
    logger.warn('No top behaviors found! Current coaching records:', currentCoaching.length);
    if (currentCoaching.length > 0) {
      logger.warn('Sample current coaching record:', JSON.stringify(currentCoaching[0], null, 2));
    }
  }
  
  // Top behaviors for previous period WITH SUB-BEHAVIORS
  const prevBehaviorCounts = {};
  previousCoaching.forEach(item => {
    const behavior = item.behavior;
    if (behavior) {
      prevBehaviorCounts[behavior] = (prevBehaviorCounts[behavior] || 0) + (item.coaching_count || 0);
    }
  });
  
  const prevTopBehaviors = Object.entries(prevBehaviorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([behavior, count]) => ({
      behavior,
      sessions: count,
      percent_of_total: previousSessions > 0 ? ((count / previousSessions) * 100).toFixed(1) + '%' : '0%',
      sub_behaviors: getSubBehaviors(previousCoaching, behavior)
    }));
  
  // Build output matching n8n format exactly
  const result = {
    snapshot_metadata: {
      clients: params.clients.join(', '),
      organization: params.organization,
      metric: params.metric_name,
      comparison: {
        current_period: currentPeriod.join(', ') + ' ' + params.year,
        previous_period: previousPeriod.join(', ') + ' ' + params.year,
        current_value: currentAvg !== null ? currentAvg.toFixed(2) : 'N/A',
        previous_value: previousAvg !== null ? previousAvg.toFixed(2) : 'N/A',
        change: change !== null ? change.toFixed(2) : 'N/A',
        percent_change: percentChange !== null ? percentChange + '%' : 'N/A'
      },
      programs_count: programsCount,
      data_quality: {
        metric_data_points_current: currentMetrics.length,
        metric_data_points_previous: previousMetrics.length,
        total_metric_data_points: currentMetrics.length + previousMetrics.length,
        coaching_records_current: currentCoaching.length,
        coaching_records_previous: previousCoaching.length,
        total_coaching_records: currentCoaching.length + previousCoaching.length,
        coaching_effectiveness_coverage_current: currentCoachingWithEffectiveness.length + ' of ' + currentCoaching.length,
        coaching_effectiveness_coverage_previous: previousCoachingWithEffectiveness.length + ' of ' + previousCoaching.length
      }
    },
    coaching_activity: {
      current: {
        period_label: currentCoachingPeriod.join(', '),
        total_coaching_sessions: currentSessions,
        coaching_effectiveness: currentEffectiveness !== null 
          ? (currentEffectiveness * 100).toFixed(2) + '% (based on ' + currentCoachingWithEffectiveness.length + ' of ' + currentCoaching.length + ' sessions)'
          : 'No effectiveness data',
        top_behaviors: topBehaviors
      },
      previous: {
        period_label: previousCoachingPeriod.join(', '),
        total_coaching_sessions: previousSessions,
        coaching_effectiveness: previousEffectiveness !== null 
          ? (previousEffectiveness * 100).toFixed(2) + '% (based on ' + previousCoachingWithEffectiveness.length + ' of ' + previousCoaching.length + ' sessions)'
          : 'No effectiveness data',
        top_behaviors: prevTopBehaviors
      },
      change: {
        coaching_volume_change: currentSessions - previousSessions,
        coaching_volume_change_pct: previousSessions > 0
          ? (((currentSessions - previousSessions) / previousSessions) * 100).toFixed(1) + '%'
          : 'N/A',
        effectiveness_change: currentEffectiveness !== null && previousEffectiveness !== null
          ? ((currentEffectiveness - previousEffectiveness) * 100).toFixed(2) + ' points'
          : 'N/A'
      }
    }
  };
  
  // Log final output structure for debugging
  logger.info('Final output summary:', {
    coaching_activity_exists: !!result.coaching_activity,
    current_sessions: result.coaching_activity.current.total_coaching_sessions,
    current_behaviors_count: result.coaching_activity.current.top_behaviors.length,
    previous_sessions: result.coaching_activity.previous.total_coaching_sessions,
    previous_behaviors_count: result.coaching_activity.previous.top_behaviors.length,
    current_behaviors_sample: result.coaching_activity.current.top_behaviors[0] ? {
      behavior: result.coaching_activity.current.top_behaviors[0].behavior,
      sessions: result.coaching_activity.current.top_behaviors[0].sessions,
      sub_behaviors_count: result.coaching_activity.current.top_behaviors[0].sub_behaviors?.length || 0
    } : null
  });
  
  // Add debug info to response (always show for debugging)
  // Make sure variables are in scope
  const debugInfo = {
    total_records_in_db: allBehavioralCoaching?.length || 0,
    records_matching_org_year: orgYearMatches || 0,
    filter_breakdown: {
      client_matches: clientMatches,
      org_matches: orgMatches,
      metric_matches: metricMatches,
      month_matches: monthMatches,
      year_matches: yearMatches
    },
    search_criteria: {
      clients: params.clients,
      organization: params.organization,
      metric_name: params.metric_name,
      normalized_metric_name: normalizedMetricName,
      current_coaching_months: currentCoachingPeriod,
      previous_coaching_months: previousCoachingPeriod,
      year: params.year
    },
    current_coaching_records: currentCoaching.length,
    previous_coaching_records: previousCoaching.length,
    sample_db_record: allBehavioralCoaching && allBehavioralCoaching.length > 0 ? {
      client: allBehavioralCoaching[0].client,
      amplifai_org: allBehavioralCoaching[0].amplifai_org,
      amplifai_metric: allBehavioralCoaching[0].amplifai_metric,
      metric: allBehavioralCoaching[0].metric,
      month: allBehavioralCoaching[0].month,
      year: allBehavioralCoaching[0].year
    } : null,
    // Add more diagnostic info
    db_query_success: !coachingError,
    db_error: coachingError ? coachingError.message : null,
    all_behavioral_coaching_length: allBehavioralCoaching?.length || 0
  };
  
  result.debug_info = debugInfo;
  logger.info('Debug info being added to response:', JSON.stringify(debugInfo, null, 2));
  
  return result;
}

