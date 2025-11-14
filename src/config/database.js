import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
// Try service role key first (bypasses RLS), fallback to anon key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_KEY/SUPABASE_SERVICE_ROLE_KEY in environment variables');
}

// Create client with options for better error handling
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

// Log which key type is being used (without exposing the key)
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('Using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS)');
} else {
  console.log('Using SUPABASE_KEY (anon key - subject to RLS policies)');
}

/**
 * Test database connection
 * @returns {Promise<boolean>}
 */
export async function testConnection() {
  try {
    const { error } = await supabase.from('monthly_metrics').select('id').limit(1);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error.message);
    return false;
  }
}

