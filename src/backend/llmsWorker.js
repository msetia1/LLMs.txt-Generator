require('dotenv').config();
const Queue = require('bull');
const llmsService = require('../services/llmsService');
const emailService = require('../services/emailService');

// Create Redis connection URL from Heroku Redis URL or local fallback
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Create our job queues
const llmsQueue = new Queue('llms-generation', REDIS_URL);

// Process LLMS.txt generation jobs
llmsQueue.process('generate-llms', async (job) => {
  const { companyName, companyDescription, websiteUrl } = job.data;
  
  try {
    // Update job progress
    job.progress(10);
    
    // Generate LLMS.txt content
    const content = await llmsService.generateLLMSTxt(
      companyName,
      companyDescription,
      websiteUrl
    );
    
    job.progress(100);
    
    return { content };
  } catch (error) {
    throw new Error(`LLMS.txt generation failed: ${error.message}`);
  }
});

// Process LLMS-full.txt generation jobs
llmsQueue.process('generate-llms-full', async (job) => {
  const { companyName, companyDescription, websiteUrl, email } = job.data;
  
  try {
    // Update job progress
    job.progress(10);
    
    // Generate LLMS-full.txt content
    const content = await llmsService.generateLLMSFullTxt(
      companyName,
      companyDescription,
      websiteUrl,
      email
    );
    
    job.progress(80);
    
    // Send email with the generated content
    await emailService.sendLLMSFullEmail(email, companyName, content);
    
    job.progress(100);
    
    return { content };
  } catch (error) {
    throw new Error(`LLMS-full.txt generation failed: ${error.message}`);
  }
});

// Handle failed jobs
llmsQueue.on('failed', (job, err) => {
  console.error('Job failed:', job.id, err);
});

// Handle completed jobs
llmsQueue.on('completed', (job, result) => {
  console.log('Job completed:', job.id);
});