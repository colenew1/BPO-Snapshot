import { supabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * Saves a generated story to the story_log table
 * 
 * @param {Object} storyRecord - Story record to save
 * @returns {Promise<Object>} Saved record with ID
 */
export async function saveStory(storyRecord) {
  logger.debug(`Saving story for ${storyRecord.organization}/${storyRecord.program}`);
  
  try {
    const { data, error } = await supabase
      .from('story_log')
      .insert({
        story_type: storyRecord.story_type,
        client: storyRecord.client,
        organization: storyRecord.organization,
        program: storyRecord.program,
        metrics_tracked: storyRecord.metrics_tracked,
        performance_summary: storyRecord.performance_summary,
        coaching_summary: storyRecord.coaching_summary,
        generated_content: storyRecord.generated_content,
        source_query: storyRecord.source_query,
        data_quality_notes: storyRecord.data_quality_notes,
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to save story: ${error.message}`);
    }
    
    logger.info(`Story saved with ID: ${data.id}`);
    return data;
    
  } catch (error) {
    logger.error('Error saving story', error);
    throw error;
  }
}

/**
 * Retrieves stories from the story_log table
 * 
 * @param {Object} filters - Optional filters
 * @param {string} filters.story_type - Filter by story type
 * @param {string} filters.organization - Filter by organization
 * @param {number} filters.limit - Maximum number of results
 * @returns {Promise<Array>} Array of story records
 */
export async function getStories(filters = {}) {
  const { story_type, organization, limit = 50 } = filters;
  
  let query = supabase
    .from('story_log')
    .select('*')
    .order('generation_date', { ascending: false })
    .limit(limit);
  
  if (story_type) {
    query = query.eq('story_type', story_type);
  }
  
  if (organization) {
    query = query.eq('organization', organization);
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to retrieve stories: ${error.message}`);
  }
  
  return data || [];
}

