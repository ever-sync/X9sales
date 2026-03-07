import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config({ path: '../.env' });

export const config = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  scannerCron: process.env.SCANNER_CRON || '*/1 * * * *',
  aggregatorCron: process.env.SCANNER_AGGREGATOR_CRON || '*/10 * * * *',
  spamDetectorCron: process.env.SCANNER_SPAM_CRON || '*/15 * * * *',
  aiJobsCron: process.env.SCANNER_AI_JOBS_CRON || process.env.SCANNER_AI_CRON || '*/1 * * * *',
  revenueCopilotCron: process.env.SCANNER_REVENUE_COPILOT_CRON || '*/1 * * * *',
  managerCopilotCron: process.env.SCANNER_MANAGER_COPILOT_CRON || '*/1 * * * *',
  dailyDigestCron: process.env.SCANNER_DIGEST_CRON || '0 18 * * *', // Runs at 18:00 daily
  batchSize: parseInt(process.env.SCANNER_BATCH_SIZE || '1000', 10),
  maxRetries: parseInt(process.env.SCANNER_MAX_RETRIES || '3', 10),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
};

if (!config.supabaseUrl || !config.supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

export const supabase: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseServiceKey
);
