import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_KEY in environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

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

