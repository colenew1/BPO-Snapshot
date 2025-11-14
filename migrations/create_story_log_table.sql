-- Create story_log table for storing generated stories
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS story_log (
  id SERIAL PRIMARY KEY,
  story_type TEXT NOT NULL,
  client TEXT,
  organization TEXT,
  program TEXT,
  metrics_tracked TEXT[],
  performance_summary JSONB,
  coaching_summary JSONB,
  generated_content TEXT,
  generation_date TIMESTAMPTZ DEFAULT NOW(),
  source_query TEXT,
  data_quality_notes TEXT
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_story_log_story_type ON story_log(story_type);
CREATE INDEX IF NOT EXISTS idx_story_log_organization ON story_log(organization);
CREATE INDEX IF NOT EXISTS idx_story_log_generation_date ON story_log(generation_date DESC);
CREATE INDEX IF NOT EXISTS idx_story_log_program ON story_log(program);

-- Add comment
COMMENT ON TABLE story_log IS 'Stores generated customer success stories from performance data';

