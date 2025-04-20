require('dotenv').config();
const Queue = require('bull');
const llmsService = require('./services/llmsService');
const emailService = require('./services/emailService');
const supabase = require('./utils/supabaseClient');

// Create Redis connection URL from Heroku Redis URL or local fallback
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Create our job queues
const llmsQueue = new Queue('llms-generation', REDIS_URL, {
  settings: {
    lockDuration: 1200000,
    stalledInterval: 300000,
    maxStalledCount: 3,
    lockRenewTime: 300000
  }
});

const concurrency = process.env.WORKER_CONCURRENCY || 2;
console.log(`Worker starting with concurrency set to ${concurrency}`);

// Process LLMS.txt generation jobs
llmsQueue.process('generate-llms', parseInt(concurrency), async (job) => {
  const { companyName, companyDescription, websiteUrl, generationId } = job.data;
  
  try {
    console.log(`Processing job ${job.id} for ${companyName}`);
    // Update job progress
    job.progress(10);
    
    // Generate LLMS.txt content
    const content = await llmsService.generateLLMSTxt(
      companyName,
      companyDescription,
      websiteUrl
    );
    
    // Store the content in the database if we have a generationId
    if (generationId) {
      const { error } = await supabase
        .from('llms_generations')
        .update({ 
          llms_content: content,
          status: 'completed'
        })
        .eq('id', generationId);
        
      if (error) {
        console.error(`Error updating database with content: ${error.message}`);
      }
    }

    job.progress(100);
    console.log(`Job ${job.id} completed for ${companyName}`);
    
    return { content };
  } catch (error) {
    console.error(`Job ${job.id} failed for ${companyName}: ${error.message}`);

    // Update the database with the error
    if (generationId) {
      try {
        await supabase
          .from('llms_generations')
          .update({ 
            error_message: error.message,
            status: 'failed'
          })
          .eq('id', generationId);
      } catch (dbError) {
        console.error(`Error updating database with error: ${dbError.message}`);
      }
    }
    throw new Error(`LLMS.txt generation failed: ${error.message}`);
  }
});

// Process LLMS-full.txt generation jobs
llmsQueue.process('generate-llms-full', parseInt(concurrency), async (job) => {
  const { companyName, companyDescription, websiteUrl, email, generationId } = job.data;
  
  try {
    console.log(`Processing job ${job.id} for ${companyName}`);
    // Update job progress
    job.progress(10);
    
    // Generate LLMS-full.txt content
    const content = await llmsService.generateLLMSFullTxt(
      companyName,
      companyDescription,
      websiteUrl,
      email
    );
    
    // Store the full content in the database if we have a generationId
    if (generationId) {
      const { error } = await supabase
        .from('llms_generations')
        .update({ 
          llms_full_content: content,
          status: 'completed'
        })
        .eq('id', generationId);
        
      if (error) {
        console.error(`Error updating database with content: ${error.message}`);
      }
    }

    job.progress(80);
    console.log(`Job ${job.id} completed for ${companyName}`);
    
    // Send email with the generated content
    await emailService.sendLLMSFullEmail(email, companyName, content);
    
    // Update the email_sent flag if we have a generationId
    if (generationId) {
      const { error } = await supabase
        .from('llms_generations')
        .update({ 
          email_sent: true
        })
        .eq('id', generationId);
        
      if (error) {
        console.error(`Error updating email_sent status: ${error.message}`);
      }
    }

    job.progress(100);
    console.log(`Job ${job.id} completed for ${companyName}`);
    
    return { content };
  } catch (error) {
    console.error(`Job ${job.id} failed for ${companyName}: ${error.message}`);

     // Update the database with the error
     if (generationId) {
      try {
        await supabase
          .from('llms_generations')
          .update({ 
            error_message: error.message,
            status: 'failed'
          })
          .eq('id', generationId);
      } catch (dbError) {
        console.error(`Error updating database with error: ${dbError.message}`);
      }
    }

    throw new Error(`LLMS-full.txt generation failed: ${error.message}`);
  }
});

// Implement graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down worker gracefully...');
  await llmsQueue.close();
  console.log('Worker queue closed');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down worker gracefully...');
  await llmsQueue.close();
  console.log('Worker queue closed');
  process.exit(0);
});

// Handle failed jobs
llmsQueue.on('failed', (job, err) => {
  console.error('Job failed:', job.id, err);
});

// Handle completed jobs
llmsQueue.on('completed', (job, result) => {
  console.log('Job completed:', job.id);
});

// Log when worker is ready
llmsQueue.on('ready', () => {
  console.log('Worker is ready to process jobs');
});

console.log('Worker initialized and waiting for jobs');