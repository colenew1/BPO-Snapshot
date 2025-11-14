/**
 * Simple test endpoint to verify Supabase database access
 * Endpoint: /api/test-db
 * Usage: GET /api/test-db?org=UHC&year=2025
 */

import { supabase } from '../src/config/database.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }
  
  try {
    const { org = 'UHC', year = 2025 } = req.query;
    
    // Test 1: Count total records in behavioral_coaching
    const { count: totalCount, error: countError } = await supabase
      .from('behavioral_coaching')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      return res.status(500).json({ 
        error: 'Database query failed',
        message: countError.message,
        code: countError.code
      });
    }
    
    // Test 2: Get records for specific org/year
    const { data: orgData, error: orgError } = await supabase
      .from('behavioral_coaching')
      .select('*')
      .eq('amplifai_org', org)
      .eq('year', parseInt(year))
      .limit(10);
    
    if (orgError) {
      return res.status(500).json({ 
        error: 'Filtered query failed',
        message: orgError.message,
        code: orgError.code
      });
    }
    
    // Test 3: Get unique values
    const { data: allData, error: allError } = await supabase
      .from('behavioral_coaching')
      .select('client, amplifai_org, amplifai_metric, metric, month, year')
      .eq('amplifai_org', org)
      .eq('year', parseInt(year))
      .limit(100);
    
    if (allError) {
      return res.status(500).json({ 
        error: 'Sample query failed',
        message: allError.message
      });
    }
    
    // Extract unique values
    const uniqueClients = [...new Set(allData.map(r => r.client))];
    const uniqueAmplifaiMetrics = [...new Set(allData.map(r => r.amplifai_metric).filter(Boolean))];
    const uniqueMetrics = [...new Set(allData.map(r => r.metric).filter(Boolean))];
    const uniqueMonths = [...new Set(allData.map(r => r.month))];
    
    // Test 4: Sample record
    const sampleRecord = orgData && orgData.length > 0 ? orgData[0] : null;
    
    return res.status(200).json({
      success: true,
      tests: {
        total_records_in_table: totalCount,
        records_for_org_year: orgData?.length || 0,
        sample_record: sampleRecord,
        unique_values: {
          clients: uniqueClients,
          amplifai_metrics: uniqueAmplifaiMetrics,
          metrics: uniqueMetrics,
          months: uniqueMonths.sort()
        },
        first_10_records: orgData?.slice(0, 10).map(r => ({
          client: r.client,
          amplifai_org: r.amplifai_org,
          amplifai_metric: r.amplifai_metric,
          metric: r.metric,
          month: r.month,
          year: r.year,
          behavior: r.behavior,
          coaching_count: r.coaching_count
        })) || []
      },
      query_params: {
        org,
        year: parseInt(year)
      }
    });
    
  } catch (error) {
    return res.status(500).json({
      error: 'Test failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

