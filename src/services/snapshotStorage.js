import { supabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * Saves snapshot to metric_snapshots table
 * Replicates the "Snapshot" node from n8n workflow
 */
export async function saveSnapshot(snapshotData, params) {
  logger.debug('Saving snapshot to metric_snapshots table');
  
  try {
    // Extract percent change number
    let percentChangeNum = null;
    if (snapshotData.snapshot_metadata?.comparison?.percent_change && 
        snapshotData.snapshot_metadata.comparison.percent_change !== 'N/A' && 
        !snapshotData.snapshot_metadata.comparison.percent_change.includes('previous was 0')) {
      percentChangeNum = parseFloat(snapshotData.snapshot_metadata.comparison.percent_change.replace('%', ''));
    }
    
    // Parse numeric values
    const parseValue = (val) => {
      if (val === 'N/A' || val === null || val === undefined) return null;
      const num = parseFloat(val);
      return isNaN(num) ? null : num;
    };
    
    // Extract coaching volume change pct
    let coachingVolChangePct = null;
    if (snapshotData.coaching_activity?.change?.coaching_volume_change_pct && 
        snapshotData.coaching_activity.change.coaching_volume_change_pct !== 'N/A') {
      coachingVolChangePct = parseFloat(snapshotData.coaching_activity.change.coaching_volume_change_pct.replace('%', ''));
    }
    
    // Extract effectiveness values
    const parseEffectiveness = (val) => {
      if (!val || val === 'No effectiveness data') return null;
      const match = val.match(/^([\d.]+)%/);
      return match ? parseFloat(match[1]) : null;
    };
    
    // Helper to get amplifai_org from org_mapping
    const getAmplifaiOrg = (org) => {
      // For now, just handle UHC variations
      if (org && (org.includes('UNITED') && org.includes('HEALTH'))) {
        return 'UHC';
      }
      return org;
    };
    
    // Helper to get amplifai_metric from metric_mapping
    const getAmplifaiMetric = (metric) => {
      const standardized = {
        'NPS': ['NPS', 'CHAT NPS', 'IB NPS', 'NPS RATING', 'UES-NPS COMPOSITE SCORE'],
        'AHT': ['AHT', 'AVERAGE HANDLE TIME', 'AVE HANDLE TIME'],
        'QA': ['QA', 'QUALITY', 'QA SCORE', 'QUALITY SCORE'],
        'CSAT': ['CSAT', 'C-SAT', 'CSAT%'],
        'FCR': ['FCR', 'FIRST CALL RESOLUTION', 'FCR36'],
        'TRANSFER_RATE': ['TRANSFER RATE', 'TRANSFER%', 'TRANSFERS'],
        'ATTENDANCE': ['ATTENDANCE', 'ATTENDANCE %', 'RELIABILITY'],
        'RELEASE_RATE': ['RELEASE RATE', 'RELEASE %']
      };
      
      for (const [standard, variations] of Object.entries(standardized)) {
        if (variations.some(v => metric && metric.toUpperCase().includes(v))) {
          return standard;
        }
      }
      return metric; // Return original if no match
    };
    
    const record = {
      clients: params.clients,
      amplifai_org: getAmplifaiOrg(params.organization),
      amplifai_metric: getAmplifaiMetric(params.metric_name),
      comparison_type: params.comparison_type,
      current_period_label: snapshotData.snapshot_metadata?.comparison?.current_period || 'N/A',
      previous_period_label: snapshotData.snapshot_metadata?.comparison?.previous_period || 'N/A',
      year: params.year,
      current_value: parseValue(snapshotData.snapshot_metadata?.comparison?.current_value),
      previous_value: parseValue(snapshotData.snapshot_metadata?.comparison?.previous_value),
      change_value: parseValue(snapshotData.snapshot_metadata?.comparison?.current_value),
      percent_change: percentChangeNum,
      current_programs_count: snapshotData.snapshot_metadata?.programs_count || null,
      current_coaching_sessions: snapshotData.coaching_activity?.current?.total_coaching_sessions || null,
      previous_coaching_sessions: snapshotData.coaching_activity?.previous?.total_coaching_sessions || null,
      coaching_volume_change: snapshotData.coaching_activity?.change?.coaching_volume_change || null,
      coaching_volume_change_pct: coachingVolChangePct,
      current_coaching_effectiveness: parseEffectiveness(snapshotData.coaching_activity?.current?.coaching_effectiveness),
      previous_coaching_effectiveness: parseEffectiveness(snapshotData.coaching_activity?.previous?.coaching_effectiveness),
      coaching_effectiveness_change: parseValue(snapshotData.coaching_activity?.change?.effectiveness_change?.replace(' points', '')),
      current_top_behaviors: snapshotData.coaching_activity?.current?.top_behaviors || null,
      previous_top_behaviors: snapshotData.coaching_activity?.previous?.top_behaviors || null,
      ai_summary: snapshotData.ai_summary || null,
      created_by: 'System'
    };
    
    const { data, error } = await supabase
      .from('metric_snapshots')
      .insert(record)
      .select()
      .single();
    
    if (error) {
      logger.error('Failed to save snapshot', error);
      // Don't throw - just log the error
      return null;
    }
    
    logger.info('Snapshot saved successfully');
    return data;
    
  } catch (error) {
    logger.error('Error saving snapshot', error);
    return null;
  }
}

