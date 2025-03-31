const { GoogleGenerativeAI } = require('@google/generative-ai');
const cheerio = require('cheerio');
const axios = require('axios');
const playwright = require('playwright');
const urlUtils = require('../utils/urlUtils');
const fs = require('fs').promises;
const path = require('path');

// Initialize Google Generative AI with API key
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../../logs');
fs.mkdir(logsDir, { recursive: true }).catch(console.error);

// Get current date for log file name
function getLogFileName() {
  const now = new Date();
  return path.join(logsDir, `llms-generator-${now.toISOString().split('T')[0]}.log`);
}

/**
 * Format a log message with timestamp and metadata
 * @param {string} level - Log level
 * @param {string} message - Message to log
 * @param {Object} data - Optional data to include
 * @returns {string} - Formatted log message
 */
function formatLogMessage(level, message, data = null) {
  const timestamp = new Date().toISOString();
  let logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (data) {
    try {
      // Special handling for Gemini inputs/outputs
      if (data.completeResponse) {
        logMessage += '\n[GEMINI OUTPUT]\n' + data.completeResponse + '\n------------------------';
      }
      // Special handling for batch pages - only show URLs
      else if (data.fullBatchPages) {
        logMessage += '\nProcessing pages:';
        data.fullBatchPages.forEach(url => {
          logMessage += '\n- ' + url;
        });
      }
      // For website data, only show essential info
      else if (data.pages) {
        logMessage += '\nCrawled pages:';
        data.pages.forEach(page => {
          if (typeof page === 'string') {
            logMessage += '\n- ' + page;
          } else if (page.url) {
            logMessage += '\n- ' + page.url;
          }
        });
      }
      else {
        const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        logMessage += '\n' + dataStr;
      }
    } catch (error) {
      logMessage += '\nError stringifying data: ' + error.message;
    }
  }
  
  return logMessage + '\n';
}

/**
 * Enhanced logging system for LLMS generator
 * @param {string} level - Log level (info, warn, error, debug)
 * @param {string} message - Message to log
 * @param {Object} [data] - Optional data to include in log
 */
async function logActivity(level, message, data = null) {
  const logMessage = formatLogMessage(level, message, data);
  const logFile = getLogFileName();
  
  // Write to file
  try {
    await fs.appendFile(logFile, logMessage);
  } catch (error) {
    console.error('Error writing to log file:', error);
  }
  
  // Write to console based on type
  if (message.includes('Visiting page:')) {
    console.log(`[CRAWL] ${message}`);
  } 
  else if (data && data.completeResponse) {
    console.log('\n[GEMINI OUTPUT]');
    console.log(data.completeResponse);
    console.log('------------------------');
  }
  else if (level === 'error') {
    console.error(`[ERROR] ${message}`);
    if (data && data.errorMessage) {
      console.error(data.errorMessage);
    }
  }
  else {
    // For all other cases, write to console with level
    console.log(`[${level.toUpperCase()}] ${message}`);
    if (data) {
      console.log(data);
    }
  }
}

/**
 * Get the appropriate Gemini model based on the task complexity
 * @param {string} modelType - 'standard' or 'advanced' based on task needs
 * @returns {object} - Configured Gemini model
 */
function getGeminiModel(modelType = 'standard') {
  // Options for generation configuration
  const standardConfig = {
    temperature: 0.2,  // Lower temperature for more consistent outputs
    topP: 0.9,
    topK: 40
  };
  
  const advancedConfig = {
    temperature: 0.2,
    topP: 0.95,
    topK: 40
  };
  
  // Create base model
  const config = modelType === 'advanced' ? advancedConfig : standardConfig;
  const baseModel = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    generationConfig: config
  });
  
  // Wrap the generateContent method to add logging
  const originalGenerateContent = baseModel.generateContent.bind(baseModel);
  baseModel.generateContent = async function(prompt) {
    
    try {
      const response = await originalGenerateContent(prompt);
      return response;
    } catch (error) {
      // Log any errors
      await logActivity('error', 'Gemini API Error', {
        errorMessage: error.message,
        prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt, null, 2)
      });
      throw error;
    }
  };
  
  return baseModel;
}

/**
 * Generate LLMS.txt file for a company website
 * @param {string} companyName - Name of the company
 * @param {string} companyDescription - Description of the company
 * @param {string} websiteUrl - URL of the company website
 * @param {string} email - Email address for notification
 * @returns {Promise<string>} - Generated LLMS.txt content
 */
exports.generateLLMSTxt = async (companyName, companyDescription, websiteUrl, email) => {
  const startTime = Date.now();
  let crawlEndTime;
  let geminiEndTime;
  
  await logActivity('info', 'Starting LLMS.txt generation', { 
    companyName, websiteUrl, email 
  });
  
  try {
    // Validate and normalize URL
    const normalizedUrl = urlUtils.normalizeUrl(websiteUrl);
    await logActivity('debug', 'Normalized URL for crawling', { 
      original: websiteUrl, normalized: normalizedUrl 
    });
    
    // Crawl website using the unified crawlWebsite function with standard configuration
    await logActivity('info', 'Beginning website crawl with batch processing');
    const crawlResults = await crawlWebsite(normalizedUrl, companyName, companyDescription, {
      maxPages: 50,
      batchSize: 20,
      maxDepth: 2
    }, false);
    crawlEndTime = Date.now();
    await logActivity('info', 'Website crawl with batching completed', { 
      pagesCount: crawlResults.pages.length,
      contentBatches: {
        mission: crawlResults.contentBatches.mission.length,
        products: crawlResults.contentBatches.products.length,
        links: crawlResults.contentBatches.links.length,
        policies: crawlResults.contentBatches.policies.length
      }
    });
    
    // Generate content with AI using batched content
    await logActivity('info', 'Generating enhanced LLMS.txt content with AI');
    const llmsContent = await generateLLMSBatchedContent(crawlResults, companyName, companyDescription, crawlResults.batchSize);
    geminiEndTime = Date.now();
    await logActivity('info', 'Enhanced LLMS.txt content generation completed', { 
      contentLength: llmsContent.length 
    });
    
    // Add statistics after final content
    console.log('\n[CRAWL STATS]');
    console.log(`Total pages discovered: ${crawlResults.allQueuedUrls.size}`);
    console.log(`Total pages visited: ${crawlResults.pages.length}`);
    console.log('------------------------');
    
    // Add timing statistics
    console.log('\n[TIMING STATS]');
    console.log(`Crawling time: ${(crawlEndTime - startTime) / 1000} seconds`);
    console.log(`Gemini processing time: ${(geminiEndTime - crawlEndTime) / 1000} seconds`);
    console.log(`Total processing time: ${(geminiEndTime - startTime) / 1000} seconds`);
    console.log('------------------------\n');
    
    return llmsContent;
  } catch (error) {
    await logActivity('error', 'Error in LLMS.txt generation', { 
      error: error.message, stack: error.stack 
    });
    
    // Re-throw with enhanced message for the controller
    throw error;
  }
}

/**
 * Generate LLMS-full.txt file for a company website with more comprehensive content
 * @param {string} companyName - Name of the company
 * @param {string} companyDescription - Description of the company
 * @param {string} websiteUrl - URL of the company website
 * @param {string} email - Email address for notification
 * @returns {Promise<string>} - Generated LLMS-full.txt content
 */
exports.generateLLMSFullTxt = async (companyName, companyDescription, websiteUrl, email) => {
  const startTime = Date.now();
  let crawlEndTime;
  let geminiEndTime;
  
  await logActivity('info', 'Starting LLMS-full.txt generation', { 
    companyName, websiteUrl, email 
  });
  
  try {
    // Validate and normalize URL
    const normalizedUrl = urlUtils.normalizeUrl(websiteUrl);
    await logActivity('debug', 'Normalized URL for deep crawling', { 
      original: websiteUrl, normalized: normalizedUrl 
    });
    
    // Perform deeper crawl with the unified crawlWebsite function
    await logActivity('info', 'Beginning enhanced website crawl for LLMS-full.txt');
    const crawlResults = await crawlWebsite(normalizedUrl, companyName, companyDescription, {
      maxPages: 300, 
      batchSize: 50,
      maxDepth: 5
    }, true);
    crawlEndTime = Date.now();
    await logActivity('info', 'Enhanced website crawl completed', { 
      pagesCount: crawlResults.pages.length,
      contentBatches: {
        mission: crawlResults.contentBatches.mission.length,
        products: crawlResults.contentBatches.products.length,
        links: crawlResults.contentBatches.links.length,
        policies: crawlResults.contentBatches.policies.length
      }
    });
    
    // Generate content with AI using batched content - using the FULL version
    await logActivity('info', 'Generating comprehensive LLMS-full.txt content with AI');
    const llmsContent = await generateLLMSFullBatchedContent(crawlResults, companyName, companyDescription, crawlResults.batchSize);
    geminiEndTime = Date.now();
    await logActivity('info', 'LLMS-full.txt content generation completed', { 
      contentLength: llmsContent.length 
    });
    
    // Add statistics after final content
    console.log('\n[CRAWL STATS]');
    console.log(`Total pages discovered: ${crawlResults.allQueuedUrls.size}`);
    console.log(`Total pages visited: ${crawlResults.pages.length}`);
    console.log('------------------------');
    
    // Add timing statistics
    console.log('\n[TIMING STATS]');
    console.log(`Crawling time: ${(crawlEndTime - startTime) / 1000} seconds`);
    console.log(`Gemini processing time: ${(geminiEndTime - crawlEndTime) / 1000} seconds`);
    console.log(`Total processing time: ${(geminiEndTime - startTime) / 1000} seconds`);
    console.log('------------------------\n');
    
    return llmsContent;
  } catch (error) {
    await logActivity('error', 'Error in LLMS-full.txt generation', { 
      error: error.message, stack: error.stack 
    });
    throw error;
  }
}

/**
 * Process a batch of pages to generate content sections
 * @param {Array} batchPages - Array of page objects to process
 * @param {string} companyName - Company name
 * @param {string} companyDescription - Company description
 * @param {Object} contentBatches - Object containing arrays for content batches
 * @param {number} BATCH_SIZE - Number of pages to process in each batch
 * @param {boolean} isFullVersion - Whether this is for llms-full.txt (true) or llms.txt (false)
 */
async function processPageBatch(batchPages, companyName, companyDescription, contentBatches, BATCH_SIZE, isFullVersion) {
  if (batchPages.length === 0) return;
  
  await logActivity('info', `Processing batch of ${batchPages.length} pages for ${isFullVersion ? 'LLMS-full' : 'LLMS'}.txt`);
  
  try {
    // Get the Gemini model for content generation
    const model = getGeminiModel('advanced');
    
    // Prepare data structure for the model
    const processedData = {
      companyName,
      companyDescription,
      pages: batchPages.slice(0, BATCH_SIZE).map(page => ({
        title: page.title,
        metaDescription: page.metaDescription || '',
        headings: page.headings || [],
        url: page.url,
        content: page.content ? page.content.substring(0, 5000) : '' // Increased from 2000 to 5000
      }))
    };
    
    // Log the complete data being processed
    await logActivity('INFO', `Complete batch data being processed`, {
      fullBatchPages: processedData.pages.map(page => page.url)
    });
    
    // Extract policies and product info
    const policies = batchPages
      .filter(page => {
        const lowerTitle = page.title.toLowerCase();
        const lowerUrl = page.url.toLowerCase();
        return lowerTitle.includes('privacy') || 
               lowerTitle.includes('policy') || 
               lowerTitle.includes('terms') || 
               lowerTitle.includes('legal') ||
               lowerUrl.includes('privacy') || 
               lowerUrl.includes('policy') || 
               lowerUrl.includes('terms') || 
               lowerUrl.includes('legal');
      })
      .map(page => ({
        title: page.title,
        url: page.url
      }));
    
    const keyProducts = batchPages
      .filter(page => {
        const lowerTitle = page.title.toLowerCase();
        const lowerUrl = page.url.toLowerCase();
        return (lowerTitle.includes('product') || 
                lowerTitle.includes('feature') || 
                lowerUrl.includes('product') || 
                lowerUrl.includes('feature')) &&
               !page.isDocumentation;
      })
      .map(page => ({
        name: page.title,
        description: page.metaDescription || '',
        url: page.url
      }));
    
    // Add extracted data to the processed data
    processedData.policies = policies;
    processedData.products = keyProducts;
    
    // Helper function to generate a section
    async function generateIncrementalSection(sectionName, sectionPrompt) {
    
      try {
        const sectionResult = await model.generateContent(sectionPrompt);
        // Log the full response from Gemini
        await logActivity('INFO', `Full response received from Gemini for ${sectionName} section`, {
          completeResponse: sectionResult.response.text()
        });
        return sectionResult.response.text();
      } catch (error) {
        await logActivity('error', `Error generating ${sectionName} section in batch:`, {
          errorMessage: error.message
        });
        return '';
      }
    }
    
    // Generate sections in parallel with conditional checks to avoid unnecessary API calls
    const missionPrompt = `Based on the following website data for ${companyName}, generate the "Mission Statement" section for an ${isFullVersion ? 'LLMS-full' : 'LLMS'}.txt file ONLY if there is content, making sure not to include "## Mission Statment" if this is the case. This should be 1-2 sentences that explain the company's purpose and core objectives.

      Here is an example of a mission statement for Cursor: 
      ## Mission Statement
      To empower developers with AI-powered tools that significantly increase productivity and efficiency in software development, dramatically enhancing coding efficiency.

IMPORTANT: 
1. DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS.txt file.
2. If there is no missionn statement information in the provided data, return an empty string WITHOUT any section headers
3. DO NOT include "## Mission Statement" if there is no content to display
4. Only include the section header if you have actual mission statement information to share

WEBSITE DATA:
${JSON.stringify(processedData, null, 2)}

Generate ONLY the mission statement section, starting with "## Mission Statement".`;
    
    const productsPrompt = `Based on the following website data for ${companyName}, generate ONLY the "Key Products/Services" section for an ${isFullVersion ? 'LLMS-full' : 'LLMS'}.txt file. This should be a brief overview of the company's main offerings.

IMPORTANT: 
1. DO NOT include explanatory notes or comments
2. If there is no product or service information in the provided data, return an empty string WITHOUT any section headers
3. DO NOT include "## Key Products/Services" if there is no content to display
4. Only include the section header if you have actual product/service information to share

WEBSITE DATA:
${JSON.stringify(processedData.products || [], null, 2)}

Generate the products/services section, including the "## Key Products/Services" header ONLY if you have content.`;
    
    const linksPrompt = `Based on the following website data for ${companyName}, generate ONLY the "Important Links" section for an ${isFullVersion ? 'LLMS-full' : 'LLMS'}.txt file.

      This section MUST include different, real URLs from the company website, carefully organized into logical categories. Each link should be in the format "- [Link Title](URL): ${isFullVersion ? '5 sentence detailed description' : '1 sentence brief description'}" on its own line.

CRITICAL REQUIREMENTS FOR URL USAGE:
1. ONLY use complete URLs that are EXPLICITLY present in the provided website data
2. DO NOT include a link if you only have the text/title but no corresponding URL
3. DO NOT default to using the base domain (${companyName}.com) when you're unsure of the URL
4. DO NOT create, infer, or guess any URLs, even if they seem logical (like /about, /careers, etc.)
5. If a page is mentioned in text but has no explicit URL, SKIP it entirely
6. Better to have fewer legitimate links than to include any incorrect or assumed URLs
7. Each URL must be verifiably present in the provided website data as a complete URL
8. Each URL must only be used once in the entire links section
9. DO NOT create, infer, or guess any URLs, even if they seem logical (like /about, /careers, etc.)
10. DO NOT modify existing URLs or create new URL paths
11. DO NOT assume common website paths exist
12. DO NOT use domain knowledge to guess URLs - only use URLs from the data

IMPORTANT:
1. Do NOT include "## Important Links" if there is no content to display
2. If there is no important links in the provided data, return an empty string WITHOUT any section headers
3. DO NOT include "## Important Links" if there is no content to display
4. Only include the section header if you have actual links to share

WEBSITE DATA:
${JSON.stringify(processedData.pages || [], null, 2)}

Generate ONLY the links section, starting with "## Important Links".`;
    
    const policiesPrompt = `Based on the following website data for ${companyName}, generate ONLY the "Policies" section for an ${isFullVersion ? 'LLMS-full' : 'LLMS'}.txt file. List each policy as a title followed by its URL.

IMPORTANT: 
1. DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS.txt file.
2. If there is no policy information in the provided data, return an empty string WITHOUT any section headers
3. DO NOT include "## Policies" if there is no content to display
4. Only include the section header if you have actual policy information to share

WEBSITE DATA:
${JSON.stringify(processedData.policies || [], null, 2)}

Generate ONLY the policies section, starting with "## Policies".`;
    
    // Track which API calls we'll need to make
    const apiCalls = [];
    const apiPrompts = {};
    
    // Always generate links section as it's core content
    apiCalls.push(generateIncrementalSection('links', linksPrompt));
    apiPrompts.links = 'links';
    
    // For mission statement, only include in the first batch or if we have home page content
    const isFirstBatch = !contentBatches.mission || contentBatches.mission.length === 0;
    const hasHomePage = batchPages.some(page => {
      const url = new URL(page.url);
      return url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/en' || 
             url.pathname === '/home' || url.pathname.endsWith('/');
    });
    
    if (isFirstBatch || hasHomePage) {
      apiCalls.push(generateIncrementalSection('mission', missionPrompt));
      apiPrompts.mission = 'mission';
    } else {
      apiCalls.push(Promise.resolve(''));
      apiPrompts.mission = null;
    }
    
    // For products, only make the call if we have product pages
    if (keyProducts.length > 0) {
      apiCalls.push(generateIncrementalSection('products', productsPrompt));
      apiPrompts.products = 'products';
    } else {
      apiCalls.push(Promise.resolve(''));
      apiPrompts.products = null;
    }
    
    // For policies, only make the call if we have policy pages
    if (policies.length > 0) {
      apiCalls.push(generateIncrementalSection('policies', policiesPrompt));
      apiPrompts.policies = 'policies';
    } else {
      apiCalls.push(Promise.resolve(''));
      apiPrompts.policies = null;
    }
    
    // Make the API calls in parallel
    const [linksSection, missionSection, productsSection, policiesSection] = await Promise.all(apiCalls);
    
    // Add generated sections to the respective batches (only if we actually made the call and they have content)
    if (apiPrompts.mission && hasSectionContent(missionSection)) {
      contentBatches.mission.push(missionSection);
    }
    
    if (apiPrompts.products && hasSectionContent(productsSection)) {
      contentBatches.products.push(productsSection);
    }
    
    if (hasSectionContent(linksSection)) {
    contentBatches.links.push(linksSection);
    }
    
    if (apiPrompts.policies && hasSectionContent(policiesSection)) {
      contentBatches.policies.push(policiesSection);
    }
    
    // Log which API calls were skipped to track savings
    const skippedCalls = [];
    if (!apiPrompts.mission) skippedCalls.push('mission');
    if (!apiPrompts.products) skippedCalls.push('products');
    if (!apiPrompts.policies) skippedCalls.push('policies');
    
    if (skippedCalls.length > 0) {
      await logActivity('info', `Optimized API usage by skipping calls for: ${skippedCalls.join(', ')}`);
    }
    
    await logActivity('info', 'Batch content generation complete');
  } catch (error) {
    await logActivity('error', 'Error processing page batch:', {
      errorMessage: error.message,
      stack: error.stack
    });
  }
}

// HELPER FUNCTIONS FOR ENHANCED CRAWLING

/**
 * Check if a URL is likely a documentation page
 * @param {string} url - URL to check
 * @returns {boolean} - True if likely a documentation page
 */
function isDocumentationPage(url) {
  if (!url) return false;
  
  try {
  const lowerUrl = url.toLowerCase();
    const urlObj = new URL(lowerUrl);
    const hostname = urlObj.hostname;
    const path = urlObj.pathname;
    
    // Check for documentation-specific subdomains
    if (hostname.startsWith('docs.') || 
        hostname.startsWith('developer.') || 
        hostname.startsWith('developers.') ||
        hostname.startsWith('api.') ||
        hostname.startsWith('help.') ||
        hostname.startsWith('support.') ||
        hostname.startsWith('wiki.') ||
        hostname.startsWith('knowledge.')) {
      return true;
    }
    
    // Check for documentation paths
    if (path.includes('/docs') || 
        path.includes('/documentation') || 
        path.includes('/guide') || 
        path.includes('/guides') ||
        path.includes('/developer') ||
        path.includes('/developers') ||
        path.includes('/api') ||
        path.includes('/reference') ||
        path.includes('/getting-started') ||
        path.includes('/tutorials') ||
        path.includes('/help') ||
        path.includes('/manual') ||
        path.includes('/learn') ||
        path.includes('/knowledge') ||
        path.includes('/support') ||
        path.includes('/wiki') ||
        path.includes('/handbook') ||
        path.includes('/sdk') ||
        path.includes('/api-reference') ||
        path.includes('/faq')) {
      return true;
    }
    
    // Check for documentation-style paths with version numbers
    if (/\/v[0-9]+\/|\/v[0-9]+\.[0-9]+\/|\/docs\/[\w-]+\/[\w-]+/.test(lowerUrl)) {
      return true;
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Extract detailed page information using page evaluation
 * @param {Object} page - Playwright page object
 * @returns {Promise<Object>} - Page details
 */
async function extractPageDetails(page) {
  // Wait for any content to load
  try {
    // Wait for common documentation content selectors
    await Promise.race([
      page.waitForSelector('main', { timeout: 5000 }).catch(() => null),
      page.waitForSelector('article', { timeout: 5000 }).catch(() => null),
      page.waitForSelector('.content', { timeout: 5000 }).catch(() => null),
      page.waitForSelector('.documentation', { timeout: 5000 }).catch(() => null),
      page.waitForSelector('.docs', { timeout: 5000 }).catch(() => null),
      page.waitForTimeout(5000) // Fallback timeout
    ]);
  } catch (e) {
    // Continue even if waiting fails
  }

  return await page.evaluate(() => {
    // Get page title
    const title = document.title;
    
    // Enhanced metadata extraction
    const metadata = {};
    
    // Get meta description
    const metaDescTag = document.querySelector('meta[name="description"]');
    if (metaDescTag) {
      metadata.description = metaDescTag.getAttribute('content');
    }
    
    // Get other important meta tags
    const metaTags = Array.from(document.querySelectorAll('meta[name], meta[property]'));
    metaTags.forEach(tag => {
      const name = tag.getAttribute('name') || tag.getAttribute('property');
      const content = tag.getAttribute('content');
      if (name && content) {
        // Store important meta tags
        if (name.includes('og:') || name.includes('twitter:') || 
            name === 'keywords' || name === 'author') {
          metadata[name] = content;
        }
      }
    });
    
    // Get canonical URL if present
    const canonicalTag = document.querySelector('link[rel="canonical"]');
    if (canonicalTag) {
      metadata.canonical = canonicalTag.getAttribute('href');
    }
    
    // Get all headings with their text content
    const headingsMap = {};
    ['h1', 'h2', 'h3'].forEach(tagName => {
      headingsMap[tagName] = Array.from(document.querySelectorAll(tagName))
        .map(h => h.textContent.trim())
        .filter(h => h.length > 0);
    });
    
    // Get all link texts in the page with more specific selectors for docs
    const docsNavSelectors = [
      'nav a', '.nav a', '.navigation a', '.sidebar a', '.menu a', 
      '.toc a', '.table-of-contents a', '.docs-nav a', '.docs-sidebar a',
      '.docs-navigation a', '.docs-menu a', '.documentation-nav a',
      'aside a', '.side-nav a', '.sidebar-menu a'
    ];
    
    // Get all links, prioritizing navigation links in documentation
    const allLinks = [...document.querySelectorAll('a')];
    const navLinks = [...document.querySelectorAll(docsNavSelectors.join(','))];
    
    // Combine them, prioritizing nav links
    const pageLinks = [...new Set([...navLinks, ...allLinks])]
      .map(a => {
        // Get the visible text
        const visibleText = a.textContent.trim();
        
        // If text is very short, try to extract title or aria-label
        let text = visibleText;
        if (text.length < 2) {
          text = a.getAttribute('title') || 
                 a.getAttribute('aria-label') || 
                 a.getAttribute('alt') || 
                 text;
        }
        
        return {
          text: text,
          url: a.href,
          isNavLink: navLinks.includes(a)
        };
      })
      .filter(link => link.text && link.text.length > 0 && link.url)
      .slice(0, 300); // Increased from 30 to 100 links per page
    
    // Enhanced content extraction
    let content = '';
    // Try multiple potential content containers with broader selectors
    const contentSelectors = [
      'main', 'article', '#content', '.content', '[role="main"]',
      '.main-content', '#main-content', '.article', '.post', '.page-content',
      '.docs-content', '.documentation', '.markdown-body', '.docs-body',
      '.wiki-content', '.entry-content', '.prose', '.text-content',
      // Add more specific selectors for documentation
      '.docs', '.api-docs', '.reference-docs', '.sdk-docs', '.dev-docs',
      // Add selectors that might contain documentation content
      '[class*="doc"]', '[class*="docs"]', '[id*="doc"]', '[id*="docs"]',
      // Last resort - just use the body
      'body'
    ];
    
    // Try each potential content container
    let mainElement = null;
    for (const selector of contentSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (element && element.innerText && element.innerText.length > 150) {
        mainElement = element;
        break;
      }
      }
      if (mainElement) break;
    }
    
    // If no main content element found, use body
    if (!mainElement) {
      mainElement = document.body;
    }
    
    // Clean and extract content
    // Remove scripts, styles, and hidden elements
    const elementsToExclude = mainElement.querySelectorAll('script, style, noscript, [style*="display: none"], [style*="display:none"], [hidden]');
    for (const el of elementsToExclude) {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
    
    content = mainElement.innerText
      .replace(/\s+/g, ' ')
      .trim();
    
    // Look for structured content in documentation pages
    const structuredContent = {};

    // Extract headings hierarchy - renamed to headingElements to avoid conflict
    const headingElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    if (headingElements.length > 0) {
      structuredContent.headingHierarchy = headingElements.map(h => ({
        level: parseInt(h.tagName.substring(1)),
        text: h.textContent.trim()
      }));
    }

    // Extract lists which often contain important points
    const lists = Array.from(document.querySelectorAll('ul, ol'));
    if (lists.length > 0) {
      structuredContent.lists = lists.map(list => {
        const items = Array.from(list.querySelectorAll('li')).map(li => li.textContent.trim());
        return {
          type: list.tagName.toLowerCase(),
          items: items
        };
      });
    }
    
    // Extract code blocks which are common in documentation
    const codeBlocks = Array.from(document.querySelectorAll('pre, code, .code, .code-block, .highlight'));
    if (codeBlocks.length > 0) {
      structuredContent.codeBlocks = codeBlocks.map(block => block.textContent.trim()).filter(text => text.length > 0);
    }
    
    return { 
      title, 
      metaDescription: metadata.description, 
      headings: headingsMap, 
      pageLinks,
      content,
      structuredContent
    };
  });
}

/**
 * Clean markdown formatting from text while preserving llmstxt.org required formatting
 * @param {string} text - Text to clean
 * @returns {string} - Cleaned markdown text
 */
function cleanMarkdownFormatting(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Remove code block indicators
  let cleanedText = text.replace(/```[a-z]*\n|```/g, '');
  
  // Convert bold/italic markers (* and _) but preserve headers (#) and blockquotes (>)
  cleanedText = cleanedText.replace(/(\*\*|__)(.*?)\1/g, '$2'); // Bold
  cleanedText = cleanedText.replace(/(\*|_)(.*?)\1/g, '$2');    // Italic
  
  // Remove inline code (` `)
  cleanedText = cleanedText.replace(/`([^`]+)`/g, '$1');
  
  // DO NOT change markdown headers (#, ##) - we need to keep these
  // DO NOT change blockquotes (>) - we need to keep these
  
  // DO NOT modify link format [text](url) as this is required by llmstxt.org
  
  // Remove horizontal rules (---, ___, ***)
  cleanedText = cleanedText.replace(/^(\*{3,}|-{3,}|_{3,})$/gm, '');
  
  // Convert list markers (-, *, +) to dash for consistency but keep the formatting
  cleanedText = cleanedText.replace(/^\s*[\*+]\s+/gm, '- ');
  
  // Convert numbered list markers (1., 2., etc.) to dash lists
  cleanedText = cleanedText.replace(/^\s*\d+\.\s+/gm, '- ');
  
  // NEW: Remove AI improvement notes (paragraphs that begin with improvement descriptions)
  // This matches lines that start with a capitalized word followed by a colon
  cleanedText = cleanedText.replace(/^[A-Z][a-zA-Z]*:.*$\n?/gm, '');
  
  // NEW: Remove paragraphs that start with phrases like "This revised version" or contain common improvement phrases
  const improvementPhrases = [
    "This revised version",
    "Organization:",
    "De-duplication:",
    "URL Prioritization:",
    "Link Not Provided",
    "Inferred URLs",
    "Clarity and Conciseness:",
    "Consistent Formatting:",
    "Corrected Inconsistencies:",
    "Combined Descriptions:",
    "Removed Redundant",
    "- Removed"
  ];
  
  // Filter out paragraphs containing improvement phrases
  improvementPhrases.forEach(phrase => {
    // Match paragraphs containing these phrases (non-greedy to avoid capturing multiple paragraphs)
    const regex = new RegExp(`(^|\\n)([^\\n]*${phrase}[^\\n]*)\\n?`, 'g');
    cleanedText = cleanedText.replace(regex, '$1');
  });
  
  // NEW: Remove bullet point lists related to improvements
  // This matches bullet point lists that describe improvements
  cleanedText = cleanedText.replace(/^- (Removed|Added|Fixed|Improved|Enhanced|Updated|Consolidated).*$\n?/gm, '');
  
  // Ensure proper spacing after cleaning
  cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');
  
  // Trim excess whitespace from the beginning and end of the text
  cleanedText = cleanedText.trim();
  
  return cleanedText;
} 

/**
 * Track domain variants and related subdomains
 * @param {string} baseUrl - Original website URL
 * @returns {Object} - Domain tracking object
 */
function createDomainTracker(baseUrl) {
  let baseUrlObj;
  try {
    baseUrlObj = new URL(baseUrl);
  } catch (error) {
    console.error(`Invalid URL: ${baseUrl}`);
    // Create a fallback URL object
    baseUrlObj = new URL('http://example.com');
  }
  
  const baseDomain = baseUrlObj.hostname;
  
  // Extract the root domain (e.g., example.com from www.example.com)
  const domainParts = baseDomain.split('.');
  let rootDomain;
  
  if (domainParts.length >= 2) {
    // Handle special cases like co.uk, com.au, etc.
    if (domainParts.length >= 3 && 
        ((domainParts[domainParts.length - 2] === 'co' || 
          domainParts[domainParts.length - 2] === 'com' ||
          domainParts[domainParts.length - 2] === 'org' ||
          domainParts[domainParts.length - 2] === 'net' ||
          domainParts[domainParts.length - 2] === 'gov') && 
         domainParts[domainParts.length - 1].length === 2)) {
      // For domains like example.co.uk
      rootDomain = `${domainParts[domainParts.length - 3]}.${domainParts[domainParts.length - 2]}.${domainParts[domainParts.length - 1]}`;
    } else {
      // Standard case like example.com
      rootDomain = `${domainParts[domainParts.length - 2]}.${domainParts[domainParts.length - 1]}`;
    }
  } else {
    rootDomain = baseDomain;
  }
  
  return {
    originalUrl: baseUrl,
    originalDomain: baseDomain,
    rootDomain: rootDomain,
    domainVariants: new Set([baseDomain]),
    relatedSubdomains: new Set(),
    knownDocsDomains: new Set(),
    
    // Check if a URL belongs to a related domain
    isRelatedDomain(url) {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        // Direct match with a known domain variant
        if (this.domainVariants.has(hostname)) {
          return true;
        }
        
        // Known related subdomain
        if (this.relatedSubdomains.has(hostname)) {
          return true;
        }
        
        // Always include documentation domains
        if (hostname.startsWith('docs.') && hostname.endsWith(this.rootDomain)) {
          this.knownDocsDomains.add(hostname);
          this.relatedSubdomains.add(hostname);
          return true;
        }
        
        // Always include developer domains
        if ((hostname.startsWith('developer.') || hostname.startsWith('developers.')) && 
             hostname.endsWith(this.rootDomain)) {
          this.knownDocsDomains.add(hostname);
          this.relatedSubdomains.add(hostname);
          return true;
        }
        
        // Always include API docs
        if (hostname.startsWith('api.') && hostname.endsWith(this.rootDomain)) {
          this.knownDocsDomains.add(hostname);
          this.relatedSubdomains.add(hostname);
          return true;
        }
        
        // Check if it's a subdomain of the root domain
        if (hostname.endsWith(`.${this.rootDomain}`)) {
          // Don't crawl too many unrelated subdomains
          // but allow all potential documentation subdomains
          if (isDocumentationPage(url) || 
              hostname.includes('help') ||
              hostname.includes('support') ||
              hostname.includes('learn') ||
              hostname.includes('doc')) {
            this.knownDocsDomains.add(hostname);
            this.relatedSubdomains.add(hostname);
            return true;
          }
          
          // Limit other subdomains to avoid crawling too broadly
          // if (this.relatedSubdomains.size < 10) {
          //   this.relatedSubdomains.add(hostname);
          //   return true;
          // }
        }
        
        return false;
      } catch {
        return false;
      }
    },
    
    // Add a new domain variant or related subdomain
    addDomain(url) {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        // Add as variant if it's the same as root domain but with www. or without
        if (hostname === this.rootDomain || 
            hostname === `www.${this.rootDomain}` ||
            hostname === this.originalDomain) {
          this.domainVariants.add(hostname);
        } 
        // Add as related subdomain with special handling for documentation sites
        else if (hostname.endsWith(`.${this.rootDomain}`)) {
          this.relatedSubdomains.add(hostname);
          
          // If it's a docs domain, mark it specially
          if (hostname.startsWith('docs.') || 
              hostname.startsWith('developer.') || 
              hostname.startsWith('developers.') ||
              hostname.startsWith('api.') ||
              isDocumentationPage(`https://${hostname}/`)) {
            this.knownDocsDomains.add(hostname);
          }
        }
      } catch {
        // Ignore invalid URLs
      }
    },
    
    getRelatedDomains() {
      // Combine all domain types into one set and return
      const allDomains = new Set([...this.domainVariants, ...this.relatedSubdomains]);
      return allDomains;
    },
  };
}

/**
 * Visit a page and extract its content
 * @param {string} url - URL to visit
 * @param {object} context - Playwright browser context
 * @param {object} domainTracker - Domain tracker instance
 * @param {Set} allVisitedUrls - Set of already visited URLs
 * @param {number} depth - Current depth from homepage
 * @returns {Promise<Object|null>} - Page data or null if failed/already visited
 */
async function visitPage(url, context, domainTracker, allVisitedUrls, depth = 0) {
  // Skip if already visited
  if (allVisitedUrls.has(url)) {
    return null;
  }
  
  // Mark as visited
  allVisitedUrls.add(url);
  
  try {
    // Create a new page
    const page = await context.newPage();
    
    await logActivity('debug', `Visiting page: ${url} (depth: ${depth})`);
    
    // Try networkidle first, fall back to domcontentloaded if it times out
    let response;
    try {
      response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    } catch (error) {
      await logActivity('info', `networkidle timeout for ${url}, trying domcontentloaded`);
      response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
    }
    
    // Wait for JS to render but don't fail if it times out
    try {
      await page.waitForTimeout(2000);
    } catch (e) {
      // Continue even if timeout fails
    }
    
    // Try to wait for links but don't fail if they don't appear
    try {
      await page.waitForSelector('a', { timeout: 15000 });
    } catch (e) {
      await logActivity('debug', `No links found on page ${url} after 5s, continuing anyway`);
    }
    
    if (!response) {
      await logActivity('error', `Failed to load page: ${url}`);
      await page.close();
      return null;
    }
    
    // Handle redirects
    const finalUrl = page.url();
    if (finalUrl !== url) {
      await logActivity('info', `URL redirected: ${url} -> ${finalUrl}`);
      
      // Skip if we've already visited the redirected URL
      if (allVisitedUrls.has(finalUrl)) {
        await page.close();
        return null;
      }
      
      // Mark both the original and redirected URL as visited
      allVisitedUrls.add(finalUrl);
      
      // Add domain to tracker
      domainTracker.addDomain(finalUrl);
    }
    
    // Check if page loaded successfully
    const status = response.status();
    if (status >= 400) {
      await logActivity('error', `Page returned error status ${status}: ${finalUrl}`);
      await page.close();
      return null;
    }
    
    // Extract content and details
    try {
      // Wait a bit extra for dynamic content to load
      await page.waitForTimeout(2000);
      
      // Extract page details
      const pageDetails = await extractPageDetails(page);
      
      // Check if this is a documentation page
      const isDocumentation = isDocumentationPage(finalUrl) || 
                              (pageDetails.title && pageDetails.title.toLowerCase().includes('documentation')) ||
                              (pageDetails.metaDescription && pageDetails.metaDescription.toLowerCase().includes('documentation'));
      
      // IMPROVED: Enhanced link extraction
      const links = await page.evaluate(() => {
        // Get all links, including those in shadow DOM and dynamic content
        function getAllLinks(root) {
          const links = [];
          
          // Get regular links
          const anchors = root.querySelectorAll('a[href]');
          anchors.forEach(a => {
            const href = a.getAttribute('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript:') && 
                !href.startsWith('mailto:') && !href.startsWith('tel:')) {
              try {
                const url = new URL(href, window.location.href);
                links.push({
                  url: url.href,
                  text: a.textContent.trim() || a.getAttribute('title') || a.getAttribute('aria-label') || ''
                });
              } catch (e) {
                // Skip invalid URLs
              }
            }
          });
          
          // Check shadow roots
          const elements = root.querySelectorAll('*');
          elements.forEach(el => {
            if (el.shadowRoot) {
              links.push(...getAllLinks(el.shadowRoot));
            }
          });
          
          return links;
        }
        
        // Get links from both main document and any shadow DOMs
        return getAllLinks(document);
      });
      
      // Filter and clean the links
      const cleanedLinks = links.filter(link => 
        link.text && 
        link.text.trim() !== '' && 
        link.url && 
        !link.url.includes('#') && 
        !link.url.endsWith('.jpg') && 
        !link.url.endsWith('.png') && 
        !link.url.endsWith('.gif')
      );
      
      // Build the page data object
      const pageData = {
        title: pageDetails.title || '',
        url: finalUrl,
        content: pageDetails.content || '',
        metaDescription: pageDetails.metaDescription || '',
        headings: pageDetails.headings || [],
        structured: pageDetails.structured || null,
        links: cleanedLinks,
        isDocumentation: isDocumentation,
        depth: depth // Add depth to the page data
      };
      
      await page.close();
      
      return pageData;
    } catch (error) {
      await logActivity('error', `Error extracting content from ${finalUrl}:`, {
        errorMessage: error.message
      });
      await page.close();
      return null;
    }
  } catch (error) {
    await logActivity('error', `Failed to visit page ${url}:`, {
      errorMessage: error.message
    });
    return null;
  }
}

/**
 * Generate LLMS.txt content from batched content results
 * @param {Object} crawlResults - Results from the website crawl, including pages and content batches
 * @param {string} companyName - Name of the company
 * @param {number} batchSize - Number of pages to process in each batch
 * @returns {Promise<String>} - Generated LLMS.txt content
 */
async function generateLLMSBatchedContent(crawlResults, companyName, batchSize) {
  try {
    // Get pages and pre-generated content batches from the crawler
    const { pages, contentBatches } = crawlResults;
    
    // Get the Gemini model for consolidation
    const model = getGeminiModel('standard');
    
    // Helper function to consolidate section content from batches
    async function consolidateSection(sectionName, contentArray) {
      if (!contentArray || contentArray.length === 0) {
        await logActivity('info', `No batches found for ${sectionName} section, Skipping generation`);
        return '';
      }

        // If there's only one batch, just return it directly
      if (contentArray.length === 1) {
        return contentArray[0];
      }
      
      // For multiple batches, ask the model to consolidate and remove duplicates
      await logActivity('info', `Consolidating ${contentArray.length} batches for ${sectionName} section`);
      
      // Prepare the consolidation prompt
      const consolidationPrompt = `Below are multiple versions of the "${sectionName}" section for an LLMS.txt file for ${companyName}. These were generated from different batches of pages from the website.

Please create a single comprehensive version that:
1. Combines all unique information from the versions below
2. Removes any duplicates
3. Organizes the information logically
4. Formats it appropriately for an LLMS.txt file
5. Ensures it's clear and concise

${sectionName === 'links' ? 
`CRITICAL REQUIREMENTS FOR LINKS SECTION:
1. Include unique, real URLs from the versions below
2. DO NOT modify URLs - use them EXACTLY as they appear in the versions below
3. NEVER replace specific URLs with generic domain URLs (like changing https://docs.example.com/specific-page to https://example.com/)
4. DO NOT repeat the same URL for different entries
        5. Each link should be in the format "- [Link Title](URL): BRIEF 1 line description of the link" on its own line. If the descriptions are more than 1 sentence, shorten them to 1 SENTENCE.
        6. Organize links into logical categories
        7. MAKE SURE LINK DESCRIPTIONS ARE ONLY 1 SENTENCE LONG`: 
'IMPORTANT: DO NOT include explanatory notes or comments about how you improved or consolidated the content.'}

DO NOT include any bullet points describing your organization methods, removed duplicates, URL prioritization, or any other meta commentary about the improvements made. Only include the actual content for the LLMS.txt file.

Versions:
${contentArray.map((content, i) => `\n--- VERSION ${i+1} ---\n${content}`).join('\n')}

Create a single consolidated version of the "${sectionName}" section, starting with the same heading format as in the versions above.`;
      
      try {
        const consolidatedResult = await model.generateContent(consolidationPrompt);
        return consolidatedResult.response.text();
      } catch (error) {
        await logActivity('error', `Error consolidating ${sectionName} section:`, {
          errorMessage: error.message
        });
        // If consolidation fails, just return the longest batch as a fallback
        return contentArray.reduce((longest, current) => 
          current.length > longest.length ? current : longest, contentArray[0]);
      }
    }
    
    // Consolidate each section from batches
    await logActivity('info', 'Consolidating content from all batches for LLMS.txt');
    const [missionSection, productsSection, linksSection, policiesSection] = await Promise.all([
      consolidateSection('mission', contentBatches.mission),
      consolidateSection('products', contentBatches.products),
      consolidateSection('links', contentBatches.links),
      consolidateSection('policies', contentBatches.policies)
    ]);
    
    // Combine all sections, only including those with actual content
    const sections = [];
    sections.push(`# ${companyName}`);
    
    if (missionSection && missionSection.trim() !== '') sections.push(missionSection);
    if (productsSection && productsSection.trim() !== '') sections.push(productsSection);
    if (linksSection && linksSection.trim() !== '') sections.push(linksSection);
    if (policiesSection && policiesSection.trim() !== '') sections.push(policiesSection);
    
    const fullContent = sections.join('\n\n');

    await logActivity('info', 'LLMS.txt content generation completed', {
      contentLength: fullContent.length
    });

    return cleanMarkdownFormatting(fullContent);
  } catch (error) {
    console.error("Error in LLMS.txt generation:", error);
    throw new Error(`Error generating content: ${error.message}`);
  }
} 
// Helper function to check if a section has actual content beyond just the header
async function hasSectionContent(section) {
  if (!section) {
    await logActivity('debug', 'Section is null/undefined');
    return false;
  }

  const withoutHeader = section.replace(/^## [^\n]+\n*/g, '').trim();
  await logActivity('debug', 'Section content after header removal', { withoutHeader });
  
  if (withoutHeader.includes('were provided in the website data')) {
    await logActivity('debug', 'Section contains "were provided in the website data" message', { withoutHeader });
    return false;
  }

  // Check if the section is just a "No content" message using a more direct approach
  const noContentPatterns = [
    "No policies were provided in the website data", 
    "No information available",
    "No content available"
  ];
  
  // First check for exact matches with common messages
  for (const pattern of noContentPatterns) {
    if (withoutHeader.includes(pattern)) {
      await logActivity('debug', `Section contains "No content" message matching "${pattern}"`, { withoutHeader });
      return false;
    }
  }
  
  // Then check for patterns starting with "No" that indicate empty content
  if (withoutHeader.startsWith("No ") && (
      withoutHeader.includes(" were provided") ||
      withoutHeader.includes(" was provided") ||
      withoutHeader.includes(" found") ||
      withoutHeader.includes(" available") ||
      withoutHeader.includes(" information"))) {
    await logActivity('debug', 'Section contains "No content" message starting with "No"', { withoutHeader });
    return false;
  }
  
  // Check for empty code blocks
  if (withoutHeader === '```\n```' || withoutHeader === '```\n\n```') {
    await logActivity('debug', 'Section contains empty code block');
    return false;
  }
  
  const hasContent = withoutHeader.length > 0;
  await logActivity('debug', 'Section content check result', { 
    hasContent,
    contentLength: withoutHeader.length
  });

  return hasContent;
}

/**
 * Unified crawling function for both LLMS.txt and LLMS-full.txt generation
 * @param {string} websiteUrl - URL of the website to crawl
 * @param {string} companyName - Name of the company
 * @param {string} companyDescription - Description of the company
 * @param {Object} options - Configuration options
 * @param {number} options.maxPages - Maximum number of pages to visit (default 30)
 * @param {number} options.batchSize - Number of pages to process in each batch (default 10)
 * @param {number} options.maxDepth - Maximum depth from homepage (default 2)
 * @param {Object} options.contentBatchPrompts - Custom prompts for each section
 * @param {boolean} isFullVersion - Whether this is for llms-full.txt (true) or llms.txt (false)
 * @returns {Promise<Object>} - Object containing pages and content batches
 */
async function crawlWebsite(websiteUrl, companyName, companyDescription, options = {}, isFullVersion = false) {
  const {
    maxPages = 30,
    batchSize = 10,
    maxDepth = 2
  } = options;
  
  await logActivity('info', `Starting website crawl: ${websiteUrl}`, { maxPages, maxDepth, batchSize });
  
  // Initialize browser and context for crawling
  const browser = await playwright.chromium.launch({
    headless: true
  });
  const context = await browser.newContext({
    userAgent: 'LLMSTxtGenerator/1.0'
  });
  
  // Set up data structures for crawling
  const domainTracker = createDomainTracker(websiteUrl);
  const allVisitedUrls = new Set();
  const allQueuedUrls = new Set();
  const visitedPages = [];
  const qualityLinks = new Set(); // Track unique, quality links
  
  // Initialize the result structure with empty arrays for batches
  const contentBatches = {
    mission: [],
    products: [],
    links: [],
    policies: []
  };

  // Helper function to track quality links
  function addQualityLink(link) {
    try {
      if (!link || !link.url) return false;
      const url = new URL(link.url);
      
      // Skip if it's an anchor link, image, or media file
      if (url.hash || 
          url.pathname.match(/\.(jpg|jpeg|png|gif|mp4|mp3|pdf)$/i)) {
        return false;
      }
      
      // Skip if it's a very short or empty text
      if (!link.text || link.text.trim().length < 1) {
        return false;
      }
      
      // Add to quality links set if it passes all filters
      qualityLinks.add(link.url);
      return true;
    } catch (e) {
      return false;
    }
  }
  
  try {
    await logActivity('info', `Beginning website crawl with batching for ${websiteUrl}`, { maxPages, maxDepth });
    
    // Set for tracking all URLs we've visited or queued
    allVisitedUrls.clear(); 
    allQueuedUrls.clear();
    
    // Find the index page
    const indexPage = await visitPage(websiteUrl, context, domainTracker, allVisitedUrls, 0);
    if (!indexPage) {
      throw new Error(`Failed to load the index page: ${websiteUrl}`);
    }
    
    // Add the initial page to our results
    visitedPages.push(indexPage);
    
    // Extract links from the index page
    const linksToVisit = new Map(); // Use a Map to store links with priority score
    
    // Helper function to add links to our queue with priority
    async function addLinksToQueue(page, basePriority = 1) {
      if (!page.links || !Array.isArray(page.links)) return;
      
      // Skip if we're already at max depth
      if (page.depth >= maxDepth) {
        await logActivity('debug', `Skipping links from ${page.url} - max depth (${maxDepth}) reached`);
        return;
      }
      
      page.links.forEach(link => {
        if (!link || !link.url) return;
        
        try {
          // Skip if already queued or visited
          if (allQueuedUrls.has(link.url) || allVisitedUrls.has(link.url)) return;
          
          // Check if it's a related domain we should follow
          if (!domainTracker.isRelatedDomain(link.url)) return;
          
          // Calculate priority score for this link
          let priorityScore = basePriority;
          
          // Decrease priority based on depth
          priorityScore = priorityScore * (maxDepth - page.depth);
          
          // Increase priority for certain types of pages
          const url = link.url.toLowerCase();
          const text = (link.text || '').toLowerCase();
          
          // Documentation gets highest priority
          if (url.includes('/docs') || 
              url.includes('/documentation') || 
              url.includes('/guide') || 
              url.includes('/manual') ||
              url.includes('/help') ||
              text.includes('docs') || 
              text.includes('documentation') || 
              text.includes('guide')) {
            priorityScore += 5;
          }
          
          // API and developer pages
          else if (url.includes('/api') || 
                   url.includes('/developer') ||
                   text.includes('api') || 
                   text.includes('developer')) {
            priorityScore += 4;
          }
          
          // Product pages
          else if (url.includes('/product') || 
                   url.includes('/feature') || 
                   url.includes('/changelog') ||
                   text.includes('changelog') ||
                   text.includes('product') || 
                   text.includes('feature')) {
            priorityScore += 3;
          }
          
          // About, company info
          else if (url.includes('/about') || 
                   url.includes('/company') ||
                   url.includes('/team') ||
                   text.includes('about') || 
                   text.includes('company') ||
                   text.includes('team')) {
            priorityScore += 2;
          }
          
          // Blog, resources
          else if (url.includes('/blog') || 
                   url.includes('/resource') ||
                   url.includes('/news') ||
                   text.includes('blog') || 
                   text.includes('resource') ||
                   text.includes('news')) {
            priorityScore += 1;
          }
          
          // Policy pages
          else if (url.includes('/privacy') || 
                   url.includes('/terms') ||
                   url.includes('/policy') ||
                   url.includes('/legal') ||
                   text.includes('privacy') || 
                   text.includes('terms') ||
                   text.includes('policy') ||
                   text.includes('legal')) {
            priorityScore += 1;
          }
          
          // Add to queue with priority and depth
          linksToVisit.set(link.url, {
            url: link.url,
            text: link.text,
            priority: priorityScore,
            depth: page.depth + 1
          });
          
          // Mark as queued
          allQueuedUrls.add(link.url);
        } catch {
          // Skip invalid links
        }
      });
    }
    
    // Add index page links to queue
    addLinksToQueue(indexPage, 2); // Higher base priority for homepage links
    
    // Check for documentation/API subdomains
    const subdomains = [
      { subdomain: 'docs', label: 'Documentation' },
      { subdomain: 'developer', label: 'Developer Documentation' },
      { subdomain: 'developers', label: 'Developers Documentation' },
      { subdomain: 'api', label: 'API Documentation' },
      { subdomain: 'help', label: 'Help Center' },
      { subdomain: 'support', label: 'Support Center' },
      { subdomain: 'community', label: 'Community' },
      { subdomain: 'blog', label: 'Blog' },
      {subdomain: 'forum', label: 'Forum'}
    ];
    
    // Check all potential subdomains
    for (const { subdomain, label } of subdomains) {
      const subdomainUrl = `https://${subdomain}.${domainTracker.rootDomain}`;
      try {
        const response = await axios.head(subdomainUrl, { timeout: 5000 });
        if (response.status < 400) {
            // Add to queue with high priority
            linksToVisit.set(subdomainUrl, {
              url: subdomainUrl,
            text: label,
            priority: 10 // Very high priority
          });
          allQueuedUrls.add(subdomainUrl);
          await logActivity('info', `Added ${label} site ${subdomainUrl} to crawl queue`);
        } 
      } catch (error) {
        // Subdomain doesn't exist or isn't accessible
      }
    }
    
    // Function to get prioritized links that haven't been visited yet
    function getNextBatchOfLinks() {
      return Array.from(linksToVisit.values())
        .filter(link => !allVisitedUrls.has(link.url)) // Only unvisited links
        .sort((a, b) => b.priority - a.priority); // Descending by priority
    }
    
    // Get initial set of links to visit
    let allPrioritizedLinks = getNextBatchOfLinks().slice(0, maxPages);
    
    await logActivity('info', `Will visit up to ${maxPages} prioritized pages, starting with batch of ${allPrioritizedLinks.length}`);
    
    // Create initial batches
    let batches = [];
    for (let i = 0; i < allPrioritizedLinks.length; i += batchSize) {
      batches.push(allPrioritizedLinks.slice(i, i + batchSize));
    }
    
    await logActivity('info', `Split ${allPrioritizedLinks.length} pages into ${batches.length} batches of ${batchSize}`);
    
    let pagesVisited = 0;
    let pagesSuccessful = 0;
    
    // Process batches
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      await logActivity('info', `Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} pages`);
      
      // Visit pages in this batch concurrently
      const batchResults = await Promise.all(
        batch.map(linkObj => visitPage(linkObj.url, context, domainTracker, allVisitedUrls, linkObj.depth))
      );
      
      // Filter out null results and add to our pages collection
      const successfulPages = batchResults.filter(page => page !== null);
      visitedPages.push(...successfulPages);
      
      pagesVisited += batch.length;
      pagesSuccessful += successfulPages.length;
      
      await logActivity('info', `Batch ${batchIndex + 1} complete: ${successfulPages.length}/${batch.length} pages successful`);
      
      // Add links from these pages to our queue for subsequent batches
      successfulPages.forEach(page => {
        addLinksToQueue(page, 0.5); // Lower priority for links from deeper pages
      });
      
      // Process this batch for content if we have successful pages
      if (successfulPages.length > 0) {
        // Track quality links from successful pages
        successfulPages.forEach(page => {
          if (page.links && Array.isArray(page.links)) {
            page.links.forEach(link => addQualityLink(link));
          }
        });
        
        await processPageBatch(successfulPages, companyName, companyDescription, contentBatches, batchSize, isFullVersion);
      }
      
      // Re-evaluate the remaining links and rebuild future batches
      // This is the important fix - we need to update batches based on newly discovered links
      if (pagesVisited < maxPages) {
        // Get all prioritized links again including newly discovered ones
        const remainingLinks = getNextBatchOfLinks();
        
        // Calculate how many more pages we can visit
        const remainingLimit = maxPages - pagesVisited;
        const linksToProcess = remainingLinks.slice(0, remainingLimit);
        
        if (linksToProcess.length > 0) {
          // Clear existing future batches
          batches.splice(batchIndex + 1); 
          
          // Create new batches for remaining links
          for (let i = 0; i < linksToProcess.length; i += batchSize) {
            batches.push(linksToProcess.slice(i, i + batchSize));
          }
          
          await logActivity('info', `Updated crawl queue with ${linksToProcess.length} pages in ${batches.length - (batchIndex + 1)} new batches`);
        }
      }
      
      // Check if we've reached our max pages limit
      if (pagesVisited >= maxPages) {
        await logActivity('info', `Reached maximum page limit of ${maxPages}`);
        break;
      }
    }
    
    await logActivity('info', 'Website crawl with batching completed', { 
      pagesCount: visitedPages.length,
      urls: visitedPages.map(page => page.url),
      qualityLinksCount: qualityLinks.size,
      contentBatches: {
        mission: contentBatches.mission.length,
        products: contentBatches.products.length,
        links: contentBatches.links.length,
        policies: contentBatches.policies.length
      }
    });
    
    await logActivity('INFO', `Crawl completed - Total pages visited: ${visitedPages.length}, Unique quality links found: ${qualityLinks.size}`);
    
    return {
      pages: visitedPages,
      contentBatches: contentBatches,
      allQueuedUrls: allQueuedUrls,
      qualityLinksCount: qualityLinks.size,
      batchSize: batchSize
    };
  } catch (error) {
    await logActivity('error', `Error in crawl:`, {
      errorMessage: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Generate LLMS-full.txt content from batched content results with more comprehensive output
 * @param {Object} crawlResults - Results from the website crawl, including pages and content batches
 * @param {string} companyName - Name of the company
 * @param {string} companyDescription - Description of the company
 * @param {number} batchSize - Number of pages to process in each batch
 * @returns {Promise<String>} - Generated LLMS-full.txt content
 */
async function generateLLMSFullBatchedContent(crawlResults, companyName, companyDescription, batchSize) {
  try {
    // Get pages and pre-generated content batches from the crawler
    const { pages, contentBatches } = crawlResults;
    
    // Get the Gemini model for consolidation - use advanced model for fuller content
    const model = getGeminiModel('advanced');
    
    // Helper function to consolidate section content from batches
    async function consolidateSection(sectionName, contentArray) {
      if (!contentArray || contentArray.length === 0) {
        // If no batches were created for this section, generate it from scratch
        await logActivity('info', `No batches found for ${sectionName} section, generating from scratch`);
        
        // Prepare the data for the model
        const processedData = {
          companyName,
          companyDescription,
          pages: pages.slice(0, batchSize).map(page => ({
            title: page.title,
            metaDescription: page.metaDescription || '',
            headings: page.headings || [],
            url: page.url,
            content: page.content ? page.content.substring(0, 5000) : '' // Increased content length for fuller analysis
          }))
        };
        
        // Process links specifically to ensure diversity for the links section
        if (sectionName === 'links') {
          // Collect all links from all pages
          const allLinks = [];
          pages.forEach(page => {
            if (page.links && Array.isArray(page.links)) {
              const pageLinks = page.links.filter(link => 
                link && 
                link.url && 
                link.url.trim() !== '' && 
                link.text && 
                link.text.trim() !== '' &&
                link.text.length > 0
              );
              allLinks.push(...pageLinks);
            }
          });
          
          // Better deduplication that preserves specific paths over generic ones
          const uniqueLinks = {};
          const domainPaths = new Map();
          
          // First pass: Collect all links and organize by domain
          allLinks.forEach(link => {
            try {
              const url = new URL(link.url);
              const domain = url.hostname;
              const path = url.pathname + url.search + url.hash;
              
              //if (path === '' || path === '/') return;
              
              if (!domainPaths.has(domain)) {
                domainPaths.set(domain, new Set());
              }
              
              domainPaths.get(domain).add(path);
              
              const linkKey = `${domain}${path}`;
              
              if (!uniqueLinks[linkKey] || 
                  uniqueLinks[linkKey].text.length < link.text.length || 
                  link.text.includes(uniqueLinks[linkKey].text)) {
                uniqueLinks[linkKey] = {
                  ...link,
                  specificPath: path !== '/' && path !== ''
                };
              }
            } catch (e) {
              // Skip invalid URLs
            }
          });
          
          // Extract unique links, prioritizing specific paths
          const processedLinks = Object.values(uniqueLinks)
            .sort((a, b) => {
              if (a.specificPath && !b.specificPath) return -1;
              if (!a.specificPath && b.specificPath) return 1;
              return b.text.length - a.text.length;
            });
            
          // Categorize links with enhanced categories
          const categorizedLinks = {
            documentation: [],
            products: [],
            support: [],
            community: [],
            company: [],
            resources: [],
            technical: [], // New category for technical content
            general: []
          };
          
          processedLinks.forEach(link => {
            try {
              const url = new URL(link.url);
              const path = url.pathname.toLowerCase();
              const text = link.text.toLowerCase();
              
              if (path.includes('/docs') || path.includes('/documentation') || 
                  path.includes('/guide') || path.includes('/tutorial') || 
                  path.includes('/manual') || url.hostname.startsWith('docs.') || 
                  text.includes('docs') || text.includes('documentation') || 
                  text.includes('guide') || text.includes('manual')) {
                categorizedLinks.documentation.push(link);
              } else if (path.includes('/api') || path.includes('/sdk') || 
                        path.includes('/developer') || path.includes('/integration') || 
                        text.includes('api') || text.includes('sdk') || 
                        text.includes('developer') || text.includes('integration')) {
                categorizedLinks.technical.push(link);
              } else if (path.includes('/product') || path.includes('/feature') || 
                        path.includes('/pricing') || path.includes('/download') || 
                        text.includes('product') || text.includes('feature') || 
                        text.includes('pricing') || text.includes('download')) {
                categorizedLinks.products.push(link);
              } else if (path.includes('/support') || path.includes('/help') || 
                        path.includes('/faq') || path.includes('/ticket') || 
                        text.includes('support') || text.includes('help') || 
                        text.includes('faq') || text.includes('ticket')) {
                categorizedLinks.support.push(link);
              } else if (path.includes('/community') || path.includes('/forum') || 
                        path.includes('/discuss') || path.includes('/slack') || 
                        text.includes('community') || text.includes('forum') || 
                        text.includes('discuss') || text.includes('join')) {
                categorizedLinks.community.push(link);
              } else if (path.includes('/about') || path.includes('/team') || 
                        path.includes('/mission') || path.includes('/values') || 
                        path.includes('/contact') || path.includes('/careers') || 
                        text.includes('about') || text.includes('company') || 
                        text.includes('mission') || text.includes('values') || 
                        text.includes('contact') || text.includes('careers')) {
                categorizedLinks.company.push(link);
              } else if (path.includes('/blog') || path.includes('/resource') || 
                        path.includes('/article') || path.includes('/news') || 
                        path.includes('/media') || path.includes('/press') || 
                        text.includes('blog') || text.includes('resource') || 
                        text.includes('article') || text.includes('news')) {
                categorizedLinks.resources.push(link);
              } else {
                categorizedLinks.general.push(link);
              }
            } catch (e) {
              categorizedLinks.general.push(link);
            }
          });
          
          processedData.categorizedLinks = categorizedLinks;
          
          const allRealUrls = processedLinks.map(link => ({
            url: link.url,
            description: link.text
          }));
          
          const prompt = `Based on the following website data for ${companyName}, generate ONLY the "Important Links" section for an LLMS-full.txt file.

            This should include all complete URLs provided—assume they are valid. Do NOT skip links just because they are repetitive or have short titles. Use everything, unless it's an exact duplicate (same text + URL).

### Formatting:
- Group into logical categories if obvious (like Docs, Blog, Product, etc.)
- If not obvious, place them under "General"
- Use this format: \`- [Link Text](URL): Description\`
- It's okay to repeat the same URL more than once if the link text is different

### Guidelines:
1. DO NOT guess or fabricate new URLs
2. DO NOT modify the URLs
3. DO NOT filter out links just because they're short or generic
4. Include all links listed below—even if they seem minor or repetitive
5. Trust the data. Assume every listed URL is valid.
6. Prioritize completeness over minimalism

CATEGORIZED LINKS DATA:
${JSON.stringify(processedData.categorizedLinks || {}, null, 2)}

ALL AVAILABLE URLS:
${JSON.stringify(allRealUrls.slice(0, Math.min(allRealUrls.length, 300)), null, 2)}

            Generate ONLY the "## Important Links" section (no extra commentary). Begin with "## Important Links".`;

          try {
            console.log("allRealUrls count:", allRealUrls.length);
            await logActivity('info', `allRealUrls count: ${allRealUrls.length}`);
            const sectionResult = await model.generateContent(prompt);
            await logActivity('INFO', `Complete links section generated for LLMS-full.txt:`, {
              fullResponse: sectionResult.response.text()
            });
            return sectionResult.response.text();
          } catch (error) {
            await logActivity('error', `Error generating ${sectionName} section:`, {
              errorMessage: error.message
            });
            return ``;
          }
        }
        
        // For other sections - use enhanced prompts for LLMS-full.txt
        // Extract relevant data for specific sections
        if (sectionName === 'products') {
          processedData.products = pages
            .filter(page => {
              const lowerTitle = page.title.toLowerCase();
              const lowerUrl = page.url.toLowerCase();
              return (lowerTitle.includes('product') || 
                      lowerTitle.includes('feature') || 
                      lowerUrl.includes('product') || 
                      lowerUrl.includes('feature')) &&
                     !page.isDocumentation;
            })
            .map(page => ({
              name: page.title,
              description: page.metaDescription || '',
              url: page.url,
              content: page.content ? page.content.substring(0, 2000) : '' // Include some content for better context
            }));
        } else if (sectionName === 'policies') {
          processedData.policies = pages
            .filter(page => {
              const lowerTitle = page.title.toLowerCase();
              const lowerUrl = page.url.toLowerCase();
              return lowerTitle.includes('privacy') || 
                     lowerTitle.includes('policy') || 
                     lowerTitle.includes('terms') || 
                     lowerTitle.includes('legal') ||
                     lowerUrl.includes('privacy') || 
                     lowerUrl.includes('policy') || 
                     lowerUrl.includes('terms') || 
                     lowerUrl.includes('legal');
            })
            .map(page => ({
              title: page.title,
              url: page.url,
              description: page.metaDescription || ''
            }));
        }
        
        let prompt = '';
        switch(sectionName) {
          case 'mission':
            prompt = `Based on the following website data for ${companyName}, generate ONLY the "Mission Statement" section for an LLMS-full.txt file. This should be 2-3 detailed paragraphs that thoroughly explain:
- The company's core purpose and vision
- Long-term goals and objectives
- Impact on their industry or market
- Key values and principles
- Unique approach or methodology

IMPORTANT: DO NOT include explanatory notes or comments. Only include the actual content for the LLMS-full.txt file.

WEBSITE DATA:
${JSON.stringify(processedData, null, 2)}

Generate ONLY the mission statement section, starting with "## Mission Statement".`;
            break;
          case 'products':
            prompt = `Based on the following website data for ${companyName}, generate ONLY the "Key Products/Services" section for an LLMS-full.txt file. This should be a comprehensive overview of the company's offerings, including:
- Detailed descriptions of each major product or service
- Key features and capabilities
- Target markets or use cases
- Any unique selling points or differentiators
- Integration capabilities or ecosystem information
- Technical specifications or requirements where relevant

IMPORTANT: DO NOT include explanatory notes or comments. Only include the actual content for the LLMS-full.txt file.

WEBSITE DATA:
${JSON.stringify(processedData.products || [], null, 2)}

Generate ONLY the products/services section, starting with "## Key Products/Services".`;
            break;
          case 'policies':
            prompt = `Based on the following website data for ${companyName}, generate ONLY the "Policies" section for an LLMS-full.txt file. For each policy:
- Include the full policy title
- Add the complete URL
- Add a brief (1 line) description of what the policy covers
- Group related policies together (e.g., privacy-related, terms of service, etc.)
- Note any recent updates or version information if available

IMPORTANT: DO NOT include explanatory notes or comments. Only include the actual content for the LLMS-full.txt file.

WEBSITE DATA:
${JSON.stringify(processedData.policies || [], null, 2)}

Generate ONLY the policies section, starting with "## Policies".`;
            break;
        }
        
        try {
          const sectionResult = await model.generateContent(prompt);
          return sectionResult.response.text();
        } catch (error) {
          await logActivity('error', `Error generating ${sectionName} section:`, {
            errorMessage: error.message
          });
          return ``;
        }
      }
      
      // If we have multiple batches, consolidate them
      if (contentArray.length === 1) {
        return contentArray[0];
      }
      
      // For multiple batches, consolidate with enhanced prompts
      await logActivity('info', `Consolidating ${contentArray.length} batches for ${sectionName} section in LLMS-full.txt`);

      // Programmatically consolidate the links section
      if (sectionName === 'links') {
        // Extract URLs from content using regex
        const urlRegex = /\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g;
        let allLinks = [];
        
        // Extract all links from all batches
        let previousBatchLength = 0;
        for (let index = 0; index < contentArray.length; index++) {
          const content = contentArray[index];
          const startLength = allLinks.length;
          let matches;
          urlRegex.lastIndex = 0;

          while ((matches = urlRegex.exec(content)) !== null) {
            allLinks.push({
              text: matches[1],
              url: matches[2],
              description: "", // Will extract this if possible
            });
          }
          
          // Try to extract descriptions where available
          const descriptionRegex = /\[(.*?)\]\((https?:\/\/[^\s\)]+)\):(.*?)(?=\n|$)/g;
          descriptionRegex.lastIndex = 0;
          while ((matches = descriptionRegex.exec(content)) !== null) {
            // Find the matching link in our array and add the description
            const matchingLink = allLinks.find(link => 
              link.text === matches[1] && 
              link.url === matches[2] && 
              !link.description
            );
            
            if (matchingLink) {
              matchingLink.description = matches[3].trim();
            }
          }
          
          const batchUrlCount = allLinks.length - startLength;
          console.log(`Batch ${index + 1} contains ${batchUrlCount} URLs`);
          await logActivity('info', `Batch ${index + 1} contains ${batchUrlCount} URLs`);
          previousBatchLength = allLinks.length;
        }
        
        // Deduplicate links while preserving the best title and description
        const uniqueLinksMap = new Map();
        
        for (const link of allLinks) {
          const key = link.url;
          
          if (!uniqueLinksMap.has(key)) {
            uniqueLinksMap.set(key, link);
          } else {
            const existingLink = uniqueLinksMap.get(key);
            
            // Keep the longer text if available
            if (link.text.length > existingLink.text.length) {
              existingLink.text = link.text;
            }
            
            // Keep the longer description if available
            if (link.description && (!existingLink.description || link.description.length > existingLink.description.length)) {
              existingLink.description = link.description;
            }
          }
        }
        
        const uniqueLinks = Array.from(uniqueLinksMap.values());
        
        console.log(`Total URLs across all batches: ${allLinks.length}`);
        console.log(`Unique URLs across all batches: ${uniqueLinks.length}`);
        await logActivity('info', `Total URLs across all batches: ${allLinks.length}`);
        await logActivity('info', `Unique URLs across all batches: ${uniqueLinks.length}`);
        
        // Categorize links (similar to the existing categorization logic)
        const categorizedLinks = {
          documentation: [],
          products: [],
          support: [],
          community: [],
          company: [],
          resources: [],
          technical: [],
          general: []
        };
        
        uniqueLinks.forEach(link => {
          try {
            const url = new URL(link.url);
            const path = url.pathname.toLowerCase();
            const text = link.text.toLowerCase();
            
            if (path.includes('/docs') || path.includes('/documentation') || 
                path.includes('/guide') || path.includes('/tutorial') || 
                path.includes('/manual') || url.hostname.startsWith('docs.') || 
                text.includes('docs') || text.includes('documentation') || 
                text.includes('guide') || text.includes('manual')) {
              categorizedLinks.documentation.push(link);
            } else if (path.includes('/api') || path.includes('/sdk') || 
                      path.includes('/developer') || path.includes('/integration') || 
                      text.includes('api') || text.includes('sdk') || 
                      text.includes('developer') || text.includes('integration')) {
              categorizedLinks.technical.push(link);
            } else if (path.includes('/product') || path.includes('/feature') || 
                      path.includes('/pricing') || path.includes('/download') || 
                      text.includes('product') || text.includes('feature') || 
                      text.includes('pricing') || text.includes('download')) {
              categorizedLinks.products.push(link);
            } else if (path.includes('/support') || path.includes('/help') || 
                      path.includes('/faq') || path.includes('/ticket') || 
                      text.includes('support') || text.includes('help') || 
                      text.includes('faq') || text.includes('ticket')) {
              categorizedLinks.support.push(link);
            } else if (path.includes('/community') || path.includes('/forum') || 
                      path.includes('/discuss') || path.includes('/slack') || 
                      text.includes('community') || text.includes('forum') || 
                      text.includes('discuss') || text.includes('join')) {
              categorizedLinks.community.push(link);
            } else if (path.includes('/about') || path.includes('/team') || 
                      path.includes('/mission') || path.includes('/values') || 
                      path.includes('/contact') || path.includes('/careers') || 
                      text.includes('about') || text.includes('company') || 
                      text.includes('mission') || text.includes('values') || 
                      text.includes('contact') || text.includes('careers')) {
              categorizedLinks.company.push(link);
            } else if (path.includes('/blog') || path.includes('/resource') || 
                      path.includes('/article') || path.includes('/news') || 
                      path.includes('/media') || path.includes('/press') || 
                      text.includes('blog') || text.includes('resource') || 
                      text.includes('article') || text.includes('news')) {
              categorizedLinks.resources.push(link);
            } else {
              categorizedLinks.general.push(link);
            }
          } catch (e) {
            categorizedLinks.general.push(link);
          }
        });
        
        // Generate the final consolidated links section
        let consolidatedContent = `## Important Links\n\n`;
        
        // Helper to format links in a category
        const formatCategory = (category, title) => {
          if (category.length === 0) return '';
          
          let result = `### ${title}\n\n`;
          category.forEach(link => {
            const description = link.description || `Information about ${link.text}`;
            result += `- [${link.text}](${link.url}): ${description}\n`;
          });
          return result + '\n';
        };
        
        // Add each category to the consolidated content
        if (categorizedLinks.documentation.length > 0) {
          consolidatedContent += formatCategory(categorizedLinks.documentation, 'Documentation');
        }
        
        if (categorizedLinks.technical.length > 0) {
          consolidatedContent += formatCategory(categorizedLinks.technical, 'Technical Resources');
        }
        
        if (categorizedLinks.products.length > 0) {
          consolidatedContent += formatCategory(categorizedLinks.products, 'Products & Features');
        }
        
        if (categorizedLinks.support.length > 0) {
          consolidatedContent += formatCategory(categorizedLinks.support, 'Support');
        }
        
        if (categorizedLinks.community.length > 0) {
          consolidatedContent += formatCategory(categorizedLinks.community, 'Community');
        }
        
        if (categorizedLinks.company.length > 0) {
          consolidatedContent += formatCategory(categorizedLinks.company, 'Company');
        }
        
        if (categorizedLinks.resources.length > 0) {
          consolidatedContent += formatCategory(categorizedLinks.resources, 'Resources');
        }
        
        if (categorizedLinks.general.length > 0) {
          consolidatedContent += formatCategory(categorizedLinks.general, 'General');
        }
        
        // Count URLs in final output
        const finalUrlRegex = /\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g;
        let finalUrlMatches;
        let finalUrls = [];
        
        while ((finalUrlMatches = finalUrlRegex.exec(consolidatedContent)) !== null) {
          finalUrls.push(finalUrlMatches[2]);
        }
  
        console.log(`URLs in final consolidated output: ${finalUrls.length}`);
        await logActivity('info', `URLs in final consolidated output: ${finalUrls.length}`);

        return consolidatedContent;
      }
      
      // For non-links sections, use Gemini consolidation
      await logActivity('info', `Consolidating ${contentArray.length} batches for ${sectionName} section using Gemini`);
      
      const consolidationPrompt = `Below are multiple versions of the "${sectionName}" section for an LLMS-full.txt file for ${companyName}. These were generated from different batches of pages from the website.

Please create a single comprehensive version that:
1. Combines all unique information from the versions below
2. Removes any duplicates
3. Organizes the information logically
4. Formats it appropriately for an LLMS-full.txt file
5. Ensures it's clear and concise

IMPORTANT: 
1. DO NOT include explanatory notes or comments about the consolidation process
2. DO NOT include any meta-commentary about improvements made
3. Only include the actual content for the LLMS-full.txt file
4. Maintain the same heading format as in the versions below

Versions:
${contentArray.map((content, i) => `\n--- VERSION ${i+1} ---\n${content}`).join('\n')}

Create a single consolidated version of the "${sectionName}" section, starting with the same heading format as in the versions above.`;

      try {
        const consolidatedResult = await model.generateContent(consolidationPrompt);
        return consolidatedResult.response.text();
      } catch (error) {
        await logActivity('error', `Error consolidating ${sectionName} section:`, {
          errorMessage: error.message
        });
        // If consolidation fails, return the longest batch as a fallback
        return contentArray.reduce((longest, current) => 
          current.length > longest.length ? current : longest, contentArray[0]);
      }
    }
    
    // Consolidate each section from batches
    await logActivity('info', 'Consolidating content from all batches for LLMS-full.txt');
    const [missionSection, productsSection, linksSection, policiesSection] = await Promise.all([
      consolidateSection('mission', contentBatches.mission).then(content => {
        logActivity('info', 'Mission section details:', {
          hasMissionContent: !!content,
          missionLength: content ? content.length : 0,
          rawContent: content
        });
        return content;
      }),
      consolidateSection('products', contentBatches.products),
      consolidateSection('links', contentBatches.links),
      consolidateSection('policies', contentBatches.policies)
    ]);
    
    // Add logging before combining sections
    await logActivity('info', 'Pre-combination section lengths', {
      mission: {
        hasContent: hasSectionContent(missionSection),
        length: missionSection ? missionSection.length : 0,
        content: missionSection || 'No content'
      },
      products: {
        hasContent: hasSectionContent(productsSection),
        length: productsSection ? productsSection.length : 0,
        content: productsSection || 'No content'
      },
      links: {
        hasContent: hasSectionContent(linksSection),
        length: linksSection ? linksSection.length : 0
      },
      policies: {
        hasContent: hasSectionContent(policiesSection),
        length: policiesSection ? policiesSection.length : 0,
        content: policiesSection || 'No content'
      }
    });
    
    // Combine all sections, only including those with actual content
    const sections = [];
    sections.push(`# ${companyName}`);
    
    if (missionSection && missionSection.trim() !== '') sections.push(missionSection);
    if (productsSection && productsSection.trim() !== '') sections.push(productsSection);
    if (linksSection && linksSection.trim() !== '') sections.push(linksSection);
    if (policiesSection && policiesSection.trim() !== '') sections.push(policiesSection);
    
    const fullContent = sections.join('\n\n');

    await logActivity('info', 'LLMS-full.txt content generation completed', {
      contentLength: fullContent.length,
      includedSections: {
        mission: hasSectionContent(missionSection),
        products: hasSectionContent(productsSection),
        links: hasSectionContent(linksSection),
        policies: hasSectionContent(policiesSection)
      }
    });

    return cleanMarkdownFormatting(fullContent);
  } catch (error) {
    console.error("Error in LLMS-full.txt generation:", error);
    throw new Error(`Error generating content: ${error.message}`);
  }
}