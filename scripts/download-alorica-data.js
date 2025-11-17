/**
 * Download Alorica data from Supabase and save as monthly JSON files
 * This creates dummy/fallback data files for testing
 */

import { supabase } from '../src/config/database.js';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const OUTPUT_DIR = './data/alorica-fallback';

async function downloadAloricaData() {
  console.log('Starting Alorica data download...');
  
  // Create output directory if it doesn't exist
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`Created directory: ${OUTPUT_DIR}`);
  }
  
  // Get all years that have data
  const { data: yearsData, error: yearsError } = await supabase
    .from('behavioral_coaching')
    .select('year')
    .eq('client', 'Alorica')
    .order('year', { ascending: false });
  
  if (yearsError) {
    throw new Error(`Failed to fetch years: ${yearsError.message}`);
  }
  
  const years = [...new Set(yearsData.map(r => r.year))].sort((a, b) => b - a);
  console.log(`Found data for years: ${years.join(', ')}`);
  
  // Get monthly metrics data
  console.log('\nDownloading monthly_metrics data...');
  const { data: monthlyMetrics, error: metricsError } = await supabase
    .from('monthly_metrics')
    .select('*')
    .eq('client', 'Alorica')
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  
  if (metricsError) {
    throw new Error(`Failed to fetch monthly_metrics: ${metricsError.message}`);
  }
  
  console.log(`Found ${monthlyMetrics.length} monthly_metrics records`);
  
  // Get behavioral coaching data (with pagination to get all records)
  console.log('\nDownloading behavioral_coaching data...');
  let allCoaching = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;
  
  while (hasMore) {
    const { data: pageData, error: coachingError, count } = await supabase
      .from('behavioral_coaching')
      .select('*', { count: 'exact' })
      .eq('client', 'Alorica')
      .range(from, from + pageSize - 1)
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    
    if (coachingError) {
      throw new Error(`Failed to fetch behavioral_coaching: ${coachingError.message}`);
    }
    
    if (pageData && pageData.length > 0) {
      allCoaching = allCoaching.concat(pageData);
      from += pageSize;
      hasMore = pageData.length === pageSize;
      console.log(`  Fetched ${allCoaching.length} records so far...`);
    } else {
      hasMore = false;
    }
  }
  
  console.log(`Found ${allCoaching.length} behavioral_coaching records`);
  
  // Organize data by year and month
  const organizedData = {};
  
  // Process monthly metrics
  monthlyMetrics.forEach(record => {
    const key = `${record.year}-${record.month}`;
    if (!organizedData[key]) {
      organizedData[key] = {
        year: record.year,
        month: record.month,
        monthly_metrics: [],
        behavioral_coaching: []
      };
    }
    organizedData[key].monthly_metrics.push(record);
  });
  
  // Process behavioral coaching
  allCoaching.forEach(record => {
    const key = `${record.year}-${record.month}`;
    if (!organizedData[key]) {
      organizedData[key] = {
        year: record.year,
        month: record.month,
        monthly_metrics: [],
        behavioral_coaching: []
      };
    }
    organizedData[key].behavioral_coaching.push(record);
  });
  
  // Save data by month
  console.log('\nSaving data files...');
  const monthKeys = Object.keys(organizedData).sort((a, b) => {
    // Sort by year then month
    const [yearA, monthA] = a.split('-');
    const [yearB, monthB] = b.split('-');
    if (yearA !== yearB) return parseInt(yearB) - parseInt(yearA);
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthOrder.indexOf(monthB) - monthOrder.indexOf(monthA);
  });
  
  for (const key of monthKeys) {
    const data = organizedData[key];
    const filename = `alorica-${data.year}-${data.month}.json`;
    const filepath = join(OUTPUT_DIR, filename);
    
    await writeFile(filepath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`  Saved: ${filename} (${data.monthly_metrics.length} metrics, ${data.behavioral_coaching.length} coaching records)`);
  }
  
  // Also save a summary file
  const summary = {
    generated_at: new Date().toISOString(),
    total_months: monthKeys.length,
    years: years,
    months_by_year: {},
    total_metrics_records: monthlyMetrics.length,
    total_coaching_records: allCoaching.length,
    months: monthKeys.map(key => {
      const [year, month] = key.split('-');
      return { year: parseInt(year), month };
    })
  };
  
  // Count records per year
  years.forEach(year => {
    summary.months_by_year[year] = monthKeys.filter(k => k.startsWith(`${year}-`)).length;
  });
  
  const summaryPath = join(OUTPUT_DIR, 'summary.json');
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\nSaved summary: summary.json`);
  
  console.log('\n✅ Download complete!');
  console.log(`\nSummary:`);
  console.log(`  - Total months: ${summary.total_months}`);
  console.log(`  - Total metrics records: ${summary.total_metrics_records}`);
  console.log(`  - Total coaching records: ${summary.total_coaching_records}`);
  console.log(`  - Output directory: ${OUTPUT_DIR}`);
}

// Run the download
downloadAloricaData()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });

