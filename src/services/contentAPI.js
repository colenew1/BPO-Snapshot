import axios from 'axios';
import { logger } from '../utils/logger.js';

const API_URL = process.env.CONTENT_API_URL;
const API_KEY = process.env.CONTENT_API_KEY;

/**
 * Retry helper with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Initial delay in ms
 * @returns {Promise}
 */
async function retryWithBackoff(fn, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      const waitTime = delay * Math.pow(2, attempt - 1);
      logger.warn(`API call failed (attempt ${attempt}/${maxRetries}), retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

/**
 * Formats metrics data for Content Assistant API
 * @param {Object} performer - High performer result from database
 * @returns {Array} Formatted metrics array
 */
function formatMetrics(performer) {
  return [{
    name: performer.amplifai_metric,
    goal: performer.avg_goal,
    actual: performer.avg_actual,
    months_tracked: performer.total_months,
    pct_above_goal: performer.pct_above_goal,
  }];
}

/**
 * Formats coaching data for Content Assistant API
 * @param {Array} coachingData - Coaching behavior summaries
 * @returns {Array} Formatted coaching array
 */
function formatCoaching(coachingData) {
  return coachingData.map(item => ({
    behavior: item.behavior,
    sub_behavior: item.sub_behavior || 'General',
    sessions: item.total_sessions,
    effectiveness: item.avg_effectiveness ? item.avg_effectiveness : null,
  }));
}

/**
 * Calls the Content Assistant API to generate a story
 * 
 * @param {Object} performer - High performer result from database
 * @param {Array} coachingData - Coaching behavior summaries
 * @returns {Promise<Object>} API response with generated content
 */
export async function generateStory(performer, coachingData) {
  if (!API_URL || !API_KEY) {
    throw new Error('CONTENT_API_URL and CONTENT_API_KEY must be set in environment variables');
  }
  
  logger.info(`Generating story for ${performer.organization}/${performer.program}`);
  
  const payload = {
    story_type: 'customer_success_case_study',
    data: {
      organization: performer.organization,
      program: performer.program,
      metrics: formatMetrics(performer),
      coaching: formatCoaching(coachingData),
    },
    prompt: `Create a professional case study highlighting this program's sustained excellence across ${performer.amplifai_metric}. The program has maintained performance above goal for ${performer.pct_above_goal}% of tracked months (${performer.months_above_goal} of ${performer.total_months} months).`,
  };
  
  logger.debug('API payload:', JSON.stringify(payload, null, 2));
  
  try {
    const response = await retryWithBackoff(async () => {
      const res = await axios.post(API_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        timeout: 30000, // 30 second timeout
      });
      return res;
    });
    
    logger.info('Story generated successfully');
    return {
      content: response.data.content || response.data.text || 'Story generation completed',
      tokens_used: response.data.tokens_used || null,
      model: response.data.model || 'unknown',
    };
    
  } catch (error) {
    logger.error('Failed to generate story via API', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw new Error(`Content API call failed: ${error.message}`);
  }
}

