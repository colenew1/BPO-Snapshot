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
    
    // Generate AI summary (replicates "AI Summary" node)
    const aiSummary = await generateAISummary(snapshotData);
    snapshotData.ai_summary = aiSummary;
    
    // Save to database (replicates "Snapshot" node)
    await saveSnapshot(snapshotData, params);
    
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

