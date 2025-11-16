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

    // Genericize client names everywhere (BPO 1/2/3)
    const clientNameMap = {
      'ALORICA': 'BPO 1',
      'TP': 'BPO 2',
      'TTEC': 'BPO 3'
    };
    const toGeneric = (name) => {
      if (!name) return name;
      const key = String(name).trim().toUpperCase();
      return clientNameMap[key] || name;
    };
    const genericizeClientsField = (clientsValue) => {
      if (!clientsValue) return clientsValue;
      // Supports comma-separated list or single value
      return String(clientsValue)
        .split(',')
        .map(c => toGeneric(c.trim()))
        .join(', ');
    };
    const genericizeText = (text) => {
      if (!text) return text;
      // Replace whole-word, case-insensitive
      return String(text)
        .replace(/\bAlorica\b/gi, 'BPO 1')
        .replace(/\bTP\b/g, 'BPO 2')
        .replace(/\bTTEC\b/gi, 'BPO 3');
    };

    const genericClients = genericizeClientsField(metadata.clients);
    
    const prompt = `You are writing customer success case studies for contact center performance improvements. Write a direct, analytical case study (2-3 paragraphs) based on this data:

ORGANIZATION: ${metadata.organization}
CLIENT: ${genericClients}
METRIC: ${metadata.metric}

PERFORMANCE RESULTS:
- Current Period (${comparison.current_period}): ${comparison.current_value}
- Previous Period (${comparison.previous_period}): ${comparison.previous_value}
- Change: ${comparison.change} (${comparison.percent_change})
- Programs Analyzed: ${metadata.programs_count}
- Total Data Points: ${metadata.data_quality?.total_metric_data_points || 'N/A'}

COACHING ACTIVITY:
Current Period (${coaching.current?.period_label || comparison.current_period}):
- Total Sessions: ${coaching.current?.total_coaching_sessions || 0}
- Effectiveness: ${coaching.current?.coaching_effectiveness || 'N/A'}
- Records: ${metadata.data_quality?.coaching_records_current || 0}

Previous Period (${coaching.previous?.period_label || comparison.previous_period}):
- Total Sessions: ${coaching.previous?.total_coaching_sessions || 0}
- Effectiveness: ${coaching.previous?.coaching_effectiveness || 'N/A'}
- Records: ${metadata.data_quality?.coaching_records_previous || 0}

Change: ${coaching.change?.coaching_volume_change || 0} sessions (${coaching.change?.coaching_volume_change_pct || 'N/A'})
Effectiveness Change: ${coaching.change?.effectiveness_change || 'N/A'}

TOP COACHING BEHAVIORS (Current Period - these drove the current results):
${currentBehaviors.map((b, i) => `${i + 1}. ${b.behavior}: ${b.sessions} sessions (${b.percent_of_total} of total)`).join('\n')}

TOP COACHING BEHAVIORS (Previous Period):
${previousBehaviors.map((b, i) => `${i + 1}. ${b.behavior}: ${b.sessions} sessions (${b.percent_of_total} of total)`).join('\n')}

CRITICAL CONTEXT - COACHING TIMING:
- The coaching data shown is from the PREVIOUS period because coaching drives FUTURE performance
- Example: If performance improved in July, the June coaching sessions drove that improvement
- The "current period" coaching behaviors listed above are what drove the "current period" performance results

## WRITING GUIDELINES:

### Structure: Problem → Solution → Results
1. Start with the customer pain point (what was broken from the customer's perspective before the coaching period)
2. Explain what coaching behaviors were targeted and why those specific behaviors solve that problem
3. Show the measurable results with context

### Tone:
- Direct and analytical, not promotional
- Use specific numbers, avoid vague praise ("impressive," "commendable," "strategic focus")
- Be honest about trade-offs (if effectiveness dropped, say so)
- Ground every claim in data or clear reasoning

### What to Include:
- Customer experience before and after (not just internal metrics)
- Why the specific coaching behaviors drove the specific results
- Context for numbers (is ${comparison.current_value} ${metadata.metric} good? Compared to what?)
- How many programs/agents were involved (${metadata.programs_count} programs)
- What changed from the customer's perspective

### What to Avoid:
- Marketing fluff ("impressive demonstration of strategic focus," "commendable results," "comprehensive coaching efforts")
- Percentages without context (don't say "56.30% effectiveness" without explaining what that means)
- Spinning negative findings as positives
- Generic statements that could apply to any company
- Long sentences with multiple clauses

### Format:
- 2-3 paragraphs max
- Lead with the most important finding
- Use specific numbers, not ranges
- Short sentences
- Active voice

### Example of Good vs Bad:
❌ BAD: "In an impressive demonstration of strategic focus, the team achieved commendable results through comprehensive coaching efforts."
✅ GOOD: "${metadata.organization}'s ${metadata.metric} jumped from ${comparison.previous_value} to ${comparison.current_value} in one month. The driver: ${currentBehaviors[0]?.sessions || 0} coaching sessions teaching agents to ${currentBehaviors[0]?.behavior || 'address key behaviors'}, reducing customer frustration caused by [specific issue]."

OUTPUT FORMAT:
Output ONLY the case study text. No JSON, no markdown formatting, no headers, just the case study content as plain text. Write 2-3 paragraphs following the Problem → Solution → Results structure.`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_CASE_STUDY || 'gpt-4o', // Use stronger model for case studies
      messages: [
        {
          role: 'system',
          content: 'You are a data-driven analyst writing customer success case studies for contact center performance improvements. You write direct, analytical content that connects specific coaching behaviors to measurable customer experience outcomes. You avoid marketing fluff and focus on clear problem-solution-results narratives grounded in data.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5, // Lower temperature for more analytical, direct writing
      max_tokens: 1000, // Increased token limit for longer case study
    });
    
    const caseStudy = response.choices[0]?.message?.content?.trim();
    
    if (!caseStudy) {
      throw new Error('OpenAI returned empty response');
    }
    
    // Final safety pass to enforce generic client naming in the output
    const genericCaseStudy = genericizeText(caseStudy);
    
    logger.info('Case study generated successfully');
    
    return res.status(200).json({
      case_study: genericCaseStudy,
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

