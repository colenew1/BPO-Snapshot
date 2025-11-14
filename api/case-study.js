/**
 * Case Study Generation API endpoint
 * Generates a blog-format case study from snapshot data
 * Endpoint: /api/case-study
 */

import OpenAI from 'openai';
import { logger } from '../src/utils/logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error',
        message: 'OPENAI_API_KEY not configured'
      });
    }
    
    // Parse request body
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
    
    const { snapshotData } = body;
    
    if (!snapshotData) {
      return res.status(400).json({ error: 'snapshotData is required' });
    }
    
    logger.info('Generating case study with OpenAI');
    
    const metadata = snapshotData.snapshot_metadata || {};
    const comparison = metadata.comparison || {};
    const coaching = snapshotData.coaching_activity || {};
    const currentBehaviors = coaching.current?.top_behaviors || [];
    const previousBehaviors = coaching.previous?.top_behaviors || [];
    
    const prompt = `You are a professional content writer creating a client-facing case study blog post. Write a compelling 1-2 paragraph case study based on this performance and coaching data:

ORGANIZATION: ${metadata.organization}
CLIENT: ${metadata.clients}
METRIC: ${metadata.metric}

PERFORMANCE RESULTS:
- Current Period (${comparison.current_period}): ${comparison.current_value}
- Previous Period (${comparison.previous_period}): ${comparison.previous_value}
- Change: ${comparison.change} (${comparison.percent_change})
- Programs Analyzed: ${metadata.programs_count}

COACHING ACTIVITY:
Current Period (${coaching.current?.period_label || comparison.current_period}):
- Total Sessions: ${coaching.current?.total_coaching_sessions || 0}
- Effectiveness: ${coaching.current?.coaching_effectiveness || 'N/A'}

Previous Period (${coaching.previous?.period_label || comparison.previous_period}):
- Total Sessions: ${coaching.previous?.total_coaching_sessions || 0}
- Effectiveness: ${coaching.previous?.coaching_effectiveness || 'N/A'}

Change: ${coaching.change?.coaching_volume_change || 0} sessions (${coaching.change?.coaching_volume_change_pct || 'N/A'})

TOP COACHING BEHAVIORS (Current Period):
${currentBehaviors.map((b, i) => `${i + 1}. ${b.behavior}: ${b.sessions} sessions (${b.percent_of_total})`).join('\n')}

TOP COACHING BEHAVIORS (Previous Period):
${previousBehaviors.map((b, i) => `${i + 1}. ${b.behavior}: ${b.sessions} sessions (${b.percent_of_total})`).join('\n')}

AI SUMMARY: ${snapshotData.ai_summary || 'N/A'}

CRITICAL CONTEXT - COACHING TIMING:
- Coaching data is from the PREVIOUS period because coaching drives FUTURE performance
- Example: If performance improved in July, the June coaching drove it
- Always connect coaching efforts to the results they produced

REQUIREMENTS:
1. Write in blog post format (1-2 paragraphs, engaging narrative style)
2. Lead with the performance results and improvement
3. Connect coaching activities to performance outcomes
4. Highlight key behaviors and strategic focus areas
5. Use specific numbers and percentages to show impact
6. Write in a professional, client-facing tone
7. Make it compelling and results-focused
8. Do NOT use bullet points or lists - write in flowing paragraph format
9. Keep it concise but impactful (1-2 paragraphs total)

OUTPUT FORMAT:
Output ONLY the case study text. No JSON, no markdown formatting, no headers, just the blog post content as plain text.`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_CASE_STUDY || 'gpt-4o', // Use stronger model for case studies
      messages: [
        {
          role: 'system',
          content: 'You are a professional content writer specializing in creating compelling client-facing case studies and blog posts for performance improvement stories.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8, // Slightly higher for more creative/engaging writing
      max_tokens: 1000, // Increased token limit for longer case study
    });
    
    const caseStudy = response.choices[0]?.message?.content?.trim();
    
    if (!caseStudy) {
      throw new Error('OpenAI returned empty response');
    }
    
    logger.info('Case study generated successfully');
    
    return res.status(200).json({
      case_study: caseStudy,
      generated_at: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Case study generation error', error);
    return res.status(500).json({
      error: 'Case study generation failed',
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    });
  }
}

