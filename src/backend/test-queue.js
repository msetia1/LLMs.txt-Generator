// test-queue.js
require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:3000/api'; // Change to your backend URL

async function testLLMSGeneration() {
  try {
    // 1. Queue a job
    console.log('Queueing LLMS.txt generation job...');
    const queueResponse = await axios.post(`${API_URL}/generate`, {
      companyName: 'Cursor',
      companyDescription: 'AI Code Editor',
      websiteUrl: 'https://www.cursor.com/'
    });
    
    console.log('Queue response:', queueResponse.data);
    
    if (!queueResponse.data.jobId) {
      throw new Error('No job ID returned');
    }
    
    const jobId = queueResponse.data.jobId;
    
    // 2. Poll for status
    console.log(`\nPolling for status of job ${jobId}...`);
    let isCompleted = false;
    let attempts = 0;
    const maxAttempts = 30; // Try for 5 minutes max
    
    while (!isCompleted && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      attempts++;
      
      const statusResponse = await axios.get(`${API_URL}/job/${jobId}`);
      console.log(`Status check ${attempts}:`, statusResponse.data);
      
      if (statusResponse.data.data.isCompleted) {
        isCompleted = true;
      }
      
      console.log(`Progress: ${statusResponse.data.data.progress}%`);
    }
    
    if (!isCompleted) {
      throw new Error('Job did not complete within the time limit');
    }
    
    // 3. Get results
    console.log(`\nFetching results for job ${jobId}...`);
    const resultResponse = await axios.get(`${API_URL}/job/${jobId}/result`);
    console.log('Job completed with result:', resultResponse.data);
    
    // Print just the content to a file
    const fs = require('fs');
    fs.writeFileSync('llms-result.txt', resultResponse.data.data.content);
    console.log('Results saved to llms-result.txt');
    
  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testLLMSGeneration();