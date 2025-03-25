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
      if (data.completePrompt) {
        logMessage += '\n[GEMINI INPUT]\n' + data.completePrompt + '\n------------------------';
      }
      else if (data.completeResponse) {
        logMessage += '\n[GEMINI OUTPUT]\n' + data.completeResponse + '\n------------------------';
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
  else if (data && data.completePrompt) {
    console.log('\n[GEMINI INPUT]');
    console.log(data.completePrompt);
    console.log('------------------------');
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
    model: "gemini-2.0-flash",
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
 * Generate standard LLMS.txt file for a company website
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
    
    // Crawl website to extract content with improved batching
    await logActivity('info', 'Beginning website crawl with batch processing');
    const crawlResults = await crawlWebsiteStandard(normalizedUrl, companyName, companyDescription);
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
    const llmsContent = await generateLLMSBatchedContent(crawlResults, companyName, companyDescription);
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
    
    // Perform deeper crawl for more comprehensive content
    await logActivity('info', 'Beginning deep website crawl');
    const crawlResults = await crawlWebsiteDeep(normalizedUrl, companyName, companyDescription);
    crawlEndTime = Date.now();
    await logActivity('info', 'Deep website crawl completed', { 
      pagesCount: crawlResults.pages.length,
      contentBatches: {
        mission: crawlResults.contentBatches.mission.length,
        products: crawlResults.contentBatches.products.length,
        links: crawlResults.contentBatches.links.length,
        policies: crawlResults.contentBatches.policies.length,
        values: crawlResults.contentBatches.values.length
      }
    });
    
    // Generate enhanced content with AI
    await logActivity('info', 'Generating comprehensive LLMS-full.txt content with AI');
    const llmsFullContent = await generateLLMSFullContent(crawlResults, companyName, companyDescription);
    geminiEndTime = Date.now();
    await logActivity('info', 'LLMS-full.txt content generation completed', { 
      contentLength: llmsFullContent.length 
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
    
    return llmsFullContent;
  } catch (error) {
    await logActivity('error', 'Error in LLMS-full.txt generation', { 
      error: error.message, stack: error.stack 
    });
    
    // Re-throw with enhanced message for the controller
    throw error;
  }
}

/**
 * Perform a deeper crawl of the website for LLMS-full.txt
 * @param {string} websiteUrl - URL of the website to crawl
 * @param {string} companyName - Name of the company
 * @param {string} companyDescription - Description of the company
 * @returns {Promise<Object>} - Object containing pages and content batches
 */
async function crawlWebsiteDeep(websiteUrl, companyName, companyDescription) {
  // Create domain tracker before launching browser
  const domainTracker = createDomainTracker(websiteUrl);
  
  const browser = await playwright.chromium.launch({
    headless: true,
    timeout: 180000 // 3 minutes timeout for the entire operation
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    javaScriptEnabled: true,  // Explicitly enable JavaScript
  });
  const page = await context.newPage();
  
  // For incremental processing
  let allPages = [];
  let contentBatches = {
    mission: [],
    products: [],
    links: [],
    policies: [],
    values: []
  };
  let batchSize = 10;
  
  try {
    await logActivity('info', `Beginning deep website crawl for ${websiteUrl}`);
    
    // When going to the main page, enable redirect handling
    const response = await page.goto(websiteUrl, { 
      waitUntil: 'networkidle',  // Wait until network is idle to ensure JS content loads
      timeout: 45000 // 45 seconds timeout for main page load
    });
    
    // Handle redirects for the initial page
    if (response) {
      const finalUrl = response.url();
      if (finalUrl !== websiteUrl) {
        await logActivity('info', `Initial URL ${websiteUrl} redirected to ${finalUrl}`);
        
        // Add the redirected domain to our tracker
        domainTracker.addDomain(finalUrl);
        
        // Update our base URL if it was a redirect
        websiteUrl = finalUrl;
      }
    }
    
    await logActivity('info', `Successfully loaded main page for deep crawl: ${page.url()}`);
    
    // Wait longer for dynamic content to load
    await page.waitForTimeout(5000);
    
    // First extract links from the main page
    await logActivity('info', 'Extracting links from main page');
    let links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors
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
            url: a.href, 
            text: text
          };
        })
        .filter(link => 
          link.url && 
          link.text && 
          link.text.length > 0
        );
    });
    
    // Filter links based on domain tracker
    links = links.filter(link => {
      try {
        return domainTracker.isRelatedDomain(link.url);
      } catch {
        return false;
      }
    });
    
    // Get all unique links
    links = [...new Map(links.map(link => [link.url, link])).values()];
    await logActivity('info', `Found ${links.length} unique links on the main page`);
    
    const allVisitedUrls = new Set();
    const allQueuedUrls = new Set(links.map(link => link.url));
    
    // Prioritize links for the main phase
    const mainPagesToVisit = prioritizeLinks(links, websiteUrl, domainTracker).slice(0, 50);
    await logActivity('info', `Will visit top ${mainPagesToVisit.length} prioritized main pages`);
    
    // Check for a direct docs site first and give it special handling
    const docsUrls = [];
    const docsUrl = `https://docs.${domainTracker.rootDomain}`;
    const developerUrl = `https://developer.${domainTracker.rootDomain}`;
    const apiUrl = `https://api.${domainTracker.rootDomain}`;
    
    // Function to check and add docs URL
    async function checkAndAddDocsUrl(url, label) {
      try {
        const response = await axios.head(url, { timeout: 5000 });
        if (response.status < 400) {
          docsUrls.push({ url, text: label });
          allQueuedUrls.add(url);
          await logActivity('info', `Added ${label} site ${url} to crawl queue`);
          return true;
        }
      } catch (error) {
        // Site doesn't exist or isn't accessible
        return false;
      }
      return false;
    }
    
    // Check for documentation sites
    if (!allQueuedUrls.has(docsUrl)) {
      await checkAndAddDocsUrl(docsUrl, 'Documentation');
    }
    
    if (!allQueuedUrls.has(developerUrl)) {
      await checkAndAddDocsUrl(developerUrl, 'Developer Documentation');
    }
    
    if (!allQueuedUrls.has(apiUrl)) {
      await checkAndAddDocsUrl(apiUrl, 'API Documentation');
    }
    
    // Add docs URLs first in the main pages to visit
    if (docsUrls.length > 0) {
      // Remove any existing docs URLs from mainPagesToVisit
      const nonDocsPages = mainPagesToVisit.filter(link => 
        !docsUrls.some(docsLink => docsLink.url === link.url)
      );
      // Put docs URLs at the beginning
      mainPagesToVisit.length = 0;
      mainPagesToVisit.push(...docsUrls, ...nonDocsPages);
    }
    
    let mainPagesVisited = 0;
    let mainPagesSuccessful = 0;
    
    // Process pages in batches to avoid memory issues
    const concurrentPages = 3; // Process 3 pages at a time
    
    // Helper function to process batches of pages for content generation
    async function processPageBatch(batchPages, companyName, companyDescription) {
      if (batchPages.length === 0) return;
      
      await logActivity('info', `Processing batch of ${batchPages.length} pages for incremental content generation`);
      
      try {
        // Get the Gemini model for content generation
        const model = getGeminiModel('advanced');
        
        // Prepare data structure for the model
        const processedData = {
          companyName,
          companyDescription,
          pages: batchPages.slice(0, 100).map(page => ({
            title: page.title,
            metaDescription: page.metaDescription || '',
            headings: page.headings || [],
            url: page.url,
            content: page.content ? page.content.substring(0, 2000) : ''
          }))
        };
        
        // Extract policies, documentation, and product info
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
        
        const documentation = batchPages
          .filter(page => page.isDocumentation)
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
        processedData.documentation = documentation;
        processedData.products = keyProducts;
        
        // Helper function to generate a section
        async function generateIncrementalSection(sectionName, sectionPrompt) {
          try {
            const sectionResult = await model.generateContent(sectionPrompt);
            return sectionResult.response.text();
      } catch (error) {
            await logActivity('error', `Error generating ${sectionName} section in batch:`, {
          errorMessage: error.message
        });
            return '';
          }
        }
        
        // Generate sections in parallel
        const missionPrompt = `Based on the following website data for ${companyName}, generate ONLY the "Mission Statement" section for an LLMS-full.txt file. This should be 2-3 paragraphs that thoroughly explain the company's purpose, vision, and core objectives.

IMPORTANT: DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS-full.txt file.

WEBSITE DATA:
${JSON.stringify(processedData, null, 2)}

Generate ONLY the mission statement section, starting with "## Mission Statement".`;
        
        const productsPrompt = `Based on the following website data for ${companyName}, generate ONLY the "Key Products/Services" section for an LLMS-full.txt file. This should be a comprehensive overview of the company's main offerings, with subsections for each major product or service category.

IMPORTANT: DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS-full.txt file.
IMPORTANT: If there is no product or service information in the provided data, return an empty string. DO NOT generate a "no information available" message.

WEBSITE DATA:
${JSON.stringify(processedData.products || [], null, 2)}

Generate ONLY the products/services section, starting with "## Key Products/Services".`;
        
        const linksPrompt = `Based on the following website data for ${companyName}, generate ONLY the "Important Links" section for an LLMS-full.txt file. This should be a comprehensive organization of all important URLs from the company website, grouped into logical categories.

IMPORTANT: DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS-full.txt file.

WEBSITE DATA:
${JSON.stringify(processedData.pages || [], null, 2)}

Generate ONLY the links section, starting with "## Important Links".`;
        
        const policiesPrompt = `Based on the following website data for ${companyName}, generate ONLY the "Policies" section for an LLMS-full.txt file. List each policy ONLY as a title followed by its URL without any description or explanation. Format each policy as "Policy Title: URL" on its own line.

IMPORTANT: DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS-full.txt file.

WEBSITE DATA:
${JSON.stringify(processedData.policies || [], null, 2)}

Generate ONLY the policies section, starting with "## Policies".`;
        
        const valuesPrompt = `Based on the following website data for ${companyName}, generate ONLY the "Company Values and Approach" section for an LLMS-full.txt file. This should be a concluding section that captures the company's ethos, approach, and core values.

IMPORTANT: DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS-full.txt file.

WEBSITE DATA:
${JSON.stringify(processedData, null, 2)}

Generate ONLY the company values and approach section, starting with "## Company Values and Approach".`;
        
        // Only generate sections if we have enough data
        const [missionSection, productsSection, linksSection, policiesSection, valuesSection] = await Promise.all([
          generateIncrementalSection('Mission', missionPrompt),
          keyProducts.length > 0 ? generateIncrementalSection('Products', productsPrompt) : '',
          processedData.pages.length > 0 ? generateIncrementalSection('Links', linksPrompt) : '',
          policies.length > 0 ? generateIncrementalSection('Policies', policiesPrompt) : '',
          generateIncrementalSection('Values', valuesPrompt)
        ]);
        
        // Add generated sections to our batches
        if (missionSection) contentBatches.mission.push(missionSection);
        if (productsSection) contentBatches.products.push(productsSection);
        if (linksSection) contentBatches.links.push(linksSection);
        if (policiesSection) contentBatches.policies.push(policiesSection);
        if (valuesSection) contentBatches.values.push(valuesSection);
        
        await logActivity('info', `Successfully generated content for batch of ${batchPages.length} pages`);
      } catch (error) {
        await logActivity('error', `Error processing batch for content generation:`, {
          errorMessage: error.message
        });
      }
    }
    
    // Process main pages
    for (let i = 0; i < mainPagesToVisit.length; i += concurrentPages) {
      const batch = mainPagesToVisit.slice(i, i + concurrentPages);
      const results = await Promise.all(
        batch.map(linkObj => visitPage(linkObj.url, context, domainTracker, allVisitedUrls))
      );
      
      mainPagesVisited += batch.length;
      
      for (const pageData of results) {
        if (pageData) {
          allPages.push(pageData);
          mainPagesSuccessful++;
          
          // Process links from this page, with special handling for documentation pages
          if (pageData.isDocumentation) {
            await logActivity('info', `Found documentation page: ${pageData.url}`);
            
            // Extract documentation links from the page immediately
            if (pageData.pageLinks && pageData.pageLinks.length > 0) {
              let docLinks = pageData.pageLinks.filter(link => {
                try {
                  const url = new URL(link.url);
                  // Only include links that are part of the same docs site
                  return domainTracker.isRelatedDomain(link.url) && 
                         (isDocumentationPage(link.url) || url.hostname.includes('docs'));
                } catch (e) {
                  return false;
                }
              });
              
              // Add new doc links to our links array and queue
              for (const docLink of docLinks) {
              if (!allQueuedUrls.has(docLink.url)) {
                links.push(docLink);
                allQueuedUrls.add(docLink.url);
                  await logActivity('debug', `Added documentation link: ${docLink.url}`);
                }
              }
            }
          }
        }
      }
      
      // Process this batch for content generation if we have enough pages
      if (allPages.length >= batchSize && allPages.length % batchSize === 0) {
        // Only extract from the most recent batch
        const batchToProcess = allPages.slice(allPages.length - batchSize);
        await processPageBatch(batchToProcess, companyName, companyDescription);
      }
    }
    
    await logActivity('info', `Completed main pages crawl. Visited ${mainPagesVisited}, extracted ${mainPagesSuccessful}, total links found: ${allQueuedUrls.size}`);
    
    // Process documentation pages more aggressively
    const docIndexPages = Array.from(allQueuedUrls)
      .filter(url => isDocumentationPage(url))
      .map(url => ({ url, text: 'Documentation' }));
    
    await logActivity('info', `Found ${docIndexPages.length} documentation pages to process`);
    
    // Now process all documentation pages - crawl these more deeply
    // This ensures we don't miss documentation subpages
    const docPagesToVisit = links
      .filter(link => isDocumentationPage(link.url) && !allVisitedUrls.has(link.url))
      .slice(0, 200); // Increased from 100 to 200 to get more doc pages
    
    await logActivity('info', `Will visit ${docPagesToVisit.length} documentation pages for deeper crawl`);
    
    let docPagesVisited = 0;
    let docPagesSuccessful = 0;
    
    // Use a set to track docs links we've found during crawling
    const foundDocLinks = new Set();
    
    // Helper function to extract and process documentation links
    async function processDocLinks(pageInstance, baseUrl) {
      try {
        // Properly wait for navigation and content
        await pageInstance.waitForLoadState('networkidle');
        
        // First try to find typical documentation navigation elements
        const docLinks = await pageInstance.evaluate(() => {
          // Look for common documentation navigation elements
      const navSelectors = [
            // Navigation specific elements
            'nav a', '.nav a', '.sidebar a', '.toc a', '.table-of-contents a',
            '.docs-nav a', '.docs-sidebar a', '.docs-navigation a', '.docs-menu a',
            '.documentation-nav a', 'aside a', '.side-nav a', '.sidebar-menu a',
            // Documentation specific elements
            '.docs a', '.documentation a', '.api-docs a', '.ref-docs a',
            '.guides a', '.tutorials a', '.examples a', '.handbook a',
            // General content links that might be documentation
            'main a', 'article a', '.content a', '.doc-content a'
          ];
          
          // Get all navigation links
      const navLinks = Array.from(document.querySelectorAll(navSelectors.join(', ')));
          
          // Get all links on the page as a fallback
          const allLinks = Array.from(document.querySelectorAll('a'));
          
          // Combine, prioritizing nav links, and remove duplicates
          const combinedLinks = [...new Set([...navLinks, ...allLinks])];
          
          return combinedLinks
            .map(a => ({
                url: a.href, 
              text: a.textContent.trim() || a.getAttribute('title') || 'Documentation Link',
              isNavLink: navLinks.includes(a)
            }))
            .filter(link => link.url && link.text && link.text.length > 0);
        });
        
        return docLinks;
      } catch (error) {
        await logActivity('error', `Error extracting links from ${baseUrl}:`, {
          errorMessage: error.message
        });
        return [];
      }
    }
    
    // Process docs pages in smaller batches to be more thorough
    const docConcurrentPages = 2; // Lower concurrency for more reliable processing
    
    for (let i = 0; i < docPagesToVisit.length; i += docConcurrentPages) {
      const batch = docPagesToVisit.slice(i, i + docConcurrentPages);
      
      // First visit the pages to extract content
      const results = await Promise.all(
        batch.map(docLink => visitPage(docLink.url, context, domainTracker, allVisitedUrls))
      );
      
      docPagesVisited += batch.length;
      
      // Process each successful page to extract more documentation links
      for (const pageData of results) {
        if (pageData) {
          allPages.push(pageData);
          docPagesSuccessful++;
          
          // For each docs page, also visit it to extract more links
          try {
            const pageInstance = await context.newPage();
            await pageInstance.goto(pageData.url, { 
          waitUntil: 'networkidle',
              timeout: 30000
            });
            
            // Extract documentation links
            const extractedLinks = await processDocLinks(pageInstance, pageData.url);
            await pageInstance.close();
            
            // Add any new documentation links
            let newDocLinks = 0;
            for (const link of extractedLinks) {
              if (!allQueuedUrls.has(link.url) && !foundDocLinks.has(link.url) &&
                  domainTracker.isRelatedDomain(link.url) && 
                  isDocumentationPage(link.url)) {
                
                links.push(link);
                allQueuedUrls.add(link.url);
                foundDocLinks.add(link.url);
                
                // Also add to the docPagesToVisit if we haven't reached our limit
                if (docPagesToVisit.length < 200) {
                  docPagesToVisit.push(link);
                }
                
            newDocLinks++;
            }
          }
            
            if (newDocLinks > 0) {
              await logActivity('info', `Found ${newDocLinks} new documentation links from ${pageData.url}`);
        }
      } catch (error) {
            await logActivity('error', `Error processing documentation page ${pageData.url}:`, {
          errorMessage: error.message
        });
          }
        }
      }
      
      // Process this batch for content generation if we have enough pages
      if (allPages.length >= batchSize && allPages.length % batchSize === 0) {
        // Only extract from the most recent batch
        const batchToProcess = allPages.slice(allPages.length - batchSize);
        await processPageBatch(batchToProcess, companyName, companyDescription);
      }
    }
    
    // Process remaining important pages
    const remainingLinks = Array.from(allQueuedUrls)
      .filter(url => !allVisitedUrls.has(url))
      .map(url => ({ url, text: 'Link' }));
    
    await logActivity('info', `Have ${remainingLinks.length} unvisited links remaining`);
    
    // Give higher priority to remaining documentation pages
    const additionalPagesToVisit = prioritizeLinks(remainingLinks, websiteUrl, domainTracker)
      .slice(0, 50); // Limit to 50 more pages
    
    await logActivity('info', `Will visit up to ${additionalPagesToVisit.length} additional high-priority pages`);
    
    let additionalPagesVisited = 0;
    let additionalPagesSuccessful = 0;
    
    // Process additional pages in batches
    for (let i = 0; i < additionalPagesToVisit.length; i += concurrentPages) {
      const batch = additionalPagesToVisit.slice(i, i + concurrentPages);
      const results = await Promise.all(
        batch.map(linkObj => visitPage(linkObj.url, context, domainTracker, allVisitedUrls))
      );
      
      additionalPagesVisited += batch.length;
      
      for (const pageData of results) {
        if (pageData) {
          allPages.push(pageData);
          additionalPagesSuccessful++;
        }
      }
      
      // Process this batch for content generation if we have enough new pages
      if (allPages.length % batchSize === 0) {
        // Only extract from the most recent batch
        const batchToProcess = allPages.slice(allPages.length - Math.min(batchSize, batch.length));
        await processPageBatch(batchToProcess, companyName, companyDescription);
      }
    }
    
    // Process any remaining pages that haven't been processed yet
    const remainingBatch = allPages.length % batchSize;
    if (remainingBatch > 0) {
      const batchToProcess = allPages.slice(allPages.length - remainingBatch);
      await processPageBatch(batchToProcess, companyName, companyDescription);
    }
    
    await logActivity('info', `Deep website crawl completed.`, { 
      totalPagesExtracted: allPages.length,
      uniqueUrlsVisited: allVisitedUrls.size,
      totalLinksDiscovered: allQueuedUrls.size,
      mainPhasePagesVisited: mainPagesVisited,
      mainPhasePagesSuccessful: mainPagesSuccessful,
      docPhasePagesVisited: docPagesVisited,
      docPhasePagesSuccessful: docPagesSuccessful,
      additionalPhasePagesVisited: additionalPagesVisited,
      additionalPhasePagesSuccessful: additionalPagesSuccessful,
      knownDocsDomains: Array.from(domainTracker.knownDocsDomains),
      foundDocLinks: foundDocLinks.size,
      contentBatchesGenerated: {
        mission: contentBatches.mission.length,
        products: contentBatches.products.length,
        links: contentBatches.links.length,
        policies: contentBatches.policies.length,
        values: contentBatches.values.length
      }
    });
    
    return {
      pages: allPages,
      contentBatches: contentBatches,
      allQueuedUrls: allQueuedUrls
    };
  } finally {
    await browser.close();
  }
}

/**
 * Perform a standard crawl of the website for LLMS.txt with batch processing
 * @param {string} websiteUrl - URL of the website to crawl
 * @param {string} companyName - Name of the company
 * @param {string} companyDescription - Description of the company
 * @returns {Promise<Object>} - Object containing pages and content batches
 */
async function crawlWebsiteStandard(websiteUrl, companyName, companyDescription) {
  await logActivity('info', `Starting standard website crawl: ${websiteUrl}`);
  
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
  
  // Initialize the result structure with empty arrays for batches
  const contentBatches = {
    mission: [],
    products: [],
    links: [],
    policies: []
  };
  
  const MAX_PAGES_TO_VISIT = 30;
  const MAX_DEPTH = 2; // Maximum depth from homepage
  const BATCH_SIZE = 50;
  
  try {
    await logActivity('info', `Beginning standard website crawl with batching for ${websiteUrl}`);
    
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
      if (page.depth >= MAX_DEPTH) {
        await logActivity('debug', `Skipping links from ${page.url} - max depth (${MAX_DEPTH}) reached`);
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
          priorityScore = priorityScore * (MAX_DEPTH - page.depth);
          
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
    let allPrioritizedLinks = getNextBatchOfLinks().slice(0, MAX_PAGES_TO_VISIT);
    
    await logActivity('info', `Will visit up to ${MAX_PAGES_TO_VISIT} prioritized pages, starting with batch of ${allPrioritizedLinks.length}`);
    
    // Create initial batches
    let batches = [];
    for (let i = 0; i < allPrioritizedLinks.length; i += BATCH_SIZE) {
      batches.push(allPrioritizedLinks.slice(i, i + BATCH_SIZE));
    }
    
    await logActivity('info', `Split ${allPrioritizedLinks.length} pages into ${batches.length} batches of ${BATCH_SIZE}`);
    
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
        await processPageBatch(successfulPages, companyName, companyDescription, contentBatches, BATCH_SIZE);
      }
      
      // Re-evaluate the remaining links and rebuild future batches
      // This is the important fix - we need to update batches based on newly discovered links
      if (pagesVisited < MAX_PAGES_TO_VISIT) {
        // Get all prioritized links again including newly discovered ones
        const remainingLinks = getNextBatchOfLinks();
        
        // Calculate how many more pages we can visit
        const remainingLimit = MAX_PAGES_TO_VISIT - pagesVisited;
        const linksToProcess = remainingLinks.slice(0, remainingLimit);
        
        if (linksToProcess.length > 0) {
          // Clear existing future batches
          batches.splice(batchIndex + 1); 
          
          // Create new batches for remaining links
          for (let i = 0; i < linksToProcess.length; i += BATCH_SIZE) {
            batches.push(linksToProcess.slice(i, i + BATCH_SIZE));
          }
          
          await logActivity('info', `Updated crawl queue with ${linksToProcess.length} pages in ${batches.length - (batchIndex + 1)} new batches`);
        }
      }
      
      // Check if we've reached our max pages limit
      if (pagesVisited >= MAX_PAGES_TO_VISIT) {
        await logActivity('info', `Reached maximum page limit of ${MAX_PAGES_TO_VISIT}`);
        break;
      }
    }
    
    await logActivity('info', `Standard website crawl with batching completed. Visited ${pagesVisited} pages, successfully extracted ${pagesSuccessful} pages`);
    
    // After processing all pages, log summary
    await logActivity('INFO', `Crawl completed - pages visited: ${visitedPages.length}`);
    
    return {
      pages: visitedPages,
      contentBatches: contentBatches,
      allQueuedUrls: allQueuedUrls
    };
      } catch (error) {
    await logActivity('error', `Error in standard crawl:`, {
      errorMessage: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Process a batch of pages to generate content sections
 * @param {Array} batchPages - Array of page objects to process
 * @param {string} companyName - Company name
 * @param {string} companyDescription - Company description
 * @param {Object} contentBatches - Object containing arrays for content batches
 * @param {number} BATCH_SIZE - Number of pages to process in each batch
 */
async function processPageBatch(batchPages, companyName, companyDescription, contentBatches, BATCH_SIZE) {
  if (batchPages.length === 0) return;
  
  await logActivity('info', `Processing batch of ${batchPages.length} pages for incremental content generation`);
  
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
      fullBatchPages: processedData.pages.map(page => ({
        url: page.url,
        title: page.title,
        content: page.content // Full content being sent to Gemini
      }))
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
      // Log the FULL prompt being sent to Gemini, not just a preview
      await logActivity('INFO', `Full prompt being sent to Gemini for ${sectionName} section`, {
        completePrompt: sectionPrompt // Log the entire prompt
      });
      
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
    const missionPrompt = `Based on the following website data for ${companyName}, generate the "Mission Statement" section for an LLMS.txt file ONLY if there is content, making sure not to include "## Mission Statment" if this is the case. This should be 1-2 sentences that explain the company's purpose and core objectives.

IMPORTANT: 
1. DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS.txt file.
2. If there is no missionn statement information in the provided data, return an empty string WITHOUT any section headers
3. DO NOT include "## Mission Statement" if there is no content to display
4. Only include the section header if you have actual mission statement information to share

WEBSITE DATA:
${JSON.stringify(processedData, null, 2)}

Generate ONLY the mission statement section, starting with "## Mission Statement".`;
    
    const productsPrompt = `Based on the following website data for ${companyName}, generate ONLY the "Key Products/Services" section for an LLMS.txt file. This should be a brief overview of the company's main offerings.

IMPORTANT: 
1. DO NOT include explanatory notes or comments
2. If there is no product or service information in the provided data, return an empty string WITHOUT any section headers
3. DO NOT include "## Key Products/Services" if there is no content to display
4. Only include the section header if you have actual product/service information to share

WEBSITE DATA:
${JSON.stringify(processedData.products || [], null, 2)}

Generate the products/services section, including the "## Key Products/Services" header ONLY if you have content.`;
    
    const linksPrompt = `Based on the following website data for ${companyName}, generate ONLY the "Important Links" section for an LLMS.txt file.

This section MUST include different, real URLs from the company website, carefully organized into logical categories. Each link should be in the format "- [Link Title](URL): 1 line description about the link" on its own line.

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
4. Only include the section header if you have actual important links to share

WEBSITE DATA:
${JSON.stringify(processedData.pages || [], null, 2)}

Generate ONLY the links section, starting with "## Important Links".`;
    
    const policiesPrompt = `Based on the following website data for ${companyName}, generate ONLY the "Policies" section for an LLMS.txt file. List each policy as a title followed by its URL.

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
    
    // Add generated sections to the respective batches (only if we actually made the call)
    if (apiPrompts.mission) contentBatches.mission.push(missionSection);
    if (apiPrompts.products) contentBatches.products.push(productsSection);
    contentBatches.links.push(linksSection);
    if (apiPrompts.policies) contentBatches.policies.push(policiesSection);
    
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
      .filter(link => link.text && link.text.length > 1 && link.url)
      .slice(0, 100); // Increased from 30 to 100 links per page
    
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
 * Prioritize links based on importance
 * @param {Array} links - Array of link objects
 * @param {string} websiteUrl - Base URL of the website
 * @param {Object} domainTracker - Domain tracker object
 * @returns {Array} - Prioritized array of link objects
 */
function prioritizeLinks(links, websiteUrl, domainTracker) {
  // Filter out external links, anchors, etc.
  const filteredLinks = links.filter(link => {
    try {
    const url = new URL(link.url);
    
      // Keep only links from related domains (checked with domainTracker)
      return domainTracker.isRelatedDomain(link.url) &&
           // Filter out common non-content pages
           !url.pathname.includes('/wp-admin/') &&
           !url.pathname.includes('/wp-login.php') &&
           !url.pathname.endsWith('.jpg') &&
           !url.pathname.endsWith('.png') &&
           !url.pathname.endsWith('.gif') &&
           !url.pathname.endsWith('.pdf') &&
             // Filter out anchor links within the same page
           !link.url.includes('#') &&
           // Filter out duplicate links
           links.findIndex(l => l.url === link.url) === links.indexOf(link);
    } catch (error) {
      return false;
    }
  });
  
  // Score and sort links by importance
  const scoredLinks = filteredLinks.map(link => {
    let score = 0;
    const lowerText = (link.text || '').toLowerCase();
    const lowerUrl = link.url.toLowerCase();
    
    // Super high priority for documentation pages
    if (isDocumentationPage(link.url)) {
      score += 50;  // Give very high priority to any documentation page
      
      // Even higher priority for key documentation pages
      if (lowerUrl.includes('/docs/getting-started') || 
          lowerUrl.includes('/docs/introduction') ||
          lowerUrl.includes('/docs/overview') ||
          lowerUrl.includes('/docs/guides') ||
          lowerUrl.includes('/docs/tutorials') ||
          lowerUrl.includes('/api/reference') ||
          lowerUrl.includes('/api-reference') ||
          lowerUrl.endsWith('/docs') ||
          lowerUrl.endsWith('/documentation') ||
          lowerUrl.endsWith('/api')) {
        score += 30;
      }
      
      // Priority for API documentation
      if (lowerUrl.includes('/api') || lowerText.includes('api')) {
        score += 25;
      }
      
      // Priority for SDK or developer documentation
      if (lowerUrl.includes('/sdk') || 
          lowerUrl.includes('/developer') ||
          lowerText.includes('sdk') ||
          lowerText.includes('developer')) {
        score += 20;
      }
    }
    
    // Check if this is a related subdomain
    try {
      const hostname = new URL(link.url).hostname;
      if (domainTracker.knownDocsDomains.has(hostname)) {
        score += 40; // Very high priority for known documentation domains
      }
      else if (domainTracker.relatedSubdomains.has(hostname)) {
        score += 5; // Some priority for related subdomains
      }
    } catch {
      // Ignore URL parsing errors
    }
    
    // Prioritize important pages
    if (lowerUrl.includes('/about') || lowerText.includes('about')) score += 10;
    if (lowerUrl.includes('/product') || lowerText.includes('product')) score += 8;
    if (lowerUrl.includes('/service') || lowerText.includes('service')) score += 8;
    if (lowerUrl.includes('/feature') || lowerText.includes('feature')) score += 7;
    if (lowerUrl.includes('/pricing') || lowerText.includes('pricing')) score += 6;
    if (lowerUrl.includes('/contact') || lowerText.includes('contact')) score += 5;
    if (lowerUrl.includes('/blog') || lowerText.includes('blog')) score += 4;
    
    // Prioritize policy pages
    if (lowerUrl.includes('/privacy') || lowerText.includes('privacy')) score += 6;
    if (lowerUrl.includes('/term') || lowerText.includes('term')) score += 6;
    if (lowerUrl.includes('/legal') || lowerText.includes('legal')) score += 6;
    
    // Special priority for navigation links
    if (link.isNavLink) {
      score += 15;
    }
    
    // Lower priority for deep paths, but not for documentation
    if (!isDocumentationPage(link.url)) {
      try {
        const pathSegments = new URL(link.url).pathname.split('/').filter(Boolean);
      score -= pathSegments.length;
      } catch {
        // Ignore URL parsing errors
      }
    }
    
    return { ...link, score };
  });
  
  // Sort by score (highest first)
  return scoredLinks.sort((a, b) => b.score - a.score);
}

/**
 * Generate content for LLMS-full.txt using Google Generative AI
 * @param {Array} pages - Array of page data with titles and content
 * @param {String} companyName - Name of the company 
 * @param {String} companyDescription - Description of the company
 * @returns {Promise<String>} - Generated LLMS-full.txt content
 */
async function generateLLMSFullContent(crawlResults, companyName, companyDescription) {
  try {
    // Get pages and pre-generated content batches from the crawler
    const { pages, contentBatches } = crawlResults;
    
    // Get the Gemini model for more detailed content and final consolidation
    const model = getGeminiModel('advanced');
    
    // Helper function to deduplicate and consolidate content from batches
    async function consolidateSection(sectionName, contentArray) {
      if (!contentArray || contentArray.length === 0) {
        // If no batches were created for this section, generate it from scratch
        await logActivity('info', `No batches found for ${sectionName} section, generating from scratch`);
        
        // Prepare the data for the model
        const processedData = processWebsiteDataForLLMSFull(pages, companyName, companyDescription);
        
        let prompt = '';
        switch(sectionName) {
          case 'mission':
            prompt = `Based on the following website data for ${companyName}, generate ONLY the "Mission Statement" section for an LLMS-full.txt file. This should be 2-3 paragraphs that thoroughly explain the company's purpose, vision, and core objectives.

IMPORTANT: DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS-full.txt file.

WEBSITE DATA:
${JSON.stringify(processedData, null, 2)}

Generate ONLY the mission statement section, starting with "## Mission Statement".`;
            break;
          case 'products':
            prompt = `Based on the following website data for ${companyName}, generate ONLY the "Key Products/Services" section for an LLMS-full.txt file. This should be a comprehensive overview of the company's main offerings, with subsections for each major product or service category.

IMPORTANT: DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS-full.txt file.
IMPORTANT: If there is no product or service information in the provided data, return an empty string. DO NOT generate a "no information available" message.

WEBSITE DATA:
${JSON.stringify(processedData.products || [], null, 2)}

Generate ONLY the products/services section, starting with "## Key Products/Services".`;
            break;
          case 'links':
            prompt = `Based on the following website data for ${companyName}, generate ONLY the "Important Links" section for an LLMS-full.txt file. This should be a comprehensive organization of all important URLs from the company website, grouped into logical categories.

IMPORTANT: DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS-full.txt file.

WEBSITE DATA:
${JSON.stringify(processedData.pages || [], null, 2)}

Generate ONLY the links section, starting with "## Important Links".`;
            break;
          case 'policies':
            prompt = `Based on the following website data for ${companyName}, generate ONLY the "Policies" section for an LLMS-full.txt file. List each policy ONLY as a title followed by its URL without any description or explanation. Format each policy as "Policy Title: URL" on its own line.

IMPORTANT: DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS-full.txt file.

WEBSITE DATA:
${JSON.stringify(processedData.policies || [], null, 2)}

Generate ONLY the policies section, starting with "## Policies".`;
            break;
          case 'values':
            prompt = `Based on the following website data for ${companyName}, generate ONLY the "Company Values and Approach" section for an LLMS-full.txt file. This should be a concluding section that captures the company's ethos, approach, and core values.

IMPORTANT: DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS-full.txt file.

WEBSITE DATA:
${JSON.stringify(processedData, null, 2)}

Generate ONLY the company values and approach section, starting with "## Company Values and Approach".`;
            break;
        }
        
        // Log the FULL prompt being sent to Gemini, not just a preview
        await logActivity('INFO', `Full prompt being sent to Gemini for ${sectionName} section (LLMS-full)`, {
          completePrompt: prompt // Log the entire prompt
        });
        
        try {
          const sectionResult = await model.generateContent(prompt);
          // Log the full response from Gemini
          await logActivity('INFO', `Full response received from Gemini for ${sectionName} section (LLMS-full)`, {
            completeResponse: sectionResult.response.text()
          });
          return sectionResult.response.text();
        } catch (error) {
          await logActivity('error', `Error generating ${sectionName} section:`, {
            errorMessage: error.message
          });
          return `## ${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)}\n\nNo information available.`;
        }
      }
      
      // If we have multiple batches, consolidate them
      if (contentArray.length === 1) {
        // If there's only one batch, just return it directly
        return contentArray[0];
      }
      
      // For multiple batches, ask the model to consolidate and remove duplicates
      await logActivity('info', `Consolidating ${contentArray.length} batches for ${sectionName} section`);
      
      // Log consolidation input
      await logActivity('INFO', `Consolidating section: ${sectionName}`, {
          batchCount: contentArray.length,
          totalContentLength: contentArray.reduce((sum, content) => sum + content.length, 0)
      });
      
      // Log a sample of content being consolidated (first batch)
      if (contentArray.length > 0) {
          await logActivity('DEBUG', `Sample content for ${sectionName}:`, {
              sampleContent: contentArray[0].substring(0, 300) + '...'
          });
      }
      
      // Prepare the consolidation prompt
      const consolidationPrompt = `Below are multiple versions of the "${sectionName}" section for an LLMS-full.txt file for ${companyName}. These were generated from different batches of pages from the website.

Please create a single comprehensive version that:
1. Combines all unique information from the versions below
2. Removes any duplicates
3. Organizes the information logically
4. Formats it appropriately for an LLMS-full.txt file
5. Ensures it's clear and concise

IMPORTANT: DO NOT include explanatory notes or comments about how you improved or consolidated the content. DO NOT include any bullet points describing your organization methods, removed duplicates, URL prioritization, or any other meta commentary about the improvements made. Only include the actual content for the LLMS-full.txt file.

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
    await logActivity('info', 'Consolidating content from all batches');
    const [missionSection, productsSection, linksSection, policiesSection, valuesSection] = await Promise.all([
      consolidateSection('mission', contentBatches.mission),
      consolidateSection('products', contentBatches.products),
      consolidateSection('links', contentBatches.links),
      consolidateSection('policies', contentBatches.policies),
      consolidateSection('values', contentBatches.values)
    ]);
    
    // Combine all sections
    const fullContent = `# ${companyName}${
      hasSectionContent(missionSection) ? `\n\n${missionSection}` : ''
    }${
      hasSectionContent(productsSection) ? `\n\n${productsSection}` : ''
    }${
      hasSectionContent(linksSection) ? `\n\n${linksSection}` : ''
    }${
      hasSectionContent(policiesSection) ? `\n\n${policiesSection}` : ''
    }`;

    await logActivity('info', 'LLMS-full.txt content generation completed', {
      contentLength: fullContent.length
    });

    return cleanMarkdownFormatting(fullContent);
  } catch (error) {
    console.error("Error in LLMS-full.txt generation:", error);
    return `Error generating content: ${error.message}`;
  }
}

/**
 * Process website data specifically for LLMS-full.txt generation
 * This extracts features, policies, and other structured data from pages
 */
function processWebsiteDataForLLMSFull(pages, companyName, companyDescription) {
  // Extract policies (privacy policy, terms of service, etc.)
  const policies = pages
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
  
  // Extract documentation pages
  const documentation = pages
    .filter(page => page.isDocumentation)
    .map(page => ({
      title: page.title,
      url: page.url
    }));
  
  // Extract product pages
  const products = pages
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
  
  // Extract FAQ pages
  const faqs = pages
    .filter(page => {
      const lowerTitle = page.title.toLowerCase();
      const lowerUrl = page.url.toLowerCase();
      return lowerTitle.includes('faq') || 
             lowerTitle.includes('frequently asked') || 
             lowerUrl.includes('faq') || 
             lowerUrl.includes('frequently-asked');
    })
    .map(page => ({
      question: page.title,
      url: page.url
    }));
  
  // Find contact information
  const contactPage = pages.find(page => {
    const lowerTitle = page.title.toLowerCase();
    const lowerUrl = page.url.toLowerCase();
    return lowerTitle.includes('contact') || 
           lowerUrl.includes('contact');
  });
  
  // Prepare simplified pages data
  const simplifiedPages = pages.map(page => ({
    title: page.title,
    url: page.url,
    isDocumentation: page.isDocumentation || false
  }));
  
  // Return structured data
  return {
    companyName,
    companyDescription,
    baseUrl: pages.length > 0 ? new URL(pages[0].url).origin : '',
    pages: simplifiedPages,
    policies,
    documentation,
    products,
    faqs,
    contact: contactPage ? {
      title: contactPage.title,
      url: contactPage.url
    } : null
  };
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
 * Normalize URL by removing fragments, query parameters, and trailing slashes
 * @param {string} url - URL to normalize
 * @returns {string} - Normalized URL
 */
function normalizeUrl(url) {
  try {
    // Parse the URL
    const parsedUrl = new URL(url);
    
    // Remove fragment
    parsedUrl.hash = '';
    
    // Remove query parameters
    parsedUrl.search = '';
    
    // Get the pathname and remove trailing slash if present
    let path = parsedUrl.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    parsedUrl.pathname = path;
    
    return parsedUrl.toString();
  } catch (error) {
    // If URL parsing fails, return the original URL
    console.error(`Error normalizing URL ${url}:`, error.message);
    return url;
  }
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
    
    // Navigate to URL with appropriate timeouts and wait strategy
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.waitForTimeout(2000); // Wait for JS to render
    await page.waitForSelector('a'); // Wait for links to appear
    
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
 * @param {string} companyDescription - Description of the company
 * @returns {Promise<String>} - Generated LLMS.txt content
 */
async function generateLLMSBatchedContent(crawlResults, companyName, companyDescription) {
  try {
    // Get pages and pre-generated content batches from the crawler
    const { pages, contentBatches } = crawlResults;
    
    // Get the Gemini model for consolidation
    const model = getGeminiModel('standard');
    
    // Helper function to consolidate section content from batches
    async function consolidateSection(sectionName, contentArray) {
      if (!contentArray || contentArray.length === 0) {
        // If no batches were created for this section, generate it from scratch
        await logActivity('info', `No batches found for ${sectionName} section, generating from scratch`);
        
        // Get the Gemini model
        const model = getGeminiModel('standard');
        
        // Prepare the data for the model
        const processedData = {
          companyName,
          companyDescription,
          pages: pages.slice(0, 50).map(page => ({ // Increased from 30 to 50 pages
            title: page.title,
            metaDescription: page.metaDescription || '',
            headings: page.headings || [],
            url: page.url,
            content: page.content ? page.content.substring(0, 2000) : '' // Increased from 1000 to 2000
          }))
        };
        
        // IMPROVED: Process links specifically to ensure diversity for the links section
        if (sectionName === 'links') {
          // Collect all links from all pages
          const allLinks = [];
          pages.forEach(page => {
            if (page.links && Array.isArray(page.links)) {
              // Filter for unique links with meaningful labels
              const pageLinks = page.links.filter(link => 
                link && 
                link.url && 
                link.url.trim() !== '' && 
                link.text && 
                link.text.trim() !== '' &&
                link.text.length > 1
              );
              allLinks.push(...pageLinks);
            }
          });
          
          // IMPROVED: Better deduplication that preserves specific paths over generic ones
          const uniqueLinks = {};
          const domainPaths = new Map(); // Track which domains have which paths
          
          // First pass: Collect all links and organize by domain
          allLinks.forEach(link => {
            try {
              const url = new URL(link.url);
              const domain = url.hostname;
              const path = url.pathname + url.search + url.hash;
              
              // Skip tracking of empty paths or just '/'
              if (path === '' || path === '/') return;
              
              // Initialize domain tracking if needed
              if (!domainPaths.has(domain)) {
                domainPaths.set(domain, new Set());
              }
              
              // Add this path to the domain's set
              domainPaths.get(domain).add(path);
              
              // Store full link object with a key that includes path details
              const linkKey = `${domain}${path}`;
              
              // Only replace if the new link text is better
              if (!uniqueLinks[linkKey] || 
                  uniqueLinks[linkKey].text.length < link.text.length || 
                  link.text.includes(uniqueLinks[linkKey].text)) {
                uniqueLinks[linkKey] = {
                  ...link,
                  specificPath: path !== '/' && path !== '' // Flag if this is a specific path
                };
              }
            } catch (e) {
              // Skip invalid URLs
              console.error(`Error processing URL ${link.url}: ${e.message}`);
            }
          });
          
          // Extract unique links, prioritizing specific paths
          const processedLinks = Object.values(uniqueLinks)
            // Sort to prioritize links with specific paths
            .sort((a, b) => {
              // First prioritize by whether it has a specific path
              if (a.specificPath && !b.specificPath) return -1;
              if (!a.specificPath && b.specificPath) return 1;
              // Then by text length as a proxy for description quality
              return b.text.length - a.text.length;
            });
            
          // Categorize links
          const categorizedLinks = {
            documentation: [],
            products: [],
            support: [],
            community: [],
            company: [],
            resources: [],
            general: []
          };
          
          // IMPROVED: Better categorization
          processedLinks.forEach(link => {
            try {
              const url = new URL(link.url);
              const domain = url.hostname;
              const path = url.pathname.toLowerCase();
              const text = link.text.toLowerCase();
              
              // Assign to categories based on URL or text content (more specific categorization)
              if (path.includes('/docs') || path.includes('/documentation') || 
                  path.includes('/guide') || path.includes('/tutorial') || 
                  path.includes('/manual') || domain.startsWith('docs.') || 
                  text.includes('docs') || text.includes('documentation') || 
                  text.includes('guide') || text.includes('manual')) {
                categorizedLinks.documentation.push(link);
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
              // If URL parsing fails, put in general category
              categorizedLinks.general.push(link);
            }
          });
          
          // Add to processed data
          processedData.categorizedLinks = categorizedLinks;
          
          // Create a list of all real URLs with their descriptions for explicit reference
          const allRealUrls = processedLinks.map(link => ({
            url: link.url,
            description: link.text
          }));
          
          // IMPROVED: Enhanced prompt to emphasize using real URLs
          const prompt = `Based on the following website data for ${companyName}, generate ONLY the "Important Links" section for an LLMS.txt file.

This section MUST include different, real URLs from the company website, carefully organized into logical categories. Each link should be in the format "- Link Description: URL" on its own line.

CRITICAL REQUIREMENTS:
1. You MUST ONLY use the EXACT URLs provided in the data below - DO NOT modify them or create placeholder URLs
2. Include unique links from the data (more if available)
3. DO NOT repeat the same URL for different entries
4. NEVER use generic URLs like "https://domain.com/" when more specific URLs are available
5. Include links from all available categories in the data (documentation, products, blog, etc.)
6. DO NOT include explanatory notes or meta-commentary

CATEGORIZED LINKS DATA:
${JSON.stringify(processedData.categorizedLinks || {}, null, 2)}

ALL AVAILABLE URLS:
${JSON.stringify(allRealUrls.slice(0, 50), null, 2)}

Generate ONLY the links section, starting with "## Important Links".`;

          try {
            const sectionResult = await model.generateContent(prompt);
            // Log the complete response
            await logActivity('INFO', `Complete links section generated:`, {
              fullResponse: sectionResult.response.text()
            });
      return sectionResult.response.text();
          } catch (error) {
            await logActivity('error', `Error generating ${sectionName} section:`, {
              errorMessage: error.message
            });
            return `## ${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)}\n\nNo information available.`;
          }
        }
        
        // For other sections - use original approach
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
              url: page.url
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
              url: page.url
            }));
        }
        
        let prompt = '';
        switch(sectionName) {
          case 'mission':
            prompt = `Based on the following website data for ${companyName}, generate ONLY the "Mission Statement" section for an LLMS.txt file. This should be 1-2 sentences that explain the company's purpose and core objectives.

IMPORTANT: DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS.txt file.

WEBSITE DATA:
${JSON.stringify(processedData, null, 2)}

Generate ONLY the mission statement section, starting with "## Mission Statement".`;
            break;
          case 'products':
            prompt = `Based on the following website data for ${companyName}, generate ONLY the "Key Products/Services" section for an LLMS.txt file. This should be an overview of the company's main offerings.

IMPORTANT: DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS.txt file.
IMPORTANT: If there is no product or service information in the provided data, return an empty string. DO NOT generate a "no information available" message.

WEBSITE DATA:
${JSON.stringify(processedData.products || [], null, 2)}

Generate ONLY the products/services section, starting with "## Key Products/Services".`;
            break;
          case 'policies':
            prompt = `Based on the following website data for ${companyName}, generate ONLY the "Policies" section for an LLMS.txt file. List each policy as a title followed by its URL.

IMPORTANT: DO NOT include explanatory notes or comments about how you improved the content. DO NOT include any bullet points describing your organization methods or any other meta commentary about the improvements made. Only include the actual content for the LLMS.txt file.

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
          return `## ${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)}\n\nNo information available.`;
        }
      }
      
      // If we have multiple batches, consolidate them
      if (contentArray.length === 1) {
        // If there's only one batch, just return it directly
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
5. Each link should be in the format "- [Link Title](URL): 1 line description of the link" on its own line
6. Organize links into logical categories` : 
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
    
    // Combine all sections
    const fullContent = `# ${companyName}

${missionSection}

${productsSection}

${linksSection}

${policiesSection}`;

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
function hasSectionContent(section) {
  if (!section) return false;
  const withoutHeader = section.replace(/^## [^\n]+\n*/g, '').trim();
  return withoutHeader.length > 0;
}