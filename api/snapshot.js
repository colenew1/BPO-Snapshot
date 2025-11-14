/**
 * Brand Snapshot Dashboard API endpoint
 * Replaces the n8n webhook workflow
 * Endpoint: /api/snapshot
 */

import { processSnapshotData } from '../src/services/snapshotProcessor.js';
import { generateAISummary } from '../src/services/openaiService.js';
import { saveSnapshot } from '../src/services/snapshotStorage.js';
import { logger } from '../src/utils/logger.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  
  try {
    // Check for required environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      console.error('Missing Supabase credentials');
      return res.status(500).json({ 
        error: 'Server configuration error',
        message: 'Missing database credentials. Please check environment variables.'
      });
    }
    
    // Parse request body
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
    
    // Validate required fields
    const { clients, organization, metric_name, year, comparison_type } = body;
    
    if (!clients || !Array.isArray(clients) || clients.length === 0) {
      return res.status(400).json({ error: 'clients array is required and must not be empty' });
    }
    
    if (!organization || !metric_name || !year || !comparison_type) {
      return res.status(400).json({ error: 'Missing required fields: organization, metric_name, year, comparison_type' });
    }
    
    // Build params object (replicates "Define Parameters" node)
    const quarterMonths = {
      'Q1': ['Jan', 'Feb', 'Mar'],
      'Q2': ['Apr', 'May', 'Jun'],
      'Q3': ['Jul', 'Aug', 'Sep'],
      'Q4': ['Oct', 'Nov', 'Dec']
    };
    
    const params = {
      clients: clients,
      organization: organization,
      metric_name: metric_name,
      year: parseInt(year),
      comparison_type: comparison_type,
    };
    
    if (comparison_type === 'quarter') {
      params.current_quarter = body.current_quarter;
      params.previous_quarter = body.previous_quarter;
      params.current_months = quarterMonths[body.current_quarter];
      params.previous_months = quarterMonths[body.previous_quarter];
    } else {
      params.current_month = body.current_month;
      params.previous_month = body.previous_month;
      params.current_months = [body.current_month];
      params.previous_months = [body.previous_month];
    }
    
    logger.info('Processing snapshot request', params);
    
    // Process data (replicates "Parse Data" node)
    const snapshotData = await processSnapshotData(params);
    
    // Log what we're about to send to frontend
    logger.info('Snapshot data prepared for response:', {
      has_coaching_activity: !!snapshotData.coaching_activity,
      has_debug_info: !!snapshotData.debug_info,
      current_sessions: snapshotData.coaching_activity?.current?.total_coaching_sessions || 0,
      current_behaviors: snapshotData.coaching_activity?.current?.top_behaviors?.length || 0,
      previous_sessions: snapshotData.coaching_activity?.previous?.total_coaching_sessions || 0,
      previous_behaviors: snapshotData.coaching_activity?.previous?.top_behaviors?.length || 0,
      current_behaviors_sample: snapshotData.coaching_activity?.current?.top_behaviors?.[0]?.behavior || 'none',
      debug_info_keys: snapshotData.debug_info ? Object.keys(snapshotData.debug_info) : 'none'
    });
    
    // Generate AI summary (replicates "AI Summary" node)
    const aiSummary = await generateAISummary(snapshotData);
    snapshotData.ai_summary = aiSummary;
    
    // Save to database (replicates "Snapshot" node)
    await saveSnapshot(snapshotData, params);
    
    // Add debug_info at the VERY END so nothing can remove it
    // Create a safe copy of existing debug_info to avoid circular reference issues
    try {
      let existingDebugInfo = {};
      if (snapshotData.debug_info) {
        try {
          // Safely copy only serializable properties
          existingDebugInfo = JSON.parse(JSON.stringify(snapshotData.debug_info));
        } catch (e) {
          // If it can't be serialized, just use empty object
          logger.warn('Could not serialize existing debug_info, using empty object');
        }
      }
      
      snapshotData.debug_info = {
        ...existingDebugInfo,
        added_at_end: true,
        test_message: 'DEBUG_INFO_FORCE_ADDED_AT_END',
        coaching_records_current: snapshotData.snapshot_metadata?.data_quality?.coaching_records_current || 0,
        coaching_records_previous: snapshotData.snapshot_metadata?.data_quality?.coaching_records_previous || 0,
        timestamp: new Date().toISOString()
      };
      
      logger.info('Final response - has_debug_info:', !!snapshotData.debug_info);
    } catch (debugError) {
      logger.error('Error adding debug_info:', debugError);
      // Don't fail the request if debug_info fails
      snapshotData.debug_info = {
        error: 'Failed to create debug_info',
        message: debugError.message
      };
    }
    
    // Return the data (will be used by frontend)
    return res.status(200).json(snapshotData);
    
  } catch (error) {
    logger.error('Snapshot API error', error);
    return res.status(500).json({
      error: 'Snapshot generation failed',
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    });
  }
}

