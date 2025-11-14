import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generates AI summary using OpenAI
 * Replicates the "AI Summary" node from n8n workflow
 */
export async function generateAISummary(snapshotData) {
  if (!process.env.OPENAI_API_KEY) {
    logger.warn('OPENAI_API_KEY not set, skipping AI summary');
    return null;
  }
  
  logger.info('Generating AI summary with OpenAI');
  
  const prompt = `You are a performance marketing analyst crafting content for client-facing reports. Given this coaching and performance data:

${JSON.stringify(snapshotData, null, 2)}

Write a 2-3 sentence executive summary that showcases results in the best possible light:

CRITICAL CONTEXT - COACHING TIMING:
- The coaching data is from the PREVIOUS period because coaching drives FUTURE performance
- Example: If performance improved in Jul, mention the Jun coaching that drove it
- The "current" coaching period drove the "current" performance results
- Always connect coaching efforts to the results they produced

TONE GUIDELINES:
- Lead with wins: If the metric improved, celebrate it prominently
- Frame coaching strategically: Emphasize volume, focus shifts, and behavior targeting over effectiveness drops
- Soften negatives: If performance declined, focus on the coaching response (e.g., "teams doubled down on X behavior") rather than the outcome
- Be specific with numbers to show impact: "increased focus by 48%" sounds more impressive than "coaching changed"
- If it's genuinely a bad month, acknowledge it briefly then pivot to what's being done differently
- ALWAYS connect coaching actions to performance outcomes - show cause and effect

EXAMPLES OF GOOD FRAMING:
✅ "NPS climbed 2.1% to 79.09 in July, supported by June's strategic coaching shift with a 48% increase in focus on Policies, Products, and Processes"
✅ "June's 263 targeted coaching sessions emphasized technical knowledge, driving July's 2.1% NPS improvement to 79.09"
✅ "Despite market headwinds in Q2, Q1's 847 coaching sessions with laser focus on high-impact behaviors positioned teams for recovery"
✅ "May's coaching strategy evolution—with 34% more emphasis on conversation skills—set the stage for June's performance gains"

AVOID:
❌ "July coaching improved NPS" (coaching is from previous period!)
❌ "Effectiveness dropped 8 points" 
❌ "Performance declined"
❌ "Coaching failed to..."
❌ Confusing the timeline (always: previous period coaching → current period results)

OUTPUT FORMAT:
Output ONLY the 2-3 sentence summary. No JSON, no bullets, just compelling narrative text that clearly shows how coaching drove the results.`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a performance marketing analyst crafting content for client-facing reports.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 300,
    });
    
    const summary = response.choices[0]?.message?.content?.trim();
    logger.info('AI summary generated successfully');
    return summary || null;
    
  } catch (error) {
    logger.error('Failed to generate AI summary', error);
    // Don't throw - return null so the dashboard still works
    return null;
  }
}

