import cron from 'node-cron';
import { config } from './config';
import { processMessages } from './processors/message-processor';
import { aggregateDailyMetrics } from './aggregators/daily-agent';
import { detectSpam } from './processors/spam-detector';
import { processAiAnalysisJobs } from './processors/ai-analyzer';
import { processRevenueCopilotJobs } from './processors/revenue-copilot';
import { processManagerFeedbackJobs } from './processors/manager-feedback';
import { sendDailyDigest } from './processors/daily-digest';
import { sendWeeklyAgentFeedback } from './processors/weekly-agent-feedback';

let isProcessing = false;
let isAggregating = false;
let isDetectingSpam = false;
let isAnalyzing = false;
let isRevenueCopilot = false;
let isManagerCopilot = false;
let isDigesting = false;
let isWeeklyFeedback = false;

console.log('=== MonitoraIA Scanner Agent ===');
console.log(`Message processing cron: ${config.scannerCron}`);
console.log(`Daily aggregation cron: ${config.aggregatorCron}`);
console.log(`Spam detection cron: ${config.spamDetectorCron}`);
console.log(`AI manual jobs cron: ${config.aiJobsCron}`);
console.log(`Revenue copilot cron: ${config.revenueCopilotCron}`);
console.log(`Manager copilot cron: ${config.managerCopilotCron}`);
console.log(`Batch size: ${config.batchSize}`);
console.log('Starting...\n');

// Message processor: runs every 2 minutes
cron.schedule(config.scannerCron, async () => {
  if (isProcessing) {
    console.log('[Scheduler] Message processing still running, skipping...');
    return;
  }

  isProcessing = true;
  try {
    await processMessages();
  } catch (err) {
    console.error('[Scheduler] Message processing failed:', err);
  } finally {
    isProcessing = false;
  }
});

// Daily aggregator: runs every 15 minutes
cron.schedule(config.aggregatorCron, async () => {
  if (isAggregating) {
    console.log('[Scheduler] Aggregation still running, skipping...');
    return;
  }

  isAggregating = true;
  try {
    await aggregateDailyMetrics();
  } catch (err) {
    console.error('[Scheduler] Aggregation failed:', err);
  } finally {
    isAggregating = false;
  }
});

// Spam detector: runs every 30 minutes (WhatsApp Meta ban risk detection)
cron.schedule(config.spamDetectorCron, async () => {
  if (isDetectingSpam) {
    console.log('[Scheduler] Spam detection still running, skipping...');
    return;
  }

  isDetectingSpam = true;
  try {
    await detectSpam();
  } catch (err) {
    console.error('[Scheduler] Spam detection failed:', err);
  } finally {
    isDetectingSpam = false;
  }
});

// AI manual jobs: runs frequently and processes queued jobs from app.ai_analysis_jobs
cron.schedule(config.aiJobsCron, async () => {
  if (isAnalyzing) {
    console.log('[Scheduler] AI manual job processor still running, skipping...');
    return;
  }

  isAnalyzing = true;
  try {
    await processAiAnalysisJobs();
  } catch (err) {
    console.error('[Scheduler] AI manual job processor failed:', err);
  } finally {
    isAnalyzing = false;
  }
});

// Revenue Copilot jobs: runs frequently and processes queued jobs from app.revenue_copilot_jobs
cron.schedule(config.revenueCopilotCron, async () => {
  if (isRevenueCopilot) {
    console.log('[Scheduler] Revenue copilot processor still running, skipping...');
    return;
  }

  isRevenueCopilot = true;
  try {
    await processRevenueCopilotJobs();
  } catch (err) {
    console.error('[Scheduler] Revenue copilot processor failed:', err);
  } finally {
    isRevenueCopilot = false;
  }
});

// Manager Copilot jobs: runs frequently and processes queued jobs from app.manager_feedback_jobs
cron.schedule(config.managerCopilotCron, async () => {
  if (isManagerCopilot) {
    console.log('[Scheduler] Manager copilot processor still running, skipping...');
    return;
  }

  isManagerCopilot = true;
  try {
    await processManagerFeedbackJobs();
  } catch (err) {
    console.error('[Scheduler] Manager copilot processor failed:', err);
  } finally {
    isManagerCopilot = false;
  }
});

// Daily Digest: runs exactly once at configured time (default 18:00)
cron.schedule(config.dailyDigestCron, async () => {
  if (isDigesting) {
    console.log('[Scheduler] Daily digest still running, skipping...');
    return;
  }

  isDigesting = true;
  try {
    await sendDailyDigest();
  } catch (err) {
    console.error('[Scheduler] Daily digest failed:', err);
  } finally {
    isDigesting = false;
  }
});

// Weekly Agent Feedback (Gamification): runs every Sunday at 10:00
cron.schedule('0 10 * * 0', async () => {
  if (isWeeklyFeedback) {
    console.log('[Scheduler] Weekly feedback still running, skipping...');
    return;
  }

  isWeeklyFeedback = true;
  try {
    await sendWeeklyAgentFeedback();
  } catch (err) {
    console.error('[Scheduler] Weekly feedback failed:', err);
  } finally {
    isWeeklyFeedback = false;
  }
});

// Run immediately on startup
(async () => {
  console.log('[Startup] Running initial processing...');
  try {
    await processMessages();
    await aggregateDailyMetrics();
    await detectSpam();
    await processAiAnalysisJobs();
    await processRevenueCopilotJobs();
    await processManagerFeedbackJobs();
  } catch (err) {
    console.error('[Startup] Initial processing failed:', err);
  }
})();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[Shutdown] Received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[Shutdown] Received SIGINT, shutting down...');
  process.exit(0);
});
