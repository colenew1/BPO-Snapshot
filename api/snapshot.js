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
    
    let snapshotData;
    try {
      // Process data (replicates "Parse Data" node)
      logger.info('Calling processSnapshotData...');
      snapshotData = await processSnapshotData(params);
      logger.info('processSnapshotData completed successfully');
    } catch (processError) {
      logger.error('Error in processSnapshotData:', processError);
      throw processError;
    }
    
    // Log what we're about to send to frontend
    logger.info('Snapshot data prepared for response:', {
      has_coaching_activity: !!snapshotData.coaching_activity,
      has_debug_info: !!snapshotData.debug_info,
      current_sessions: snapshotData.coaching_activity?.current?.total_coaching_sessions || 0,
      current_behaviors: snapshotData.coaching_activity?.current?.top_behaviors?.length || 0
    });
    
    try {
      // Generate AI summary (replicates "AI Summary" node)
      logger.info('Generating AI summary...');
      const aiSummary = await generateAISummary(snapshotData);
      snapshotData.ai_summary = aiSummary;
      logger.info('AI summary generated');
    } catch (aiError) {
      logger.error('Error generating AI summary:', aiError);
      snapshotData.ai_summary = 'AI summary generation failed';
    }
    
    try {
      // Save to database (replicates "Snapshot" node)
      logger.info('Saving snapshot to database...');
      await saveSnapshot(snapshotData, params);
      logger.info('Snapshot saved');
    } catch (saveError) {
      logger.error('Error saving snapshot:', saveError);
      // Don't fail the request if save fails
    }
    
    // Add debug_info at the VERY END - preserve all existing fields and add timestamp
    try {
      // Preserve all existing debug_info fields
      const existingDebugInfo = snapshotData.debug_info && typeof snapshotData.debug_info === 'object' 
        ? { ...snapshotData.debug_info } 
        : {};
      
      snapshotData.debug_info = {
        ...existingDebugInfo,
        test_message: 'DEBUG_INFO_FORCE_ADDED_AT_END',
        added_at_end: true,
        timestamp: new Date().toISOString()
      };
    } catch (debugError) {
      logger.error('Error adding debug_info:', debugError);
      snapshotData.debug_info = {
        error: 'Failed to create debug_info',
        message: String(debugError.message || debugError)
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

