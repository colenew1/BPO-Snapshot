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
  } else {
    currentCoachingPeriod = previousPeriod;
    previousCoachingPeriod = previousPeriod.map(m => {
      const idx = monthOrder.indexOf(m);
      return monthOrder[(idx - 3 + 12) % 12];
    });
  }
  
  // Helper: Check if value is valid
  const isValid = (v) => v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
  
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
  
  // Fetch behavioral coaching
  logger.info(`Fetching behavioral_coaching for org: ${params.organization}, year: ${params.year}`);
  const { data: allBehavioralCoaching, error: coachingError } = await supabase
    .from('behavioral_coaching')
    .select('*')
    .eq('amplifai_org', params.organization)
    .eq('year', params.year);
  
  if (coachingError) {
    logger.error('Behavioral coaching query error:', coachingError);
    throw new Error(`Failed to fetch coaching data: ${coachingError.message} (code: ${coachingError.code})`);
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
    
    // Check how many match each filter
    const clientMatches = allBehavioralCoaching.filter(r => params.clients.includes(r.client)).length;
    const orgMatches = allBehavioralCoaching.filter(r => r.amplifai_org === params.organization).length;
    // Check amplifai_metric exact match (standardized field)
    const metricMatchesCount = allBehavioralCoaching.filter(r => 
      r.amplifai_metric === params.metric_name
    ).length;
    const monthMatches = allBehavioralCoaching.filter(r => currentCoachingPeriod.includes(r.month)).length;
    
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
  
  // Get unique programs
  const programsCount = new Set(currentMetrics.map(item => item.program)).size;
  
  // Filter coaching for SHIFTED current period
  // Match n8n exactly: uses exact match on amplifai_metric (no variation matching needed since it's standardized)
  const currentCoaching = (allBehavioralCoaching || []).filter(item => {
    const clientMatch = params.clients.includes(item.client);
    const orgMatch = item.amplifai_org === params.organization;
    // n8n uses exact match: row.amplifai_metric === params.metric_name
    const metricMatch = item.amplifai_metric === params.metric_name;
    const monthMatch = currentCoachingPeriod.includes(item.month);
    const yearMatch = item.year === params.year;
    
    // Debug individual filter failures
    if (!clientMatch && orgMatch && metricMatch && monthMatch && yearMatch) {
      logger.debug(`Coaching record filtered out: client mismatch. Record client: "${item.client}", Looking for: ${JSON.stringify(params.clients)}`);
    }
    if (!orgMatch && clientMatch && metricMatch && monthMatch && yearMatch) {
      logger.debug(`Coaching record filtered out: org mismatch. Record org: "${item.amplifai_org}", Looking for: "${params.organization}"`);
    }
    if (!metricMatch && clientMatch && orgMatch && monthMatch && yearMatch) {
      logger.debug(`Coaching record filtered out: metric mismatch. Record amplifai_metric: "${item.amplifai_metric}", Record metric: "${item.metric}", Looking for: "${params.metric_name}"`);
    }
    if (!monthMatch && clientMatch && orgMatch && metricMatch && yearMatch) {
      logger.debug(`Coaching record filtered out: month mismatch. Record month: "${item.month}", Looking for: ${currentCoachingPeriod.join(', ')}`);
    }
    
    return clientMatch && orgMatch && metricMatch && monthMatch && yearMatch;
  });
  
  logger.info(`Current coaching period: ${currentCoachingPeriod.join(', ')}, found ${currentCoaching.length} records`);
  if (currentCoaching.length === 0 && allBehavioralCoaching && allBehavioralCoaching.length > 0) {
    logger.warn('No coaching records matched filters! Check the debug logs above for mismatch reasons.');
  }
  
  // Filter coaching for SHIFTED previous period
  // Match n8n exactly: uses exact match on amplifai_metric
  const previousCoaching = (allBehavioralCoaching || []).filter(item => {
    return params.clients.includes(item.client) &&
           item.amplifai_org === params.organization &&
           item.amplifai_metric === params.metric_name &&
           previousCoachingPeriod.includes(item.month) &&
           item.year === params.year;
  });
  
  logger.info(`Previous coaching period: ${previousCoachingPeriod.join(', ')}, found ${previousCoaching.length} records`);
  if (previousCoaching.length === 0 && allBehavioralCoaching && allBehavioralCoaching.length > 0) {
    logger.warn('No previous period coaching records matched filters!');
  }
  
  // Calculate coaching summaries
  const currentSessions = currentCoaching.reduce((sum, item) => sum + (item.coaching_count || 0), 0);
  const previousSessions = previousCoaching.reduce((sum, item) => sum + (item.coaching_count || 0), 0);
  
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
  const behaviorCounts = {};
  currentCoaching.forEach(item => {
    const behavior = item.behavior;
    if (behavior) {
      behaviorCounts[behavior] = (behaviorCounts[behavior] || 0) + (item.coaching_count || 0);
    }
  });
  
  logger.info(`Found ${Object.keys(behaviorCounts).length} unique behaviors in current period`);
  
  const topBehaviors = Object.entries(behaviorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([behavior, count]) => ({
      behavior,
      sessions: count,
      percent_of_total: currentSessions > 0 ? ((count / currentSessions) * 100).toFixed(1) + '%' : '0%',
      sub_behaviors: getSubBehaviors(currentCoaching, behavior)
    }));
  
  logger.info(`Top behaviors: ${topBehaviors.length} behaviors with ${currentSessions} total sessions`);
  
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
  return {
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
}

