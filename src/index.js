import { generateHighPerformerStories } from './services/storyGenerator.js';
import { testConnection } from './config/database.js';
import { logger } from './utils/logger.js';

/**
 * Main entry point for story generation
 * Can be run directly or via cron/scheduler
 */
async function main() {
  logger.info('=== AmplifAI Story Generator ===');
  
  try {
    // Test database connection
    logger.info('Testing database connection...');
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }
    logger.info('Database connection successful');
    
    // Generate stories
    const year = parseInt(process.env.YEAR) || 2025;
    const limit = parseInt(process.env.STORY_LIMIT) || 5;
    
    logger.info(`Generating stories for year ${year}, limit ${limit}`);
    
    const stories = await generateHighPerformerStories({
      year,
      limit,
      saveToDatabase: true,
    });
    
    logger.info(`\n=== Generation Complete ===`);
    logger.info(`Successfully generated ${stories.length} stories`);
    
    // Print summary
    stories.forEach((story, index) => {
      logger.info(`\n${index + 1}. ${story.organization}/${story.program}`);
      logger.info(`   Metric: ${story.metrics_tracked[0]}`);
      logger.info(`   Performance: ${story.performance_summary.pct_above_goal}% above goal`);
      logger.info(`   Content length: ${story.generated_content?.length || 0} characters`);
    });
    
    process.exit(0);
    
  } catch (error) {
    logger.error('Fatal error in story generation', error);
    process.exit(1);
  }
}

// Run if called directly (not imported as a module)
// Simple check: if this file is executed directly via node
if (import.meta.url === `file://${process.argv[1]}` || 
    process.argv[1]?.endsWith('index.js') ||
    process.argv[1]?.endsWith('src/index.js')) {
  main();
}

export { main };

