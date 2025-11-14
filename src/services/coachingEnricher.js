import { supabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * Fetches coaching data for a specific program/metric combination
 * 
 * @param {string} client - Client name
 * @param {string} organization - AmplifAI organization name
 * @param {string} program - Program name
 * @param {string} metric - AmplifAI metric name
 * @param {number} year - Year to query
 * @param {number} limit - Maximum number of behaviors to return (default: 10)
 * @returns {Promise<Array>} Array of coaching behavior summaries
 */
export async function getCoachingData(client, organization, program, metric, year = 2025, limit = 10) {
  logger.debug(`Fetching coaching data for ${client}/${organization}/${program}/${metric}`);
  
  try {
    const { data, error } = await supabase
      .from('behavioral_coaching')
      .select('behavior, sub_behavior, coaching_count, effectiveness_pct')
      .eq('client', client)
      .eq('amplifai_org', organization)
      .eq('program', program)
      .eq('amplifai_metric', metric)
      .eq('year', year);
    
    if (error) {
      throw new Error(`Failed to fetch coaching data: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      logger.warn(`No coaching data found for ${client}/${organization}/${program}/${metric}`);
      return [];
    }
    
    // Group by behavior and sub_behavior
    const behaviorMap = {};
    
    data.forEach(record => {
      const behavior = record.behavior || 'Unknown';
      const subBehavior = record.sub_behavior || 'General';
      const sessions = record.coaching_count || 0;
      const effectiveness = record.effectiveness_pct || 0;
      
      if (!behaviorMap[behavior]) {
        behaviorMap[behavior] = {
          behavior,
          total_sessions: 0,
          effectiveness_values: [],
        };
      }
      
      behaviorMap[behavior].total_sessions += sessions;
      if (effectiveness > 0) {
        behaviorMap[behavior].effectiveness_values.push(effectiveness);
      }
    });
    
    // Calculate averages and format
    const results = Object.values(behaviorMap)
      .map(item => ({
        behavior: item.behavior,
        sub_behavior: null, // Aggregated, so no single sub-behavior
        total_sessions: item.total_sessions,
        avg_effectiveness: item.effectiveness_values.length > 0
          ? Math.round((item.effectiveness_values.reduce((a, b) => a + b, 0) / item.effectiveness_values.length) * 10000) / 100
          : null,
      }))
      .sort((a, b) => b.total_sessions - a.total_sessions)
      .slice(0, limit);
    
    logger.debug(`Found ${results.length} coaching behaviors`);
    return results;
    
  } catch (error) {
    logger.error('Error fetching coaching data', error);
    throw error;
  }
}

