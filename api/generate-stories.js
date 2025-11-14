/**
 * Vercel serverless function for story generation
 * Endpoint: /api/generate-stories
 * 
 * Usage:
 * POST /api/generate-stories
 * Body: { "year": 2025, "limit": 5 }
 */

import { generateHighPerformerStories } from '../src/services/storyGenerator.js';
import { testConnection } from '../src/config/database.js';
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
    // Test database connection
    const connected = await testConnection();
    if (!connected) {
      return res.status(500).json({ error: 'Database connection failed' });
    }
    
    // Parse request body
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
    
    const { year = 2025, limit = 5 } = body || {};
    
    logger.info(`API request: Generating ${limit} stories for year ${year}`);
    
    // Generate stories
    const stories = await generateHighPerformerStories({
      year: parseInt(year),
      limit: parseInt(limit),
      saveToDatabase: true,
    });
    
    return res.status(200).json({
      success: true,
      count: stories.length,
      stories: stories.map(s => ({
        id: s.id,
        organization: s.organization,
        program: s.program,
        metric: s.metrics_tracked?.[0],
        performance: s.performance_summary,
        content_preview: s.generated_content?.substring(0, 200) + '...',
        generated_at: s.generation_date,
      })),
    });
    
  } catch (error) {
    logger.error('API error', error);
    return res.status(500).json({
      error: 'Story generation failed',
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    });
  }
}

