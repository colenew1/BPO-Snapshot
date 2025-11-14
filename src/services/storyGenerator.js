import { getHighPerformers } from '../queries/highPerformers.js';
import { getCoachingData } from './coachingEnricher.js';
import { generateStory } from './contentAPI.js';
import { saveStory } from './storyStorage.js';
import { validateHighPerformerResult, validateMetricBounds } from '../utils/validators.js';
import { logger } from '../utils/logger.js';

/**
 * Main orchestration function to generate high performer stories
 * 
 * @param {Object} options - Generation options
 * @param {number} options.year - Year to query (default: 2025)
 * @param {number} options.limit - Maximum number of stories to generate (default: 5)
 * @param {boolean} options.saveToDatabase - Whether to save stories to database (default: true)
 * @returns {Promise<Array>} Array of generated stories
 */
export async function generateHighPerformerStories(options = {}) {
  const {
    year = 2025,
    limit = 5,
    saveToDatabase = true,
  } = options;
  
  logger.info(`Starting story generation for year ${year}, limit ${limit}`);
  
  try {
    // 1. Query for high performers
    const performers = await getHighPerformers(year, limit * 2); // Get more than needed for filtering
    
    if (!performers || performers.length === 0) {
      logger.warn('No high performers found');
      return [];
    }
    
    logger.info(`Found ${performers.length} high performers, processing top ${limit}`);
    
    const stories = [];
    const errors = [];
    
    // 2. Process each performer
    for (let i = 0; i < Math.min(limit, performers.length); i++) {
      const performer = performers[i];
      
      try {
        // Validate result
        if (!validateHighPerformerResult(performer)) {
          logger.warn(`Skipping invalid performer: ${performer.program}`);
          continue;
        }
        
        if (!validateMetricBounds(performer)) {
          logger.warn(`Skipping performer with invalid metric bounds: ${performer.program}`);
          continue;
        }
        
        logger.info(`Processing ${i + 1}/${limit}: ${performer.organization}/${performer.program}`);
        
        // 3. Enrich with coaching data
        const coachingData = await getCoachingData(
          performer.client,
          performer.organization,
          performer.program,
          performer.amplifai_metric,
          year
        );
        
        // 4. Generate story via API
        const storyContent = await generateStory(performer, coachingData);
        
        // 5. Prepare story record
        const storyRecord = {
          story_type: 'high_performer',
          client: performer.client,
          organization: performer.organization,
          program: performer.program,
          metrics_tracked: [performer.amplifai_metric],
          performance_summary: {
            metric: performer.amplifai_metric,
            avg_actual: performer.avg_actual,
            avg_goal: performer.avg_goal,
            total_months: performer.total_months,
            months_above_goal: performer.months_above_goal,
            pct_above_goal: performer.pct_above_goal,
            months_tracked: performer.months_tracked,
          },
          coaching_summary: coachingData,
          generated_content: storyContent.content,
          source_query: 'high_performers',
          data_quality_notes: `Based on ${performer.total_months} months of data, ${performer.pct_above_goal}% above goal`,
        };
        
        // 6. Save to database
        if (saveToDatabase) {
          await saveStory(storyRecord);
          logger.info(`Story saved for ${performer.program}`);
        }
        
        stories.push({
          ...storyRecord,
          tokens_used: storyContent.tokens_used,
          model: storyContent.model,
        });
        
        // Small delay to avoid rate limiting
        if (i < limit - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (error) {
        logger.error(`Failed to generate story for ${performer.program}`, error);
        errors.push({
          performer: performer.program,
          error: error.message,
        });
        // Continue with next performer
        continue;
      }
    }
    
    logger.info(`Story generation complete: ${stories.length} successful, ${errors.length} failed`);
    
    if (errors.length > 0) {
      logger.warn('Some stories failed to generate:', errors);
    }
    
    return stories;
    
  } catch (error) {
    logger.error('Story generation failed', error);
    throw error;
  }
}

