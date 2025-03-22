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

/**
 * Enhanced logging system for LLMS generator
 * @param {string} level - Log level (info, warn, error, debug)
 * @param {string} message - Message to log
 * @param {Object} [data] - Optional data to include in log
 */
async function logActivity(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(data ? { data } : {})
  };
  
  // Console output for immediate visibility
  const logColors = {
    info: '\x1b[32m', // green
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
    debug: '\x1b[36m'  // cyan
  };
  
  const resetColor = '\x1b[0m';
  console.log(`${logColors[level] || ''}[${timestamp}][${level.toUpperCase()}] ${message}${resetColor}`);
  
  if (data) {
    console.log(data);
  }
  
  try {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, '../../logs');
    await fs.mkdir(logsDir, { recursive: true });
    
    // Write to file based on date
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `llms-generator-${today}.log`);
    
    // Append to log file
    await fs.appendFile(
      logFile, 
      JSON.stringify(logEntry) + '\n',
      'utf8'
    );
  } catch (err) {
    console.error('Error writing to log file:', err);
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
    maxOutputTokens: 8000,
    topP: 0.9,
    topK: 40
  };
  
  const advancedConfig = {
    temperature: 0.2,
    maxOutputTokens: 30000,  // Much larger for comprehensive outputs
    topP: 0.95,
    topK: 40
  };
  
  // Use Pro model for advanced tasks (like LLMS-full.txt generation)
  if (modelType === 'advanced') {
    return genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: advancedConfig
    });
  }
  
  // Use standard model for regular tasks (like LLMS.txt generation)
  return genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    generationConfig: standardConfig
  });
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
  await logActivity('info', 'Starting LLMS.txt generation', { 
    companyName, websiteUrl, email 
  });
  
  try {
    // Validate and normalize URL
    const normalizedUrl = urlUtils.normalizeUrl(websiteUrl);
    await logActivity('debug', 'Normalized URL for crawling', { 
      original: websiteUrl, normalized: normalizedUrl 
    });
    
    // Crawl website to extract content
    await logActivity('info', 'Beginning website crawl');
    const pages = await crawlWebsite(normalizedUrl);
    await logActivity('info', 'Website crawl completed', { 
      pagesCount: pages.length 
    });
    
    // Generate content with AI
    await logActivity('info', 'Generating LLMS.txt content with AI');
    const llmsContent = await generateLLMSContent(pages, companyName, companyDescription);
    await logActivity('info', 'LLMS.txt content generation completed', { 
      contentLength: llmsContent.length 
    });
    
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
    const pages = await crawlWebsiteDeep(normalizedUrl);
    await logActivity('info', 'Deep website crawl completed', { 
      pagesCount: pages.length 
    });
    
    // Generate enhanced content with AI
    await logActivity('info', 'Generating comprehensive LLMS-full.txt content with AI');
    const llmsFullContent = await generateLLMSFullContent(pages, companyName, companyDescription);
    await logActivity('info', 'LLMS-full.txt content generation completed', { 
      contentLength: llmsFullContent.length 
    });
    
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
 * Crawl website to extract important pages
 * @param {string} websiteUrl - URL of the website to crawl
 * @returns {Promise<Array>} - Array of page objects with title, url, and content
 */
async function crawlWebsite(websiteUrl) {
  const browser = await playwright.chromium.launch({
    headless: true,
    timeout: 60000 // Increase timeout to 1 minute
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await logActivity('info', `Beginning website crawl for ${websiteUrl}`);
    await page.goto(websiteUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 // Keep 30 seconds timeout for page load
    });
    
    // Wait a bit extra for any JavaScript to execute
    await page.waitForTimeout(3000);
    
    await logActivity('info', `Successfully loaded main page: ${websiteUrl}`);
    
    // Extract links from the main page
    const links = await page.evaluate(() => {
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
          
          // For privacy/terms pages, inspect parent elements for context
          if (!text && (a.href.includes('privacy') || a.href.includes('terms'))) {
            const parentText = a.closest('li, div, p')?.textContent.trim();
            if (parentText && parentText.length < 100) {
              text = parentText;
            }
          }
          
          return { 
            url: a.href, 
            text: text
          };
        })
        .filter(link => 
          link.url && 
          link.text && 
          link.text.length > 0 && 
          link.url.startsWith(window.location.origin)
        );
    });
    
    if (links.length === 0) {
      await logActivity('warn', `No links found on the main page: ${websiteUrl}`);
    } else {
      await logActivity('info', `Found ${links.length} links on the main page`);
    }
    
    // Filter and prioritize important pages
    const importantLinks = prioritizeLinks(links, websiteUrl);
    await logActivity('info', `Prioritized ${importantLinks.length} links for crawling`);
    
    // Limit to top 50 most important pages to keep processing time reasonable
    const pagesToVisit = importantLinks.slice(0, 50);
    await logActivity('info', `Will visit top ${pagesToVisit.length} prioritized pages`);
    
    // Visit each page and extract content
    const pages = [];
    let visitedCount = 0;
    let successCount = 0;
    
    for (const linkObj of pagesToVisit) {
      visitedCount++;
      
      try {
        await logActivity('debug', `Visiting page ${visitedCount}/${pagesToVisit.length}: ${linkObj.url}`);
        await page.goto(linkObj.url, { 
          waitUntil: 'domcontentloaded',
          timeout: 15000 // 15 seconds timeout for each subpage
        });
        
        // Extract page title and main content
        const pageData = await page.evaluate(() => {
          // Get page title
          const title = document.title;
          
          // Get main content (prioritize main, article, or content divs)
          let mainContent = '';
          const mainElement = document.querySelector('main') || 
                            document.querySelector('article') || 
                            document.querySelector('.content') ||
                            document.querySelector('#content') ||
                            document.body;
          
          if (mainElement) {
            // Strip out scripts, styles, and hidden elements
            const elementsToExclude = mainElement.querySelectorAll('script, style, [style*="display: none"], [style*="display:none"]');
            elementsToExclude.forEach(el => {
              if (el.parentNode) {
                el.parentNode.removeChild(el);
              }
            });
            
            mainContent = mainElement.textContent.trim().replace(/\s+/g, ' ');
          }
          
          return {
            title,
            content: mainContent,
          };
        });
        
        // Add the page to our results if it has content
        if (pageData.content && pageData.content.length > 100) {
          pages.push({
            title: pageData.title,
            url: linkObj.url,
            content: pageData.content.substring(0, 5000) // Limit content size
          });
          successCount++;
          await logActivity('debug', `Successfully extracted content from: ${linkObj.url}`, {
            titleLength: pageData.title.length,
            contentLength: pageData.content.length
          });
        } else {
          await logActivity('warn', `Page had insufficient content: ${linkObj.url}`);
        }
      } catch (error) {
        await logActivity('error', `Error visiting page ${linkObj.url}:`, {
          errorMessage: error.message
        });
        // Continue with next page
        continue;
      }
    }
    
    await logActivity('info', `Website crawl completed. Visited ${visitedCount} pages, successfully extracted ${successCount} pages`);
    return pages;
  } finally {
    await browser.close();
  }
}

/**
 * Perform a deeper crawl of the website for LLMS-full.txt
 * @param {string} websiteUrl - URL of the website to crawl
 * @returns {Promise<Array>} - Array of page objects with title, url, and content
 */
async function crawlWebsiteDeep(websiteUrl) {
  // Similar to crawlWebsite but with more pages and deeper content extraction
  const browser = await playwright.chromium.launch({
    headless: true,
    timeout: 180000 // 3 minutes timeout for the entire operation
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();
  
  try {
    await logActivity('info', `Beginning deep website crawl for ${websiteUrl}`);
    await page.goto(websiteUrl, { 
      waitUntil: 'networkidle',
      timeout: 45000 // 45 seconds timeout for main page load
    });
    
    await logActivity('info', `Successfully loaded main page for deep crawl: ${websiteUrl}`);
    
    // Wait for dynamic content to load
    await page.waitForTimeout(3000);
    
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
          
          // For privacy/terms pages, inspect parent elements for context
          if (!text && (a.href.includes('privacy') || a.href.includes('terms'))) {
            const parentText = a.closest('li, div, p')?.textContent.trim();
            if (parentText && parentText.length < 100) {
              text = parentText;
            }
          }
          
          return { 
            url: a.href, 
            text: text
          };
        })
        .filter(link => 
          link.url && 
          link.text && 
          link.text.length > 0 && 
          link.url.startsWith(window.location.origin)
        );
    });
    
    // Get all unique links
    links = [...new Map(links.map(link => [link.url, link])).values()];
    await logActivity('info', `Found ${links.length} unique links on the main page`);
    
    // Look for navigation elements specifically - these often contain important links
    const navLinks = await page.evaluate(() => {
      const navSelectors = [
        'nav a', 'header a', '.nav a', '.navigation a', '.menu a', 
        '.navbar a', '.header a', '.top-menu a', '.main-menu a',
        '.global-nav a', '.primary-nav a', '.site-header a', '.site-nav a'
      ];
      
      const navLinks = Array.from(document.querySelectorAll(navSelectors.join(', ')));
      return navLinks
        .map(a => {
          return { 
            url: a.href, 
            text: a.textContent.trim() || a.getAttribute('title') || a.getAttribute('aria-label') || 'Navigation Link'
          };
        })
        .filter(link => 
          link.url && 
          link.text && 
          link.url.startsWith(window.location.origin)
        );
    });
    
    await logActivity('info', `Found ${navLinks.length} navigation menu links`);
    
    // Add nav links to our collection
    for (const navLink of navLinks) {
      if (!links.some(link => link.url === navLink.url)) {
        links.push(navLink);
      }
    }
    
    // Now visit additional key pages if they aren't in the links yet
    const baseUrl = new URL(websiteUrl);
    const keyPaths = [
      '/about', '/about-us', '/company', 
      '/products', '/services', '/features',
      '/pricing', '/plans',
      '/docs', '/documentation', '/developers',
      '/api', '/developers/api',
      '/blog', '/news',
      '/contact', '/support',
      '/privacy', '/privacy-policy',
      '/terms', '/terms-of-service',
      '/legal', '/license',
      '/download', '/downloads',
      '/help', '/faq',
      '/team', '/careers'
    ];
    
    // Add potential key pages to our link list
    let keyPagesAdded = 0;
    for (const path of keyPaths) {
      const potentialUrl = new URL(path, baseUrl).toString();
      if (!links.some(link => link.url === potentialUrl)) {
        links.push({ url: potentialUrl, text: path.replace('/', '') });
        keyPagesAdded++;
      }
    }
    await logActivity('info', `Added ${keyPagesAdded} key pages to crawl list`);
    
    // ENHANCED: Look for documentation pages specifically
    const docLinks = links.filter(link => {
      const url = link.url.toLowerCase();
      return isDocumentationPage(url);
    });
    await logActivity('info', `Found ${docLinks.length} potential documentation links`);
    
    // We will visit more pages and do a deeper crawl
    const allVisitedUrls = new Set();
    const allQueuedUrls = new Set(links.map(link => link.url)); // Track URLs we've already queued
    const pages = [];
    
    // First prioritize and visit main navigation links
    const mainPagesToVisit = prioritizeLinks(links, websiteUrl).slice(0, 150); // Up from 60
    await logActivity('info', `Will visit top ${mainPagesToVisit.length} prioritized main pages`);
    
    let mainPagesVisited = 0;
    let mainPagesSuccessful = 0;
    let totalLinksFound = links.length;
    
    for (const linkObj of mainPagesToVisit) {
      if (allVisitedUrls.has(linkObj.url)) {
        await logActivity('debug', `Skipping already visited page: ${linkObj.url}`);
        continue;
      }
      
      mainPagesVisited++;
      
      try {
        await logActivity('debug', `Visiting main page ${mainPagesVisited}/${mainPagesToVisit.length}: ${linkObj.url}`);
        await page.goto(linkObj.url, { 
          waitUntil: 'networkidle',
          timeout: 20000 // 20 seconds timeout for each subpage
        });
        
        // Mark as visited
        allVisitedUrls.add(linkObj.url);
        
        // Wait for dynamic content
        await page.waitForTimeout(1000);
        
        // Extract page data
        const pageData = await extractPageDetails(page);
        
        if (pageData.content && pageData.content.length > 150) {
          // Format headings for better usability
          const formattedHeadings = [];
          if (pageData.headings.h1 && pageData.headings.h1.length > 0) {
            formattedHeadings.push(...pageData.headings.h1);
          }
          if (pageData.headings.h2 && pageData.headings.h2.length > 0) {
            formattedHeadings.push(...pageData.headings.h2.slice(0, 10)); // Top 10 h2 headings
          }
          
          pages.push({
            title: pageData.title,
            url: linkObj.url,
            metaDescription: pageData.metaDescription,
            headings: formattedHeadings,
            links: pageData.pageLinks,
            content: pageData.content.substring(0, 10000) // Increased from 8000
          });
          
          mainPagesSuccessful++;
          await logActivity('debug', `Successfully extracted content from main page: ${linkObj.url}`, {
            titleLength: pageData.title.length,
            contentLength: pageData.content.length,
            headingsCount: formattedHeadings.length
          });
          
          // IMPORTANT: Process all links from this page to discover more content
          if (pageData.pageLinks && pageData.pageLinks.length > 0) {
            let newLinksAdded = 0;
            
            for (const pageLink of pageData.pageLinks) {
              // Only add links we haven't seen before
              if (!allQueuedUrls.has(pageLink.url)) {
                links.push(pageLink);
                allQueuedUrls.add(pageLink.url);
                newLinksAdded++;
              }
            }
            
            totalLinksFound += newLinksAdded;
            await logActivity('info', `Found ${newLinksAdded} new links on ${linkObj.url}, total links: ${totalLinksFound}`);
          }
          
          // For documentation pages, collect their links for recursive crawling
          if (isDocumentationPage(linkObj.url)) {
            await logActivity('info', `Found documentation page: ${linkObj.url}`);
            
            // Try to find more documentation-specific links
            const docSpecificLinks = await page.evaluate(() => {
              // Look specifically in documentation navigation, sidebars, etc.
              const docNavSelectors = [
                '.docs-nav a', '.docs-sidebar a', '.documentation-nav a',
                '.doc-nav a', '.api-nav a', '.sidebar-nav a',
                '.toc a', '.table-of-contents a', '.sidebar a'
              ];
              
              const docNavLinks = Array.from(document.querySelectorAll(docNavSelectors.join(', ')));
              return docNavLinks
                .map(a => {
                  return { 
                    url: a.href, 
                    text: a.textContent.trim() || a.getAttribute('title') || 'Documentation Link'
                  };
                })
                .filter(link => 
                  link.url && 
                  link.text && 
                  link.url.startsWith(window.location.origin)
                );
            });
            
            let newDocLinks = 0;
            // Add unique sublinks to our collection
            for (const docLink of docSpecificLinks) {
              if (!allQueuedUrls.has(docLink.url)) {
                links.push(docLink);
                allQueuedUrls.add(docLink.url);
                newDocLinks++;
                
                // Also add to docLinks collection
                if (!docLinks.some(link => link.url === docLink.url)) {
                  docLinks.push(docLink);
                }
              }
            }
            
            await logActivity('info', `Added ${newDocLinks} new documentation-specific links from ${linkObj.url}`);
          }
        } else {
          await logActivity('warn', `Main page had insufficient content: ${linkObj.url}`);
        }
      } catch (error) {
        await logActivity('error', `Error visiting main page ${linkObj.url}:`, {
          errorMessage: error.message
        });
        // Continue with next page
      }
    }
    
    await logActivity('info', `Completed main pages crawl. Visited ${mainPagesVisited}, extracted ${mainPagesSuccessful}, total links found: ${totalLinksFound}`);
    
    // Check if there's a main documentation index page
    const docIndexPages = docLinks.filter(link => {
      const url = link.url.toLowerCase();
      return url.endsWith('/docs') || 
             url.endsWith('/docs/') ||
             url.endsWith('/documentation') ||
             url.endsWith('/documentation/') ||
             url.includes('/docs/index') ||
             url.includes('/documentation/index') ||
             url === baseUrl.origin + '/api' ||
             url === baseUrl.origin + '/api/' ||
             url === baseUrl.origin + '/developer' ||
             url === baseUrl.origin + '/developer/';
    });
    
    await logActivity('info', `Found ${docIndexPages.length} documentation index pages to process first`);

    // Process documentation index pages first and with higher limits
    for (const indexPage of docIndexPages) {
      if (allVisitedUrls.has(indexPage.url)) {
        await logActivity('debug', `Skipping already visited doc index page: ${indexPage.url}`);
        continue;
      }
      
      try {
        await logActivity('info', `Processing documentation index page: ${indexPage.url}`);
        await page.goto(indexPage.url, { 
          waitUntil: 'networkidle',
          timeout: 30000 // Longer timeout for index pages
        });
        
        // Mark as visited
        allVisitedUrls.add(indexPage.url);
        
        // Get ALL links from index pages
        const indexLinks = await page.evaluate(() => {
          // Get ALL links on the page
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
              link.text.length > 1 && 
              link.url.startsWith(window.location.origin)
            );
        });
        
        await logActivity('info', `Found ${indexLinks.length} links on documentation index page: ${indexPage.url}`);
        
        // Add all these links to our docLinks collection
        let newDocLinks = 0;
        for (const indexLink of indexLinks) {
          if (!allQueuedUrls.has(indexLink.url)) {
            links.push(indexLink);
            allQueuedUrls.add(indexLink.url);
            newDocLinks++;
            
            // Also add to docLinks collection
            if (!docLinks.some(link => link.url === indexLink.url)) {
              docLinks.push(indexLink);
            }
          }
        }
        await logActivity('info', `Added ${newDocLinks} new links from documentation index page`);
        totalLinksFound += newDocLinks;
      } catch (error) {
        await logActivity('error', `Error processing documentation index page ${indexPage.url}:`, {
          errorMessage: error.message
        });
      }
    }
    
    // ENHANCED: Now specifically target documentation pages with deeper crawling
    // Re-prioritize docLinks with any new ones we found
    const docPagesToVisit = prioritizeLinks(docLinks, websiteUrl).slice(0, 300); // Up from 150
    await logActivity('info', `Will visit ${docPagesToVisit.length} documentation pages for deeper crawl`);
    
    let docPagesVisited = 0;
    let docPagesSuccessful = 0;
    
    for (const docLink of docPagesToVisit) {
      if (allVisitedUrls.has(docLink.url)) {
        await logActivity('debug', `Skipping already visited documentation page: ${docLink.url}`);
        continue;
      }
      
      docPagesVisited++;
      
      try {
        await logActivity('debug', `Visiting documentation page ${docPagesVisited}/${docPagesToVisit.length}: ${docLink.url}`);
        await page.goto(docLink.url, { 
          waitUntil: 'networkidle',
          timeout: 20000 
        });
        
        // Mark as visited
        allVisitedUrls.add(docLink.url);
        
        // Wait for dynamic content
        await page.waitForTimeout(1000);
        
        // Extract documentation-specific details
        const pageData = await extractPageDetails(page);
        
        if (pageData.content && pageData.content.length > 150) {
          // For documentation pages, collect more headings and structure
          const formattedHeadings = [];
          if (pageData.headings.h1 && pageData.headings.h1.length > 0) {
            formattedHeadings.push(...pageData.headings.h1);
          }
          if (pageData.headings.h2 && pageData.headings.h2.length > 0) {
            formattedHeadings.push(...pageData.headings.h2);
          }
          if (pageData.headings.h3 && pageData.headings.h3.length > 0) {
            formattedHeadings.push(...pageData.headings.h3.slice(0, 10));
          }
          
          pages.push({
            title: pageData.title,
            url: docLink.url,
            metaDescription: pageData.metaDescription,
            headings: formattedHeadings,
            links: pageData.pageLinks,
            content: pageData.content.substring(0, 10000), // Increased from 8000
            isDocumentation: true
          });
          
          docPagesSuccessful++;
          await logActivity('debug', `Successfully extracted content from documentation page: ${docLink.url}`, {
            titleLength: pageData.title.length,
            contentLength: pageData.content.length,
            headingsCount: formattedHeadings.length
          });
          
          // IMPORTANT: Also collect links from documentation pages to find more doc pages
          if (pageData.pageLinks && pageData.pageLinks.length > 0) {
            let newDocLinksAdded = 0;
            
            for (const pageLink of pageData.pageLinks) {
              // Only add links we haven't seen before
              if (!allQueuedUrls.has(pageLink.url)) {
                links.push(pageLink);
                allQueuedUrls.add(pageLink.url);
                newDocLinksAdded++;
                
                // If it looks like a doc link, add to docLinks collection for later processing
                if (isDocumentationPage(pageLink.url) && !docLinks.some(link => link.url === pageLink.url)) {
                  docLinks.push(pageLink);
                }
              }
            }
            
            if (newDocLinksAdded > 0) {
              totalLinksFound += newDocLinksAdded;
              await logActivity('info', `Found ${newDocLinksAdded} new links on doc page ${docLink.url}, total: ${totalLinksFound}`);
            }
          }
        } else {
          await logActivity('warn', `Documentation page had insufficient content: ${docLink.url}`);
        }
      } catch (error) {
        await logActivity('error', `Error visiting documentation page ${docLink.url}:`, {
          errorMessage: error.message
        });
      }
    }
    
    // At this point, we might have discovered many more links
    // Let's process a third batch focusing on any important pages we missed
    
    // Get all unvisited links
    const remainingLinks = links.filter(link => !allVisitedUrls.has(link.url));
    await logActivity('info', `Have ${remainingLinks.length} unvisited links remaining`);
    
    // Prioritize them
    const additionalPagesToVisit = prioritizeLinks(remainingLinks, websiteUrl).slice(0, 200);
    await logActivity('info', `Will visit up to ${additionalPagesToVisit.length} additional high-priority pages`);
    
    let additionalPagesVisited = 0;
    let additionalPagesSuccessful = 0;
    
    for (const linkObj of additionalPagesToVisit) {
      if (allVisitedUrls.has(linkObj.url)) {
        continue;
      }
      
      additionalPagesVisited++;
      
      try {
        await logActivity('debug', `Visiting additional page ${additionalPagesVisited}/${additionalPagesToVisit.length}: ${linkObj.url}`);
        await page.goto(linkObj.url, { 
          waitUntil: 'networkidle',
          timeout: 20000 
        });
        
        // Mark as visited
        allVisitedUrls.add(linkObj.url);
        
        // Extract page data
        const pageData = await extractPageDetails(page);
        
        if (pageData.content && pageData.content.length > 150) {
          const formattedHeadings = [];
          if (pageData.headings.h1 && pageData.headings.h1.length > 0) {
            formattedHeadings.push(...pageData.headings.h1);
          }
          if (pageData.headings.h2 && pageData.headings.h2.length > 0) {
            formattedHeadings.push(...pageData.headings.h2.slice(0, 10));
          }
          
          pages.push({
            title: pageData.title,
            url: linkObj.url,
            metaDescription: pageData.metaDescription,
            headings: formattedHeadings,
            content: pageData.content.substring(0, 10000),
            isDocumentation: isDocumentationPage(linkObj.url)
          });
          
          additionalPagesSuccessful++;
          await logActivity('debug', `Successfully extracted content from additional page: ${linkObj.url}`, {
            titleLength: pageData.title.length,
            contentLength: pageData.content.length
          });
        }
      } catch (error) {
        await logActivity('error', `Error visiting additional page ${linkObj.url}:`, {
          errorMessage: error.message
        });
      }
    }
    
    await logActivity('info', `Deep website crawl completed.`, { 
      totalPagesExtracted: pages.length,
      uniqueUrlsVisited: allVisitedUrls.size,
      totalLinksDiscovered: totalLinksFound,
      mainPhasePagesVisited: mainPagesVisited,
      mainPhasePagesSuccessful: mainPagesSuccessful,
      docPhasePagesVisited: docPagesVisited,
      docPhasePagesSuccessful: docPagesSuccessful,
      additionalPhasePagesVisited: additionalPagesVisited,
      additionalPhasePagesSuccessful: additionalPagesSuccessful
    });
    
    return pages;
  } finally {
    await browser.close();
  }
}

// HELPER FUNCTIONS FOR ENHANCED CRAWLING

/**
 * Check if a URL is likely a documentation page
 * @param {string} url - URL to check
 * @returns {boolean} - True if likely a documentation page
 */
function isDocumentationPage(url) {
  const lowerUrl = url.toLowerCase();
  
  // Add more documentation keywords
  return lowerUrl.includes('/docs') || 
         lowerUrl.includes('/documentation') || 
         lowerUrl.includes('/guide') || 
         lowerUrl.includes('/guides') ||
         lowerUrl.includes('/developer') ||
         lowerUrl.includes('/api') ||
         lowerUrl.includes('/reference') ||
         lowerUrl.includes('/getting-started') ||
         lowerUrl.includes('/tutorials') ||
         lowerUrl.includes('/help') ||
         lowerUrl.includes('/manual') ||
         lowerUrl.includes('/learn') ||
         lowerUrl.includes('/knowledge') ||
         // Check for documentation-style paths
         /\/docs\/[\w-]+\/[\w-]+/.test(lowerUrl);
}

/**
 * Extract detailed page information using page evaluation
 * @param {Object} page - Playwright page object
 * @returns {Promise<Object>} - Page details
 */
async function extractPageDetails(page) {
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
    
    // Get all link texts in the page
    const pageLinks = Array.from(document.querySelectorAll('a'))
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
        
        // For privacy/terms pages, inspect parent elements for context
        if (!text && (a.href.includes('privacy') || a.href.includes('terms'))) {
          const parentText = a.closest('li, div, p')?.textContent.trim();
          if (parentText && parentText.length < 100) {
            text = parentText;
          }
        }
        
        return {
          text: text,
          url: a.href
        };
      })
      .filter(link => 
        link.text && 
        link.text.length > 1 && 
        link.url && 
        link.url.startsWith(window.location.origin)
      )
      .slice(0, 30); // Increased from 20 to 30 links per page
    
    // Extract main content with more detail
    let content = '';
    const contentSelectors = [
      'main', 'article', '#content', '.content', '[role="main"]',
      '.main-content', '#main-content', '.article', '.post', '.page-content',
      '.docs-content', '.documentation', '.markdown-body', '.docs-body'
    ];
    
    // Try each potential content container
    let mainElement = null;
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element && element.innerText.length > 150) {
        mainElement = element;
        break;
      }
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
 * @returns {Array} - Prioritized array of link objects
 */
function prioritizeLinks(links, websiteUrl) {
  // Filter out external links, anchors, etc.
  const filteredLinks = links.filter(link => {
    const url = new URL(link.url);
    const baseUrl = new URL(websiteUrl);
    
    // Keep only links from the same domain
    return url.hostname === baseUrl.hostname &&
           // Filter out common non-content pages
           !url.pathname.includes('/wp-admin/') &&
           !url.pathname.includes('/wp-login.php') &&
           !url.pathname.endsWith('.jpg') &&
           !url.pathname.endsWith('.png') &&
           !url.pathname.endsWith('.gif') &&
           !url.pathname.endsWith('.pdf') &&
           // Filter out anchor links
           !link.url.includes('#') &&
           // Filter out duplicate links
           links.findIndex(l => l.url === link.url) === links.indexOf(link);
  });
  
  // Score and sort links by importance
  const scoredLinks = filteredLinks.map(link => {
    let score = 0;
    const lowerText = link.text.toLowerCase();
    const lowerUrl = link.url.toLowerCase();
    
    // Prioritize important pages
    if (lowerUrl.includes('/about') || lowerText.includes('about')) score += 10;
    if (lowerUrl.includes('/product') || lowerText.includes('product')) score += 8;
    if (lowerUrl.includes('/service') || lowerText.includes('service')) score += 8;
    if (lowerUrl.includes('/feature') || lowerText.includes('feature')) score += 7;
    
    // Give higher scores to documentation pages
    if (lowerUrl.includes('/api') || lowerText.includes('api')) score += 12;
    if (lowerUrl.includes('/docs') || lowerText.includes('documentation')) score += 12;
    
    // Other standard pages
    if (lowerUrl.includes('/pricing') || lowerText.includes('pricing')) score += 6;
    if (lowerUrl.includes('/contact') || lowerText.includes('contact')) score += 5;
    if (lowerUrl.includes('/blog') || lowerText.includes('blog')) score += 4;
    
    // Only penalize depth for non-documentation pages
    const pathSegments = new URL(link.url).pathname.split('/').filter(Boolean);
    const isDocPage = isDocumentationPage(link.url);
    
    // Don't penalize documentation pages for depth
    if (!isDocPage) {
      score -= pathSegments.length;
    }
    
    return { ...link, score };
  });
  
  // Sort by score (highest first)
  return scoredLinks.sort((a, b) => b.score - a.score);
}

/**
 * Generate content for LLMS.txt using Google Generative AI
 * @param {Array} pages - Array of page data with titles and content
 * @param {String} companyName - Name of the company
 * @param {String} companyDescription - Description of the company 
 * @returns {Promise<String>} - Generated LLMS.txt content
 */
async function generateLLMSContent(pages, companyName, companyDescription) {
  try {
    await logActivity('info', 'Starting LLMS.txt generation with example-based approach');
    
    // Get the appropriate model using the helper function
    const model = getGeminiModel('standard');
    
    // Prepare data for the model
    const data = {
      companyName,
      companyDescription,
      pages: pages.slice(0, 30).map(page => ({
        title: page.title,
        description: page.metaDescription || '',
        headings: page.headings || [],
        url: page.url,
        content: page.content ? page.content.substring(0, 1000) : ''
      }))
    };

    // =================================================================
    // ADD YOUR HIGH-QUALITY LLMS.TXT EXAMPLE HERE (REPLACE THIS COMMENT)
    // This should be a complete, well-formatted LLMS.txt file that will
    // serve as an exemplar for the model to learn from
    // =================================================================
    const exampleLlmsTxt = `# Anthropic

## Docs

- [Get API Key](https://docs.anthropic.com/en/api/admin-api/apikeys/get-api-key)
- [List API Keys](https://docs.anthropic.com/en/api/admin-api/apikeys/list-api-keys)
- [Update API Keys](https://docs.anthropic.com/en/api/admin-api/apikeys/update-api-key)
- [Create Invite](https://docs.anthropic.com/en/api/admin-api/invites/create-invite)
- [Delete Invite](https://docs.anthropic.com/en/api/admin-api/invites/delete-invite)
- [Get Invite](https://docs.anthropic.com/en/api/admin-api/invites/get-invite)
- [List Invites](https://docs.anthropic.com/en/api/admin-api/invites/list-invites)
- [Get User](https://docs.anthropic.com/en/api/admin-api/users/get-user)
- [List Users](https://docs.anthropic.com/en/api/admin-api/users/list-users)
- [Remove User](https://docs.anthropic.com/en/api/admin-api/users/remove-user)
- [Update User](https://docs.anthropic.com/en/api/admin-api/users/update-user)
- [Add Workspace Member](https://docs.anthropic.com/en/api/admin-api/workspace_members/create-workspace-member)
- [Delete Workspace Member](https://docs.anthropic.com/en/api/admin-api/workspace_members/delete-workspace-member)
- [Get Workspace Member](https://docs.anthropic.com/en/api/admin-api/workspace_members/get-workspace-member)
- [List Workspace Members](https://docs.anthropic.com/en/api/admin-api/workspace_members/list-workspace-members)
- [Update Workspace Member](https://docs.anthropic.com/en/api/admin-api/workspace_members/update-workspace-member)
- [Archive Workspace](https://docs.anthropic.com/en/api/admin-api/workspaces/archive-workspace)
- [Create Workspace](https://docs.anthropic.com/en/api/admin-api/workspaces/create-workspace)
- [Get Workspace](https://docs.anthropic.com/en/api/admin-api/workspaces/get-workspace)
- [List Workspaces](https://docs.anthropic.com/en/api/admin-api/workspaces/list-workspaces)
- [Update Workspace](https://docs.anthropic.com/en/api/admin-api/workspaces/update-workspace)
- [Cancel a Message Batch](https://docs.anthropic.com/en/api/canceling-message-batches): Batches may be canceled any time before processing ends. Once cancellation is initiated, the batch enters a `canceling` state, at which time the system may complete any in-progress, non-interruptible requests before finalizing cancellation.

The number of canceled requests is specified in `request_counts`. To determine which requests were canceled, check the individual results within the batch. Note that cancellation may not result in any canceled requests if they were non-interruptible.

Learn more about the Message Batches API in our [user guide](/en/docs/build-with-claude/batch-processing)
- [Amazon Bedrock API](https://docs.anthropic.com/en/api/claude-on-amazon-bedrock): Anthropic's Claude models are now generally available through Amazon Bedrock.
- [Vertex AI API](https://docs.anthropic.com/en/api/claude-on-vertex-ai): Anthropic's Claude models are now generally available through [Vertex AI](https://cloud.google.com/vertex-ai).
- [Client SDKs](https://docs.anthropic.com/en/api/client-sdks): We provide libraries in Python and TypeScript that make it easier to work with the Anthropic API.
- [Create a Text Completion](https://docs.anthropic.com/en/api/complete): [Legacy] Create a Text Completion.

The Text Completions API is a legacy API. We recommend using the [Messages API](https://docs.anthropic.com/en/api/messages) going forward.

Future models and features will not be compatible with Text Completions. See our [migration guide](https://docs.anthropic.com/en/api/migrating-from-text-completions-to-messages) for guidance in migrating from Text Completions to Messages.
- [Create a Message Batch](https://docs.anthropic.com/en/api/creating-message-batches): Send a batch of Message creation requests.

The Message Batches API can be used to process multiple Messages API requests at once. Once a Message Batch is created, it begins processing immediately. Batches can take up to 24 hours to complete.

Learn more about the Message Batches API in our [user guide](/en/docs/build-with-claude/batch-processing)
- [Delete a Message Batch](https://docs.anthropic.com/en/api/deleting-message-batches): Delete a Message Batch.

Message Batches can only be deleted once they've finished processing. If you'd like to delete an in-progress batch, you must first cancel it.

Learn more about the Message Batches API in our [user guide](/en/docs/build-with-claude/batch-processing)
- [Errors](https://docs.anthropic.com/en/api/errors)
- [Getting help](https://docs.anthropic.com/en/api/getting-help): We've tried to provide the answers to the most common questions in these docs. However, if you need further technical support using Claude, the Anthropic API, or any of our products, you may reach our support team at [support.anthropic.com](https://support.anthropic.com).
- [Getting started](https://docs.anthropic.com/en/api/getting-started)
- [IP addresses](https://docs.anthropic.com/en/api/ip-addresses): Anthropic services live at a fixed range of IP addresses. You can add these to your firewall to open the minimum amount of surface area for egress traffic when accessing the Anthropic API and Console. These ranges will not change without notice.
- [List Message Batches](https://docs.anthropic.com/en/api/listing-message-batches): List all Message Batches within a Workspace. Most recently created batches are returned first.

Learn more about the Message Batches API in our [user guide](/en/docs/build-with-claude/batch-processing)
- [Messages](https://docs.anthropic.com/en/api/messages): Send a structured list of input messages with text and/or image content, and the model will generate the next message in the conversation.

The Messages API can be used for either single queries or stateless multi-turn conversations.

Learn more about the Messages API in our [user guide](/en/docs/initial-setup)
- [Message Batches examples](https://docs.anthropic.com/en/api/messages-batch-examples): Example usage for the Message Batches API
- [Count Message tokens](https://docs.anthropic.com/en/api/messages-count-tokens): Count the number of tokens in a Message.

The Token Count API can be used to count the number of tokens in a Message, including tools, images, and documents, without creating it.

Learn more about token counting in our [user guide](/en/docs/build-with-claude/token-counting)
- [Messages examples](https://docs.anthropic.com/en/api/messages-examples): Request and response examples for the Messages API
- [Streaming Messages](https://docs.anthropic.com/en/api/messages-streaming)
- [Migrating from Text Completions](https://docs.anthropic.com/en/api/migrating-from-text-completions-to-messages): Migrating from Text Completions to Messages
- [Get a Model](https://docs.anthropic.com/en/api/models): Get a specific model.

The Models API response can be used to determine information about a specific model or resolve a model alias to a model ID.
- [List Models](https://docs.anthropic.com/en/api/models-list): List available models.

The Models API response can be used to determine which models are available for use in the API. More recently released models are listed first.
- [OpenAI SDK compatibility (beta)](https://docs.anthropic.com/en/api/openai-sdk): With a few code changes, you can use the OpenAI SDK to test the Anthropic API. Anthropic provides a compatibility layer that lets you quickly evaluate Anthropic model capabilities with minimal effort.
- [Prompt validation](https://docs.anthropic.com/en/api/prompt-validation): With Text Completions
- [Rate limits](https://docs.anthropic.com/en/api/rate-limits): To mitigate misuse and manage capacity on our API, we have implemented limits on how much an organization can use the Claude API.
- [Retrieve Message Batch Results](https://docs.anthropic.com/en/api/retrieving-message-batch-results): Streams the results of a Message Batch as a `.jsonl` file.

Each line in the file is a JSON object containing the result of a single request in the Message Batch. Results are not guaranteed to be in the same order as requests. Use the `custom_id` field to match results to requests.

Learn more about the Message Batches API in our [user guide](/en/docs/build-with-claude/batch-processing)
- [Retrieve a Message Batch](https://docs.anthropic.com/en/api/retrieving-message-batches): This endpoint is idempotent and can be used to poll for Message Batch completion. To access the results of a Message Batch, make a request to the `results_url` field in the response.

Learn more about the Message Batches API in our [user guide](/en/docs/build-with-claude/batch-processing)
- [Streaming Text Completions](https://docs.anthropic.com/en/api/streaming)
- [Supported regions](https://docs.anthropic.com/en/api/supported-regions): Here are the countries, regions, and territories we can currently support access from:
- [Versions](https://docs.anthropic.com/en/api/versioning): When making API requests, you must send an `anthropic-version` request header. For example, `anthropic-version: 2023-06-01`. If you are using our [client libraries](/en/api/client-libraries), this is handled for you automatically.
- [All models overview](https://docs.anthropic.com/en/docs/about-claude/models/all-models): Claude is a family of state-of-the-art large language models developed by Anthropic. This guide introduces our models and compares their performance with legacy models. 
- [Extended thinking models](https://docs.anthropic.com/en/docs/about-claude/models/extended-thinking-models)
- [Security and compliance](https://docs.anthropic.com/en/docs/about-claude/security-compliance)
- [Content moderation](https://docs.anthropic.com/en/docs/about-claude/use-case-guides/content-moderation): Content moderation is a critical aspect of maintaining a safe, respectful, and productive environment in digital applications. In this guide, we'll discuss how Claude can be used to moderate content within your digital application.
- [Customer support agent](https://docs.anthropic.com/en/docs/about-claude/use-case-guides/customer-support-chat): This guide walks through how to leverage Claude's advanced conversational capabilities to handle customer inquiries in real time, providing 24/7 support, reducing wait times, and managing high support volumes with accurate responses and positive interactions.
- [Legal summarization](https://docs.anthropic.com/en/docs/about-claude/use-case-guides/legal-summarization): This guide walks through how to leverage Claude's advanced natural language processing capabilities to efficiently summarize legal documents, extracting key information and expediting legal research. With Claude, you can streamline the review of contracts, litigation prep, and regulatory work, saving time and ensuring accuracy in your legal processes.
- [Guides to common use cases](https://docs.anthropic.com/en/docs/about-claude/use-case-guides/overview)
- [Ticket routing](https://docs.anthropic.com/en/docs/about-claude/use-case-guides/ticket-routing): This guide walks through how to harness Claude's advanced natural language understanding capabilities to classify customer support tickets at scale based on customer intent, urgency, prioritization, customer profile, and more.
- [Admin API](https://docs.anthropic.com/en/docs/administration/administration-api)
- [Claude Code overview](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview): Learn about Claude Code, an agentic coding tool made by Anthropic. Currently in beta as a research preview.
- [Claude Code troubleshooting](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/troubleshooting): Solutions for common issues with Claude Code installation and usage.
- [Claude Code tutorials](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/tutorials): Practical examples and patterns for effectively using Claude Code in your development workflow.
- [Google Sheets add-on](https://docs.anthropic.com/en/docs/agents-and-tools/claude-for-sheets): The [Claude for Sheets extension](https://workspace.google.com/marketplace/app/claude%5Ffor%5Fsheets/909417792257) integrates Claude into Google Sheets, allowing you to execute interactions with Claude directly in cells.
- [Computer use (beta)](https://docs.anthropic.com/en/docs/agents-and-tools/computer-use)
- [Model Context Protocol (MCP)](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)
- [Batch processing](https://docs.anthropic.com/en/docs/build-with-claude/batch-processing)
- [Citations](https://docs.anthropic.com/en/docs/build-with-claude/citations)
- [Context windows](https://docs.anthropic.com/en/docs/build-with-claude/context-windows)
- [Define your success criteria](https://docs.anthropic.com/en/docs/build-with-claude/define-success)
- [Create strong empirical evaluations](https://docs.anthropic.com/en/docs/build-with-claude/develop-tests)
- [Embeddings](https://docs.anthropic.com/en/docs/build-with-claude/embeddings): Text embeddings are numerical representations of text that enable measuring semantic similarity. This guide introduces embeddings, their applications, and how to use embedding models for tasks like search, recommendations, and anomaly detection.
- [Building with extended thinking](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)
- [Multilingual support](https://docs.anthropic.com/en/docs/build-with-claude/multilingual-support): Claude excels at tasks across multiple languages, maintaining strong cross-lingual performance relative to English.
- [PDF support](https://docs.anthropic.com/en/docs/build-with-claude/pdf-support): Process PDFs with Claude. Extract text, analyze charts, and understand visual content from your documents.
- [Prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Be clear, direct, and detailed](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/be-clear-and-direct)
- [Let Claude think (chain of thought prompting) to increase performance](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought)
- [Chain complex prompts for stronger performance](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-prompts)
- [Extended thinking tips](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips)
- [Long context prompting tips](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips)
- [Use examples (multishot prompting) to guide Claude's behavior](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting)
- [Prompt engineering overview](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview)
- [Prefill Claude's response for greater output control](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prefill-claudes-response)
- [Automatically generate first draft prompt templates](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-generator)
- [Use our prompt improver to optimize your prompts](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-improver)
- [Use prompt templates and variables](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-templates-and-variables)
- [Giving Claude a role with a system prompt](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts)
- [Use XML tags to structure your prompts](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags)
- [Token counting](https://docs.anthropic.com/en/docs/build-with-claude/token-counting)
- [Tool use with Claude](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview)
- [Text editor tool](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/text-editor-tool)
- [Token-efficient tool use (beta)](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/token-efficient-tool-use)
- [Vision](https://docs.anthropic.com/en/docs/build-with-claude/vision): The Claude 3 family of models comes with new vision capabilities that allow Claude to understand and analyze images, opening up exciting possibilities for multimodal interaction.
- [Initial setup](https://docs.anthropic.com/en/docs/initial-setup): Let's learn how to use the Anthropic API to build with Claude.
- [Intro to Claude](https://docs.anthropic.com/en/docs/intro-to-claude): Claude is a family of [highly performant and intelligent AI models](/en/docs/about-claude/models) built by Anthropic. While Claude is powerful and extensible, it's also the most trustworthy and reliable AI available. It follows critical protocols, makes fewer mistakes, and is resistant to jailbreaks—allowing [enterprise customers](https://www.anthropic.com/customers) to build the safest AI-powered applications at scale.
- [Anthropic Privacy Policy](https://docs.anthropic.com/en/docs/legal-center/privacy)
- [API feature overview](https://docs.anthropic.com/en/docs/resources/api-features): Learn about Anthropic's API features.
- [Claude 3.7 system card](https://docs.anthropic.com/en/docs/resources/claude-3-7-system-card)
- [Claude 3 model card](https://docs.anthropic.com/en/docs/resources/claude-3-model-card)
- [Anthropic Cookbook](https://docs.anthropic.com/en/docs/resources/cookbook)
- [Anthropic Courses](https://docs.anthropic.com/en/docs/resources/courses)
- [Glossary](https://docs.anthropic.com/en/docs/resources/glossary): These concepts are not unique to Anthropic's language models, but we present a brief summary of key terms below.
- [Model deprecations](https://docs.anthropic.com/en/docs/resources/model-deprecations)
- [System status](https://docs.anthropic.com/en/docs/resources/status)
- [Using the Evaluation Tool](https://docs.anthropic.com/en/docs/test-and-evaluate/eval-tool): The [Anthropic Console](https://console.anthropic.com/dashboard) features an **Evaluation tool** that allows you to test your prompts under various scenarios.
- [Increase output consistency (JSON mode)](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/increase-consistency)
- [Keep Claude in character with role prompting and prefilling](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/keep-claude-in-character)
- [Mitigate jailbreaks and prompt injections](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)
- [Reduce hallucinations](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations)
- [Reducing latency](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-latency)
- [Reduce prompt leak](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-prompt-leak)
- [Welcome to Claude](https://docs.anthropic.com/en/docs/welcome): Claude is a highly performant, trustworthy, and intelligent AI platform built by Anthropic. Claude excels at tasks involving language, reasoning, analysis, coding, and more.
- [null](https://docs.anthropic.com/en/home)
- [Adaptive editor](https://docs.anthropic.com/en/prompt-library/adaptive-editor): Rewrite text following user-given instructions, such as with a different tone, audience, or style.
- [Airport code analyst](https://docs.anthropic.com/en/prompt-library/airport-code-analyst): Find and extract airport codes from text.
- [Alien anthropologist](https://docs.anthropic.com/en/prompt-library/alien-anthropologist): Analyze human culture and customs from the perspective of an alien anthropologist.
- [Alliteration alchemist](https://docs.anthropic.com/en/prompt-library/alliteration-alchemist): Generate alliterative phrases and sentences for any given subject.
- [Babel's broadcasts](https://docs.anthropic.com/en/prompt-library/babels-broadcasts): Create compelling product announcement tweets in the world's 10 most spoken languages.
- [Brand builder](https://docs.anthropic.com/en/prompt-library/brand-builder): Craft a design brief for a holistic brand identity.
- [Career coach](https://docs.anthropic.com/en/prompt-library/career-coach): Engage in role-play conversations with an AI career coach.
- [Cite your sources](https://docs.anthropic.com/en/prompt-library/cite-your-sources): Get answers to questions about a document's content with relevant citations supporting the response.
- [Code clarifier](https://docs.anthropic.com/en/prompt-library/code-clarifier): Simplify and explain complex code in plain language.
- [Code consultant](https://docs.anthropic.com/en/prompt-library/code-consultant): Suggest improvements to optimize Python code performance.
- [Corporate clairvoyant](https://docs.anthropic.com/en/prompt-library/corporate-clairvoyant): Extract insights, identify risks, and distill key information from long corporate reports into a single memo.
- [Cosmic Keystrokes](https://docs.anthropic.com/en/prompt-library/cosmic-keystrokes): Generate an interactive speed typing game in a single HTML file, featuring side-scrolling gameplay and Tailwind CSS styling.
- [CSV converter](https://docs.anthropic.com/en/prompt-library/csv-converter): Convert data from various formats (JSON, XML, etc.) into properly formatted CSV files.
- [Culinary creator](https://docs.anthropic.com/en/prompt-library/culinary-creator): Suggest recipe ideas based on the user's available ingredients and dietary preferences.
- [Data organizer](https://docs.anthropic.com/en/prompt-library/data-organizer): Turn unstructured text into bespoke JSON tables.
- [Direction decoder](https://docs.anthropic.com/en/prompt-library/direction-decoder): Transform natural language into step-by-step directions.
- [Dream interpreter](https://docs.anthropic.com/en/prompt-library/dream-interpreter): Offer interpretations and insights into the symbolism of the user's dreams.
- [Efficiency estimator](https://docs.anthropic.com/en/prompt-library/efficiency-estimator): Calculate the time complexity of functions and algorithms.
- [Email extractor](https://docs.anthropic.com/en/prompt-library/email-extractor): Extract email addresses from a document into a JSON-formatted list.
- [Emoji encoder](https://docs.anthropic.com/en/prompt-library/emoji-encoder): Convert plain text into fun and expressive emoji messages.
- [Ethical dilemma navigator](https://docs.anthropic.com/en/prompt-library/ethical-dilemma-navigator): Help the user think through complex ethical dilemmas and provide different perspectives.
- [Excel formula expert](https://docs.anthropic.com/en/prompt-library/excel-formula-expert): Create Excel formulas based on user-described calculations or data manipulations.
- [Function fabricator](https://docs.anthropic.com/en/prompt-library/function-fabricator): Create Python functions based on detailed specifications.
- [Futuristic fashion advisor](https://docs.anthropic.com/en/prompt-library/futuristic-fashion-advisor): Suggest avant-garde fashion trends and styles for the user's specific preferences.
- [Git gud](https://docs.anthropic.com/en/prompt-library/git-gud): Generate appropriate Git commands based on user-described version control actions.
- [Google apps scripter](https://docs.anthropic.com/en/prompt-library/google-apps-scripter): Generate Google Apps scripts to complete tasks based on user requirements.
- [Grading guru](https://docs.anthropic.com/en/prompt-library/grading-guru): Compare and evaluate the quality of written texts based on user-defined criteria and standards.
- [Grammar genie](https://docs.anthropic.com/en/prompt-library/grammar-genie): Transform grammatically incorrect sentences into proper English.
- [Hal the humorous helper](https://docs.anthropic.com/en/prompt-library/hal-the-humorous-helper): Chat with a knowledgeable AI that has a sarcastic side.
- [Idiom illuminator](https://docs.anthropic.com/en/prompt-library/idiom-illuminator): Explain the meaning and origin of common idioms and proverbs.
- [Interview question crafter](https://docs.anthropic.com/en/prompt-library/interview-question-crafter): Generate questions for interviews.
- [LaTeX legend](https://docs.anthropic.com/en/prompt-library/latex-legend): Write LaTeX documents, generating code for mathematical equations, tables, and more.
- [Lesson planner](https://docs.anthropic.com/en/prompt-library/lesson-planner): Craft in depth lesson plans on any subject.
- [Library](https://docs.anthropic.com/en/prompt-library/library)
- [Master moderator](https://docs.anthropic.com/en/prompt-library/master-moderator): Evaluate user inputs for potential harmful or illegal content.
- [Meeting scribe](https://docs.anthropic.com/en/prompt-library/meeting-scribe): Distill meetings into concise summaries including discussion topics, key takeaways, and action items.
- [Memo maestro](https://docs.anthropic.com/en/prompt-library/memo-maestro): Compose comprehensive company memos based on key points.
- [Mindfulness mentor](https://docs.anthropic.com/en/prompt-library/mindfulness-mentor): Guide the user through mindfulness exercises and techniques for stress reduction.
- [Mood colorizer](https://docs.anthropic.com/en/prompt-library/mood-colorizer): Transform text descriptions of moods into corresponding HEX codes.
- [Motivational muse](https://docs.anthropic.com/en/prompt-library/motivational-muse): Provide personalized motivational messages and affirmations based on user input.
- [Neologism creator](https://docs.anthropic.com/en/prompt-library/neologism-creator): Invent new words and provide their definitions based on user-provided concepts or ideas.
- [Perspectives ponderer](https://docs.anthropic.com/en/prompt-library/perspectives-ponderer): Weigh the pros and cons of a user-provided topic.
- [Philosophical musings](https://docs.anthropic.com/en/prompt-library/philosophical-musings): Engage in deep philosophical discussions and thought experiments.
- [PII purifier](https://docs.anthropic.com/en/prompt-library/pii-purifier): Automatically detect and remove personally identifiable information (PII) from text documents.
- [Polyglot superpowers](https://docs.anthropic.com/en/prompt-library/polyglot-superpowers): Translate text from any language into any language.
- [Portmanteau poet](https://docs.anthropic.com/en/prompt-library/portmanteau-poet): Blend two words together to create a new, meaningful portmanteau.
- [Product naming pro](https://docs.anthropic.com/en/prompt-library/product-naming-pro): Create catchy product names from descriptions and keywords.
- [Prose polisher](https://docs.anthropic.com/en/prompt-library/prose-polisher): Refine and improve written content with advanced copyediting techniques and suggestions.
- [Pun-dit](https://docs.anthropic.com/en/prompt-library/pun-dit): Generate clever puns and wordplay based on any given topic.
- [Python bug buster](https://docs.anthropic.com/en/prompt-library/python-bug-buster): Detect and fix bugs in Python code.
- [Review classifier](https://docs.anthropic.com/en/prompt-library/review-classifier): Categorize feedback into pre-specified tags and categorizations.
- [Riddle me this](https://docs.anthropic.com/en/prompt-library/riddle-me-this): Generate riddles and guide the user to the solutions.
- [Sci-fi scenario simulator](https://docs.anthropic.com/en/prompt-library/sci-fi-scenario-simulator): Discuss with the user various science fiction scenarios and associated challenges and considerations.
- [Second-grade simplifier](https://docs.anthropic.com/en/prompt-library/second-grade-simplifier): Make complex text easy for young learners to understand.
- [Simile savant](https://docs.anthropic.com/en/prompt-library/simile-savant): Generate similes from basic descriptions.
- [Socratic sage](https://docs.anthropic.com/en/prompt-library/socratic-sage): Engage in Socratic style conversation over a user-given topic.
- [Spreadsheet sorcerer](https://docs.anthropic.com/en/prompt-library/spreadsheet-sorcerer): Generate CSV spreadsheets with various types of data.
- [SQL sorcerer](https://docs.anthropic.com/en/prompt-library/sql-sorcerer): Transform everyday language into SQL queries.
- [Storytelling sidekick](https://docs.anthropic.com/en/prompt-library/storytelling-sidekick): Collaboratively create engaging stories with the user, offering plot twists and character development.
- [Time travel consultant](https://docs.anthropic.com/en/prompt-library/time-travel-consultant): Help the user navigate hypothetical time travel scenarios and their implications.
- [Tongue twister](https://docs.anthropic.com/en/prompt-library/tongue-twister): Create challenging tongue twisters.
- [Trivia generator](https://docs.anthropic.com/en/prompt-library/trivia-generator): Generate trivia questions on a wide range of topics and provide hints when needed.
- [Tweet tone detector](https://docs.anthropic.com/en/prompt-library/tweet-tone-detector): Detect the tone and sentiment behind tweets.
- [VR fitness innovator](https://docs.anthropic.com/en/prompt-library/vr-fitness-innovator): Brainstorm creative ideas for virtual reality fitness games.
- [Website wizard](https://docs.anthropic.com/en/prompt-library/website-wizard): Create one-page websites based on user specifications.
- [API](https://docs.anthropic.com/en/release-notes/api): Follow along with updates across Anthropic's API and Developer Console.
- [Claude Apps](https://docs.anthropic.com/en/release-notes/claude-apps): Follow along with updates across Anthropic's Claude applications.
- [Overview](https://docs.anthropic.com/en/release-notes/overview): Follow along with updates across Anthropic's products and services.
- [System Prompts](https://docs.anthropic.com/en/release-notes/system-prompts): See updates to the core system prompts on [Claude.ai](https://www.claude.ai) and the Claude [iOS](http://anthropic.com/ios) and [Android](http://anthropic.com/android) apps.


## Optional

- [Developer Console](https://console.anthropic.com/)
- [Developer Discord](https://www.anthropic.com/discord)
- [Support](https://support.anthropic.com/)`

    // Create prompt for the model that includes the example
    const prompt = `
You are tasked with creating an LLMS.txt file for ${companyName} based on the following website data. An LLMS.txt file is a concise but comprehensive description of a company's purpose, products, links, and policies in markdown format.

EXAMPLE OF WELL-FORMATTED LLMS.TXT FILE:
${exampleLlmsTxt}

WEBSITE DATA:
${JSON.stringify(data, null, 2)}

Please generate an LLMS.txt file for ${companyName} following this format:
1. Start with "# ${companyName}" as the main heading
2. Use "##" for section headers (Key Products & Services, Important Links, Policies)
3. Include a blockquote with > for the mission statement or brief description
4. Format lists with bullet points (-)
5. Include all important URLs as absolute links in markdown format: [Link Name](URL)
6. Add brief descriptions after URLs where appropriate
7. Keep the content factual and professional
8. Be concise yet thorough
9. Focus only on information found in the provided website data
10. DO NOT include any HTML tags or image references
11. Use only plain text with markdown formatting

The final output should ONLY contain the LLMS.txt content, with proper markdown formatting, especially the "#" and "##" headers. DO NOT remove or alter any markdown formatting.
`;

    await logActivity('info', 'Sending prompt to model for LLMS.txt generation');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Keep the markdown formatting - don't clean it
    return text.trim();
  } catch (error) {
    console.error('Error generating LLMS content:', error);
    throw new Error(`Failed to generate LLMS content: ${error.message}`);
  }
}

/**
 * Generate content for LLMS-full.txt using Google Generative AI
 * @param {Array} pages - Array of page data with titles and content
 * @param {String} companyName - Name of the company 
 * @param {String} companyDescription - Description of the company
 * @returns {Promise<String>} - Generated LLMS-full.txt content
 */
async function generateLLMSFullContent(pages, companyName, companyDescription) {
  try {
    await logActivity('info', 'Starting LLMS-full.txt generation with example-based approach');
    
    // Sort and filter pages for different sections
    const pagesByCategory = categorizePages(pages);
    
    // Get models for different sections
    const standardModel = getGeminiModel('standard');
    const advancedModel = getGeminiModel('advanced');
    
    // =====================================================================
    // ADD YOUR HIGH-QUALITY LLMS-FULL.TXT EXAMPLE HERE (REPLACE THIS COMMENT)
    // This should be a complete, well-formatted LLMS-full.txt file that will
    // serve as an exemplar for the model to learn from. This example will be
    // used in generating all sections of the LLMS-full.txt file.
    // =====================================================================
    const exampleLlmsFullTxt = `# Billing
Source: https://docs.cursor.com/account/billing

Guide to Cursor billing: manage subscriptions, seats, cycles, and payments through Stripe portal

We use Stripe as our billing and payments provider

### How do I access billing settings?

The billing portal is where you'll manage all aspects of your subscription. You can access it through the [dashboard](https://cursor.com/settings) by clicking the "Billing" button in your account settings. This takes you to a secure portal where you can handle all billing-related tasks.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/billing/billing-account.png" />
</Frame>

### What are Cursor's billing cycles?

Billing cycles run on either a monthly or annual basis, starting on the day you subscribe. For Business accounts with multiple seats, we use prorated billing when your team size changes. This means you only pay for the actual time each seat is used within a billing cycle.

### How do team seats work for Business accounts?

Business accounts use a per-seat billing model where each team member requires one seat license. When adding new members mid-cycle, you're only charged for their remaining time in that billing period. Team admins can manage seats directly through the dashboard.

### Can I switch between monthly and annual billing?

Yes you can! Here's how:

**Pro plan**

1. Go to [settings](https://cursor.com/settings)
2. Click on "Manage subscription" and you will be taken to the billing portal
3. Click on "Update subscription"
4. From here you can switch between monthly and annual billing
5. Select "Yearly" or "Monthly", then click on "Continue"

**Business plan**

1. Go to [settings](https://cursor.com/settings)
2. In the account section, click on "Advanced" then "Upgrade to yearly billing"

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/plans/business/upgrade-to-yearly.png" />
</Frame>

<Note>
  Please note that you can only switch from monthly to yearly billing
  self-serve. To switch from yearly to monthly billing, please contact us at
  [hi@cursor.com](mailto:hi@cursor.com).
</Note>

### Where can I find my invoices?

All your billing history is available in the billing portal, where you can view and download both current and past invoices.

### Can I get invoices automatically emailed to me?

Currently, invoices need to be downloaded manually from the billing portal. We know this is a hassle, so we're developing automatic invoice emails as a new feature, and once available, you'll be able to opt-in!

### How do I update my billing information?

You can update your payment method, company name, address, and tax information through the billing portal. We use Stripe as our payment processor to ensure secure transactions. Please note that changes to billing information will only affect future invoices - we cannot modify historical invoices.

### How do I cancel my subscription?

You can cancel your subscription directly through the billing portal using the "Cancel subscription" button. Your access will continue until the end of your current billing period.

### I'm having other billing issues. How can I get help?

For any billing-related questions not covered here, please email us at [hi@cursor.com](mailto:hi@cursor.com). Include your account details and specific concerns, and our team will help you resolve them quickly!

### Can I get a refund?

You can self-serve a refund by going to the billing portal and clicking on the `Cancel subscription` button. Our self-serve refund policy is as follows:

**EU, UK or Turkey customers**

* Eligible for a refund if you cancel your subscription within 14 days of purchase.

**All other customers (US + rest of world)**

* Monthly subscriptions: Refundable within 24 hours after purchase.
* Annual subscriptions: Refundable within 72 hours after purchase

If you're not in the window of self-serve refunds, reach out to us at [hi@cursor.com](mailto:hi@cursor.com) and we'll help you!


# Dashboard
Source: https://docs.cursor.com/account/dashboard

Learn how to manage billing, usage pricing, and team settings in the dashboard for different plans

<Note>You can view the Cursor dashboard by going to [cursor.com/settings](https://cursor.com/settings)</Note>

From the dashboard you can access billing portal, setup usage based pricing and manage your team. Depending on if you're on Free, Pro or Business, you'll see different sections.

## Pro

From here you can access billing portal, setup usage based pricing and see how many requests you have left.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/pro.png" style={{ padding: 32, backgroundColor: "#0c0c0c" }} />
</Frame>

## Business

Business will have a section for teams.

### Team

Read more about how to manage teams in [members](/account/teams/members)

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/team.png" style={{ padding: 32, backgroundColor: "#0c0c0c" }} />
</Frame>

### Metrics

Read more in [team analytics](/account/teams/analytics). This is only available for teams

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/metrics.png" style={{ padding: 32, backgroundColor: "#0c0c0c" }} />
</Frame>

### Usage based pricing

This is where you can toggle usage based pricing and set spending limits. Read more about [usage based pricing](/account/usage) and how to configure it

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/usage-based-pricing.png" style={{ padding: 32, backgroundColor: "#0c0c0c" }} />
</Frame>


# Plans & Usage
Source: https://docs.cursor.com/account/plans-and-usage

Learn about Cursor's pricing plans, usage limits, request pools, and billing information

<Note>To view your current usage, you can visit the dashboard at [cursor.com/settings](https://cursor.com/settings)</Note>

## Available Plans

<CardGroup cols={3}>
  <Card title="Hobby">
    <ul style={{ listStyle: "disc", paddingLeft: 12 }}>
      <li>50 slow `premium` model uses per month</li>
      <li>2000 [completions](/tab/overview)</li>
    </ul>
  </Card>

  <Card title="Pro">
    <ul style={{ listStyle: "disc", paddingLeft: 12 }}>
      <li>500 fast `premium` requests per month</li>
      <li>Unlimited slow `premium` requests per month</li>
      <li>Unlimited [completions](/tab/overview)</li>
      <li>10 o1-mini per day</li>
    </ul>
  </Card>

  <Card title="Business">
    <ul style={{ listStyle: "disc", paddingLeft: 12 }}>
      <li>Same usage as Pro</li>
      <li>Enforces privacy mode</li>
      <li>Centralized team billing</li>
      <li>Admin dashboard with usage stats</li>
      <li>SAML/OIDC SSO</li>
    </ul>
  </Card>
</CardGroup>

<CardGroup cols={1}>
  <Card title="Free Trial">
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <div>
        <ul style={{ listStyle: "disc", paddingLeft: 12 }}>
          <li>14 days Pro Trial</li>
        </ul>
      </div>

      <div>
        <ul style={{ listStyle: "disc", paddingLeft: 12 }}>
          <li>150 `premium` model uses</li>
        </ul>
      </div>

      <div>
        <ul style={{ listStyle: "disc", paddingLeft: 12 }}>
          <li>Unlimited [completions](/tab/overview)</li>
        </ul>
      </div>
    </div>
  </Card>
</CardGroup>

<Tip>
  For costs and more pricing info, please visit the [Cursor Pricing](https://cursor.com/pricing) page.
</Tip>

## Understanding Usage

### Fast and Slow Requests

There are two types of requests in Cursor, **slow** and **fast** that has its own pool.

By default, Cursor servers try to give all users fast `premium` model requests. However, when users run out of fast `premium` credits, they are moved to a slow pool. Wait times in the slow pool are calculated proportionally to how many slow requests you've used, so they generally remain manageable unless you're well over your fast request limit.

To bypass wait times entirely, you can enable usage-based pricing (you'll only be charged for requests beyond your included fast requests).

See [models](/settings/models) for an overview of which models are `premium` and their alternatives.

### Included Requests

Every subscription includes a set amount of fast requests. The number of included requests depends on your plan as shown in the plan comparison above.

### Additional Requests

We offer usage-based pricing for additional requests beyond your plan's included quota:

#### Usage-based Pricing

You may opt in to usage-based pricing for requests that go beyond what is included in your Pro or Business plan from your [dashboard](/account/dashboard).

<Info>Usage-based pricing is only available with a paid subscription.</Info>

From the dashboard, you can toggle usage based pricing for `premium` models and `other` models (see [models](/settings/models) to understand which model is which). You can also configure a spend limit in USD to make sure you never go over that. Once the spending limit is hit, slow requests will be used.

We will bill for additional fast requests when you've made requests totaling \$20, **or** on the 2nd or 3rd day of the month, whichever comes first.

<AccordionGroup>
  <Accordion title="Single invoice">
    375 fast requests made with a `premium` model (\$15) will be billed at the beginning of the next month since the total value is under \$20
  </Accordion>

  <Accordion title="Multiple invoices">
    <p>
      1150 fast requests made with a `premium` (\$46) will be billed 3 times:
    </p>

    <p>1. When first batch of 500 requests has been made (\$20)</p>
    <p>2. When second batch of 500 requests has been made (also \$20)</p>
    <p>3. Beginning of next month (remaining \$6)</p>
  </Accordion>
</AccordionGroup>

For team accounts, administrators can restrict usage-based pricing settings to admin-only access.

Cost per request for each model can be found on the [models](/settings/models) page.

#### Fast Requests Packages

<Warning>Fast requests packages have been deprecated in favor of usage-based pricing. Existing users with additional packages can continue to use them and have the option to remove them, but new packages cannot be purchased.</Warning>

Fast Request Packages were bundles of 500 requests that could be purchased in addition to your plan's included quota. These have been replaced by usage-based pricing for fast requests, as purchasing them in bundles often meant users would pay for requests they didn't use.

### FAQ

#### When do my fast requests reset?

Your Fast Requests reset on a fixed monthly date based on when you first set up your plan. If you purchase additional requests (for example, upgrading from 500 to 1000 requests), the reset date remains unchanged. For instance, if your plan started on the 23rd, your requests will always reset on the 23rd of each month, regardless of when you purchase additional requests.

#### What does "500 premium requests" mean for teams?

Each user gets their own quota of 500 fast requests for premium models per month. These requests are not pooled across the team - every team member gets their own fresh 500 requests when their personal monthly cycle resets.


# Pricing
Source: https://docs.cursor.com/account/pricing





# Privacy + Security
Source: https://docs.cursor.com/account/privacy

A guide to Cursor's privacy settings, data handling, and code indexing with Privacy Mode option

Cursor is built with privacy and security at its core. We have built Cursor from the ground up to give you the peace of mind that your code and data is private and secure.

## Quick Links

To learn more about Cursor's privacy and security practices, please see the following links:

<CardGroup cols={2}>
  <Card title="Privacy Policy" icon="user-shield" href="https://cursor.com/privacy">
    Read our comprehensive privacy policy to understand how we handle your data
  </Card>

  <Card title="Security Overview" icon="lock" href="https://cursor.com/security">
    Learn about our security practices and how we protect your code
  </Card>
</CardGroup>

<CardGroup cols={1}>
  <Card horizontal title="Trust Center" icon="shield-halved" href="https://trust.cursor.com">
    View our Trust Center to learn more about our security practices and to access our SOC2 certification. security reports and annual penetration testing reports.
  </Card>
</CardGroup>

## Privacy FAQs

### What is Privacy Mode?

With `Privacy Mode` enabled, none of your code will ever be stored by us or any third-party. Otherwise, we may collect prompts, code snippets and telemetry data to improve Cursor. You can [read more about Privacy Mode here](https://cursor.com/privacy). Privacy mode is enforced for Business plans

You can enable `Privacy Mode` at onboarding or under `Cursor Settings` > `General` > `Privacy Mode`.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/get-started/privacy-mode.png" alt="Privacy Mode" />
</Frame>

### Are requests always routed through the Cursor backend?

Yes! Even if you use your API key, your requests will still go through our backend. That's where we do our final prompt building.

### Does indexing the codebase require storing code?

It does not! If you choose to index your codebase, Cursor will upload your codebase in small chunks to our server to compute embeddings, but all plaintext code ceases to exist after the life of the request.

The embeddings and metadata about your codebase (hashes, obfuscated file names) are stored in our database, but none of your code is.

You can read more about this on our [security page](https://cursor.com/security).


# Analytics
Source: https://docs.cursor.com/account/teams/analytics

Track team metrics including usage stats, per-user activity, and active user counts from the dashboard

Team admins can track metrics for their team from the [dashboard](/account/dashboard).

<Info>
  Expect this to improve a lot during H1 2025, including API for programmatic
  access
</Info>

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/metrics.png" />
</Frame>

The metrics dashboard shows usage statistics for your team over the last 30 days:

### Total Usage

View aggregate metrics across your entire team, including total tabs and premium requests used. For teams less than 30 days old, metrics reflect actual usage since team creation, including activity from team members' individual accounts prior to joining.

### Per Active User

See average usage metrics per active user, including tabs accepted, lines of code, and premium requests.

### User Activity

Track both weekly and monthly active user counts.

## FAQ

<AccordionGroup>
  <Accordion title="Why do I see different request counts in the metrics page versus the team tab?">
    The difference in numbers you're seeing is because the team tab shows requests for the current billing period, while the metrics page shows a rolling 30-day window. We know is can be confusing - we're working on making this clearer in the dashboard.
  </Accordion>
</AccordionGroup>


# Members + Roles
Source: https://docs.cursor.com/account/teams/members

Learn about team roles, member management, SSO, usage controls, and billing for organizational teams

## Roles

Teams have access to three user roles to help manage teams. Each role has specific permissions and billing implications.

<AccordionGroup>
  <Accordion title="Member (default)">
    * Access to all [Business features](https://cursor.com/pricing)
    * Can invite team members
    * Billed for a user seat
  </Accordion>

  <Accordion title="Admin">
    Admins have comprehensive control over team management and security settings to ensure smooth team operations.

    * Full team management capabilities:
      * Invite/remove team members
      * Modify team roles
    * Usage and security controls:
      * Toggle usage-based pricing
      * Configure SSO & domain verification
      * Set organization-wide spending caps
    * Access to admin dashboard
    * Billed for a user seat
  </Accordion>

  <Accordion title="Unpaid Admin">
    Unpaid Admins manage the team without using a paid seat - ideal for IT staff who don't need Cursor access.

    * Same capabilities as Admin
    * **Not billed for a user seat**
    * Requires at least one paid Admin on the team to assign this role
  </Accordion>
</AccordionGroup>

<div className="full-width-table">
  ### Comparison

  <Accordion title="Role Capabilities">
    | Capability             | Member | Admin | Unpaid Admin |
    | ---------------------- | :----: | :---: | :----------: |
    | Use Cursor features    |    ✓   |   ✓   |              |
    | Invite members         |    ✓   |   ✓   |       ✓      |
    | Remove members         |        |   ✓   |       ✓      |
    | Change user role       |        |   ✓   |       ✓      |
    | Admin dashboard        |        |   ✓   |       ✓      |
    | Configure SSO/Security |        |   ✓   |       ✓      |
    | Manage Billing         |        |   ✓   |       ✓      |
    | Set usage controls     |    ✓   |   ✓   |       ✓      |
    | Requires paid seat     |    ✓   |   ✓   |              |
  </Accordion>
</div>

## Managing members

All members in the team can invite other members. We currently do not have any way to control invites.

### Add member

#### Email invitation

* Click the `Invite Members` button
* Enter email addresses

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/invite-members.png" style={{ padding: `32px 64px`, backgroundColor: "#0c0c0c" }} />
</Frame>

#### Invite link

* Click the `Invite Members` button
* Copy the `Invite Link`
* Share with team members

<Info>
  Invite links do not expire and anyone who gets access to the link can join a
  team. You can prevent this by setting up [SSO](/account/teams/sso)
</Info>

### Remove member

Admins can remove members at any time by clicking the context menu and then "Remove". We'll only charge for time the member was in the team

### Change role

Admins can change roles for other members by clicking the context menu and then "Change role". There has to be at least one Admin per team

## Security & SSO

SAML 2.0 Single Sign-On (SSO) is available on Business and Enterprise plans. Key features:

* Configure SSO connections ([learn more about SSO setup](/account/teams/sso))
* Set up domain verification
* Automatic user enrollment through SSO
* SSO enforcement options
* Identity provider integration (Okta, etc)

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/sso-settings.png" style={{ padding: `32px 64px`, backgroundColor: "#0c0c0c" }} />
</Frame>

## Usage Controls

Access usage settings to:

* Enable usage-based pricing
* Enable for usage-based for premium models
* Set admin-only modifications for usage-based pricing settings
* Set monthly spending limits
* Monitor team-wide usage

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/usage-based-pricing.png" style={{ backgroundColor: "#0c0c0c" }} />
</Frame>

## Billing

When adding new team members:

* Each new member or admin adds a billable seat (see [pricing](https://cursor.com/pricing))
* Seat changes are prorated for your billing period
* Unpaid admin seats are not counted

Adding new team members in the middle of a month, we'll only charge you for the days they actually use. Similarly, if someone leaves the team, we'll credit your account for any unused days.

If you change someone's role (e.g from Admin to Unpaid Admin), we'll automatically adjust the billing from the day of the change. You can choose to be billed either monthly or yearly - both options are available to suit your needs.

### Switching from monthly to yearly billing

You can save 20% of the Business plan by switching from monthly to yearly billing. This can be done from the [dashboard](/account/dashboard)

1. Go to [settings](https://cursor.com/settings)
2. In the account section, click on "Advanced" then "Upgrade to yearly billing"

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/plans/business/upgrade-to-yearly.png" />
</Frame>

<Note>
  Please note that you can only switch from monthly to yearly billing
  self-service. To switch from yearly to monthly billing, please contact us at
  [hi@cursor.com](mailto:hi@cursor.com).
</Note>


# Get Started
Source: https://docs.cursor.com/account/teams/setup

Learn how to create and manage a business team: setup, invite members, and configure SSO options

## Creating a team

<Steps>
  <Step title="Set up Business plan">
    To create a team, you need to be on the [Business plan](/account/plans).

    If you're setting up a new account, head over to [create team](https://cursor.com/team/new-team). If you're on a Pro plan, you can click the "Upgrade to Business" button in [dashboard](/account/dashboard)
  </Step>

  <Step title="Enter team details">
    After clicking "New Team", enter the details for the team. You will have to
    select name and billing cycle for the team

    <Frame>
      <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/create-team.png" />
    </Frame>
  </Step>

  <Step title="Invite members">
    After the team is created, you can start inviting members to the team. All
    changes to users are prorated, meaning that we will only charge for the time
    that a user has been a member of the team

    <Frame>
      <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/invite-members.png" style={{ paddingLeft: 16, paddingRight: 16, backgroundColor: '#0c0c0c' }} />
    </Frame>
  </Step>

  <Step title="Enable SSO (optional)">
    After the team is created, you can enable [SSO](/account/teams/sso) for the team for additional security.

    <Frame>
      <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/sso-settings.png" />
    </Frame>
  </Step>
</Steps>

## FAQ

### How can I purchase 10 licenses for my company?

Start by creating a team, then invite your team members. We charge based on the amount of users in your team. We don't have a fixed amount of seats, it's prorated as you update team members

### How can I set up a team when I'm not going to use Cursor myself?

We require at least one paid member to create a team. If you are creating the team, we require you to start as a paid member. After you've invited another member to the team, you can assign yourself the [Unpaid Admin role](/account/teams/members). Seat changes are not billed immediately, so you can set up a team, invite a member and change your own role without being charged

### How can I add Cursor to an MDM, like Kandji?

You can get the versions from here:

* Mac: [Apple Silicon](https://downloader.cursor.sh/mac/dmg/arm64)
* Mac: [Intel](https://downloader.cursor.sh/mac/dmg/x64)
* Windows: [x64](https://downloader.cursor.sh/windows/nsis/x64)
* Windows: [arm64](https://downloader.cursor.sh/windows/nsis/arm64)

Then follow the instructions for your MDM:

* Kandji: [Custom Apps](https://support.kandji.io/kb/custom-apps-overview)


# SSO
Source: https://docs.cursor.com/account/teams/sso

Learn how to set up SAML 2.0 Single Sign-On (SSO) for secure team authentication in Cursor

## Overview

SAML 2.0 Single Sign-On (SSO) is available at no additional cost on the Cursor Business plan. This enables you to use your existing identity provider (IdP) to authenticate your team members, avoiding the need for your team members to have a Cursor account, and remember another password.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/sso-settings.png" style={{ padding: 32, backgroundColor: "#0c0c0c" }} />
</Frame>

## Prerequisites

* A Cursor Business plan
* Admin access to your identity provider (e.g., Okta)
* Admin access to your Cursor organization

## Configuration Steps

<Steps>
  <Step title="Sign in to your Cursor account">
    Navigate to [cursor.com/settings](http://cursor.com/settings) and sign in with an admin account.
  </Step>

  <Step title="Locate the SSO configuration">
    Find the "Configure SSO" button in the bottom left of the settings page
  </Step>

  <Step title="Begin the setup process">
    Click the button to start the SSO setup process, and follow the setup wizard to configure your identity provider.
  </Step>

  <Step title="Configure your identity provider">
    In your identity provider (e.g., Okta):

    * Create a new SAML application
    * Configure the SAML settings using the information provided in Cursor
    * Set up Just-in-Time (JIT) provisioning for seamless user access
  </Step>
</Steps>

### Identity Provider Setup Guides

For detailed setup instructions specific to your identity provider, refer to the guides below:

<Card title="Identity Provider Guides" icon="book" href="https://workos.com/docs/integrations">
  Access comprehensive setup instructions for all major identity providers including Okta, Azure AD, Google Workspace, and more.
</Card>

<Info>SCIM provisioning coming H1 2025</Info>

## Additional Settings

* SSO enforcement is managed through the admin dashboard
* New users are automatically enrolled in your organization when they sign in through SSO
* User management can be handled directly through your identity provider

## Troubleshooting

If you encounter issues during setup:

* Verify your domain has been verified in Cursor
* Ensure all required SAML attributes are properly mapped
* Check that the SSO configuration is enabled in your admin dashboard
* If a user is unable to authenticate, ensure the first and last name set in the identity provider matches their name in Cursor
* Check the guides above for detailed setup instructions specific to your identity provider
* If you continue to experience issues, please reach out to us at [hi@cursor.com](mailto:hi@cursor.com)


# Notepads (Beta)
Source: https://docs.cursor.com/beta/notepads

A guide to using Notepads in Cursor for sharing context between Composers and Chat interactions

<Warning>
  Notepads are currently in beta and subject to be deprecated in the future.
</Warning>

# Overview

Notepads are powerful context-sharing tools in Cursor that bridge the gap between composers and chat interactions. Think of them as enhanced reference documents that go beyond the capabilities of `.cursorrules`, allowing you to create reusable contexts for your development workflow.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/features/beta/notepads/empty-notepad.png" />
</Frame>

Notepads serve as collections of thoughts, rules, and documentation that can be:

* Shared between different parts of your development environment
* Referenced using the `@` syntax
* Enhanced with file attachments
* Used as dynamic templates for various development scenarios

## Getting started

1. Click the "+" button in the Notepads section
2. Give your notepad a meaningful name
3. Add your content, context, files and other relevant information the same way you would in composer or chat.
4. Reference it in composers or chat using `@`

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/features/beta/notepads/create-notepad.png" />
</Frame>

# Key features

* **Context Sharing**: Seamlessly share context between composers and chat
* **File Attachments**: Attach documentation and reference files (not possible in `.cursorrules`)
* **Dynamic References**: Use `@` mentions to link to other resources
* **Flexible Content**: Write and structure information in a way that suits your needs

# Common use cases

1. **Dynamic Boilerplate Generation**
   * Create templates for common code patterns
   * Store project-specific scaffolding rules
   * Maintain consistent code structure across your team

2. **Architecture Documentation**
   * Frontend specifications
   * Backend design patterns
   * Data model documentation
   * System architecture guidelines

3. **Development Guidelines**
   * Coding standards
   * Project-specific rules
   * Best practices
   * Team conventions

## FAQ

### What should I write in Notepads?

Notepads are ideal for:

* Project architecture decisions
* Development guidelines and standards
* Reusable code templates
* Documentation that needs to be referenced frequently
* Team-specific conventions and rules

### What should not be written in Notepads?

Avoid using Notepads for:

* Temporary notes or scratch work
* Information that belongs in version control (like git)
* Sensitive data or credentials
* Highly volatile information that changes frequently

### Should I follow a particular format or structure?

While Notepads are flexible, we recommend:

* Using clear headings and sections
* Including examples where relevant
* Keeping content focused and organized
* Using markdown formatting for better readability
* Adding relevant file attachments when necessary

### Example Notepad

Here's a typical example of a Notepad for a web application project:

```md Notepad example
# API Development Guidelines

## Endpoint Structure
- Use RESTful conventions
- Base URL: `/api/v1`
- Resource naming in plural form

## Authentication
- JWT-based authentication
- Token format: Bearer {token}
- Refresh token mechanism required

## Response Format
{
  "status": "success|error",
  "data": {},
  "message": "Optional message"
} 

## Attached References
@api-specs.yaml
@auth-flow.md
```


# Agent
Source: https://docs.cursor.com/chat/agent

AI assistant that uses tools and reasoning to perform coding tasks with minimal supervision

You can delegate tasks to Cursor Agent and let it work alongside you. Agent performs its work in [Composer](/composer) and is built on top of it. Make sure to read about [Composer](/composer) to best work with Agent.

## Tools

Agent has access to multiple tools, including

* Reading & Writing code
* Searching codebase
* Call [MCP](/context/model-context-protocol) servers
* Run terminal commands
* Automatic web search for up-to-date information

The reasoning capabilities of Agent enables some very powerful workflows where it can perform many consecutive actions without much supervision. When needed, Agent will automatically search the web to find relevant information, documentation, or examples to help with your task.

<Frame>
  <video src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/agent/agent-mcp-postgres.mp4" autoPlay loop muted playsInline />
</Frame>

<Tip>
  Agent can make up to 25 tool calls before stopping. When the limit is reached, you can press "Continue"
  to let Agent make more tool calls (every "Continue" call is counted as one [request](/account/usage)).
</Tip>

### Terminal

When Agent runs terminal commands, it uses VS Code's terminal profiles to determine which shell to use. It iterates through the available profiles, starting with the default one, and selects the first profile that supports command detection. This means the shell used by Agent might differ from your default system shell if another compatible terminal profile is found first.

To change which terminal profile is used:

1. Open Command Palette (`Cmd/Ctrl+Shift+P`)
2. Search for "Terminal: Select Default Profile"
3. Select your preferred terminal profile

## Yolo mode

With Yolo mode enabled, Agent can execute terminal commands by itself. This especially useful when running test suites. Instruct Agent with a task and how to verify changes (running a test), and it will continue until the task is completed.

### Guardrails

You can define guardrails and allow/deny lists for certain commands you don't want Agent to run automatically. This is done from Cursor Settings

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/agent/yolo-settings.png" style={{ padding: 32, background: "#181818" }} />
</Frame>

## Rules

You can direct the Agent with [rules](/context/rules-for-ai). They can auto attached to any Agent request based on glob patterns, or the Agent can grab one based on the rule description.

Read more about how you can [work with rules](/context/rules-for-ai)

## Use Agent

Start by opening a new Composer and enable Agent mode. From there, you can give it instructions on what work to perform.

<Frame>
  <video src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/agent/agent-toggle.mp4" autoPlay loop muted playsInline />
</Frame>

## Models

You can use `claude-3.5-sonnet`, `gpt-4o` and `o3-mini` with Agent today. We'll be adding more models soon!

## FAQ

### What's the difference between Agent and Composer?

You can toggle between Normal and Agent mode in Composer. The main difference is that Agent will think harder, use reasoning and tools to solve problems thrown at it. Normal mode (Edit) is for single-turn edits, while Ask mode helps you understand and explore your code.


# Apply
Source: https://docs.cursor.com/chat/apply

Learn how to apply, accept, or reject code suggestions from chat using Cursor's Apply feature

Cursor's `Apply` allows you to quickly integrate a codeblock suggestion from the chat into your code.

## Apply Code Blocks

To apply a code block suggestion, you can press on the play button in the top right corner of each chat code block.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/chat/apply.png" />
</Frame>

This will edit your file to incorporate the code produced by Chat. Since you can add the most context and have the most back-and-forth with the model in Chat,
we recommend Chat + Apply for more complex AI-driven code changes.

## Accept or Reject

Once you have applied a code block, you can go through the diffs and accept or reject the changes. You can also click
on the "Accept" or "Reject" buttons in the top right corner of the chat code block.

`Ctrl/⌘ Enter` to accept, `Ctrl/⌘ Backspace` to reject.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/chat/accept-apply.png" />
</Frame>


# Overview
Source: https://docs.cursor.com/chat/overview

Unified AI interface that combines Ask, Edit, and Agent modes to help write, edit, and understand code directly in your editor

Cursor's unified AI interface combines different capabilities in one seamless experience. Use `⌘I` to open it, and `⌘N` to create a new conversation. Switch between modes using the mode picker in the input box.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/composer/empty-composer-0.46.png" alt="Unified AI Interface" />
</Frame>

## Modes

The interface offers three modes that you can select from the mode picker:

<CardGroup cols={3}>
  <Card title="Agent" icon="head-side-gear" href="/chat/agent">
    Access tools and reasoning capabilities for complex tasks. Default mode. (⌘I)
  </Card>

  <Card title="Edit" icon="pen-to-square">
    Make single-turn edits to your code with precision and clarity.
  </Card>

  <Card title="Ask" icon="comments">
    Ask questions about your code, get explanations, and discover your codebase. (⌘L)
  </Card>
</CardGroup>

You can switch between modes during a conversation using the mode picker or `⌘.` shortcut. This flexibility lets you adapt to your current needs - from asking questions to making changes to using advanced tools.

## Context

You can use [@-symbols](/context/@-symbols/basic) to include relevant context in your prompts. The interface will automatically suggest relevant context based on your query.

### Autocontext (Beta)

Cursor can automatically include relevant code in your conversations using embeddings and a custom model. Instead of manually selecting context with @-symbols, it analyzes your prompt and includes the most relevant code from your codebase. Enable this feature in Settings > Features > Autocontext.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@-symbols-basics.png" alt="@ Symbol Context Menu" />
</Frame>

## Generating & Applying Changes

Cursor has a custom model trained in-house that is able to take a series of edits, as suggested by the AI model you are using, and apply it to files with 1000s of lines in seconds.

This happens automatically in both Agent and Edit modes.

In Ask mode, you can apply changes by clicking the `Apply` button in the bottom right of the diff view.

Once your changes have been made, you can review them inside your codebase, and then choose to accept or reject them, if you'd like to interate further.

<Card horizontal title="Learn More about Apply" icon="code-commit" href="/chat/apply">
  Find out more about applying changes with Cursor's custom trained model.
</Card>

## Checkpoints

For every iteration a checkpoint is created. You can return to any previous version by clicking on `checkout` near that checkpoint. This is handy if you don't like the current changes and want to revert to an earlier state.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/composer/checkpoints.png" alt="Checkpoints" />
</Frame>

## Chat History

Access previous conversations through the history. Open it from the history icon to the right of Cursor Tab. You'll see a list of past conversations which you can revisit, rename, or remove.

Open with `⌘+⌥+L` or `Ctrl+Alt+L` when the interface is focused.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/composer/history.png" alt="History Icon" />
</Frame>

## Layout

* **Pane**: A sidebar with the interface on the left and your code editor on the right.
* **Editor**: A single editor window, similar to viewing code normally. You can move it around, split it, or even place it in a separate window.
* **Floating**: A draggable window that you can position where you like

You can change this from the menu > Open as \[layout]

## Iterate on lints

Cursor gives the AI direct access to the linter within your codebase, which helps it check over it's own code, as well as existing code in your project.

When Cursor detects issues flagged by an installed linter, the AI can intelligently attempt to fix them on it's own, with the ability to iterate on the changes if needed.

This means you will always end up with clean, compliant code without having to manually check and fix any issues.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/composer/iterate-on-lint.png" alt="Iterate on Lint Fix" />
</Frame>

<Note>
  Some languages (like Rust) require files to be saved before lint errors
  appear, which may limit this feature's effectiveness in all languages.
</Note>

## FAQ

### What's the difference between the modes?

**Ask mode** helps you understand and explore code. Use it to ask questions, get explanations, and learn about your codebase.

**Edit mode** focuses on making single-turn edits to your code. It provides a workspace where you can make precise changes to your files.

**Agent mode** (default) combines both capabilities with additional tools and reasoning abilities for handling complex tasks.

### How are long conversations handled?

For long conversations, Cursor summarizes earlier messages with smaller models like `cursor-small` and `gpt-4o-mini` to keep responses fast and relevant.

This approach helps ensure that even extended conversations remain responsive and coherent, without losing track of key details from earlier exchanges.

### Can I access my conversation history on another computer?

Conversation history is stored locally on your computer and is not stored on Cursor's servers or tied to your Cursor account.

This means if you switch to a different computer, you won't have access to your previous history. You can only access your history on the computer where it was originally created.


# Overview
Source: https://docs.cursor.com/cmdk/overview

Learn how to use Cmd/Ctrl K in Cursor to generate, edit code and ask questions with the Prompt Bar

Cmd K, also known or "Ctrl K" on Windows/Linux, allows you to generate new code or edit existing code in the editor window.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cmdk/regular.png" />
</Frame>

## Prompt Bars

In Cursor, we call the bar that appears when you press `Ctrl/Cmd K` the "Prompt Bar". It works similarly to the AI input box for chat, in
which you can type normally, or use [@ symbols](context/@-symbols) to reference other context.

## Inline Generation

If no code is selected when you press `Ctrl/Cmd K`, Cursor will generate new code based on the prompt you type in the prompt bar.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cmdk/generate.png" />
</Frame>

## Inline Edits

For in-place edits, you can simply select the code you want to edit and type into the prompt bar.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cmdk/edit.png" />
</Frame>

## Follow-up Instructions

After each generation, you can further refine the prompt by adding more instructions to the prompt bar, and pressing `Enter` so the AI regenerates based on your follow-up instructions.

## Default Context

By default, Cursor will try to find different kinds of useful information to improve code generation, in addition to the manual [@ symbols](/context/@-symbols/@-files) you include.

Additional context may include related files, recently viewed files, and more. After gathering, Cursor ranks the context items by relevance to your edit/generation
and keeps the top items in context for the large language model.

## Quick Question

If you press `Option/Alt Enter` while in the prompt bar, Cursor will respond to any questions you have about the selection, and the context you have attached.

The contents of this conversation could be further used in follow-up generations, so you could simply type "do it" after Cursor comes up with a response to generate the code after a quick question.


# Terminal Cmd K
Source: https://docs.cursor.com/cmdk/terminal-cmdk

Use Ctrl/⌘ K in Cursor terminal to generate and run commands through a prompt bar interface

In the built-in Cursor terminal, you can press `Ctrl/⌘ K` to open a prompt bar on the bottom of the terminal.
This prompt bar allows you to describe your desired action in the terminal, and terminal Cmd K will generate a command.
You can accept the command by hitting `esc` or run the command immediately with `Ctrl/⌘ + Enter`.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cmdk/terminal-cmdk.png" />
</Frame>

By default, Terminal Cmd K sees your recent terminal history, your instructions, and anything else you put in the prompt bar as context.


# @Code
Source: https://docs.cursor.com/context/@-symbols/@-code

Learn to reference code using @Code symbol and keyboard shortcuts for adding code to Chat or Edit

To reference specific sections of code, you can use the `@Code` symbol.

## Code Preview

Similar to the [`@Files`](/context/@-symbols/@-files) symbol, Cursor will show a preview of the code's content so you can verify that the code you're referencing is the correct one.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@code.png" />
</Frame>

## From the Editor

Another way to add code snippets as context is to select the code you want to reference, and click on either "Add to Chat" (`Ctrl/⌘ Shift L`) or "Add to Edit" (`Ctrl/⌘ Shift K`).

These will add the selected code snippet to either the Chat input box or the currently active Cmd K prompt bar.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@code-select.png" />
</Frame>

To add a selected code to a new chat, you can press `Ctrl/⌘ L`.


# @Codebase
Source: https://docs.cursor.com/context/@-symbols/@-codebase

Learn how Chat processes codebase queries using gathering, reranking, reasoning, and generation steps

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/chat/@codebase.png" />
</Frame>

Through `@Codebase`, Chat goes through these steps until it finds the most important pieces of code to use.

* Gathering: scanning through your codebase for important files / code chunks
* Reranking: reordering the context items based on relevancy to the query
* Reasoning: thinking through a plan of using the context
* Generating: coming up with a response

Another way of submitting an advanced codebase query is to click on the dropdown next to the `Ctrl/⌘ + Enter` button and select `reranker` for the search behavior.
This is only available when `@Codebase` isn't used, otherwise `@Codebase` takes precedence.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/chat/codebase-dropdown.png" />
</Frame>


# @Cursor Rules
Source: https://docs.cursor.com/context/@-symbols/@-cursor-rules

Work with and reference Cursor rules in your project

The \`@Cursor Rules\` symbol provides access to [project rules](/context/rules-for-ai#project-rules-recommended) and guidelines you've set up for your project, allowing you to explicitly apply them to your context.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@cursor-rules.png" />
</Frame>


# @Definitions
Source: https://docs.cursor.com/context/@-symbols/@-definitions

Add nearby code definitions to Cmd K context using the @Definitions symbol

<Info>This feature is currently only for Cmd K.</Info>

The `@Definitions` symbol adds all nearby definitions to Cmd K as context.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@definitions.png" />
</Frame>


# @Docs
Source: https://docs.cursor.com/context/@-symbols/@-docs

Learn how to use, add, and manage custom documentation as context in Cursor using @Docs

<Frame>
  ![](https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@docs.png)
</Frame>

Cursor comes with a set of third party docs crawled, indexed, and ready to be used as context. You can access them by using the `@Docs` symbol. You can find a list of our default pre-scraped docs [here](https://raw.githubusercontent.com/getcursor/crawler/main/docs.jsonl).

## Add Custom Docs

If you want to crawl and index custom docs that are not already provided, you can do so by `@Docs` > `Add new doc`.
The following modal will appear after you've pasted in the URL of your desired doc:

<Frame>
  ![](https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@docs-add.png)
</Frame>

Cursor will then index and learn the doc, and you will be able to use it as context like any other doc. Make sure to add a trailing slash to the URL if you want to index all subpages and subdirectories

<Frame>
  ![](https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@docs-learning.png)
</Frame>

<Info>
  Cursor will automatically keep Docs indexed and will re-index them periodically to keep them up to date as they are edited or changed.
</Info>

## Manage Custom Docs

Under `Cursor Settings` > `Features` > `Docs`, you will see the docs you have added.
You can edit, delete, or add new docs here.

<Frame>
  ![](https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@docs-manage.png)
</Frame>


# @Files
Source: https://docs.cursor.com/context/@-symbols/@-files

Learn how to reference files using @ in Cursor's Chat and Cmd K, with preview and chunking features

In AI input boxes such as in Chat and Cmd K, you can reference entire files by using `@Files`.
Also, if you continue to type after `@`, you will see your file search results after the [`@Code`](/context/@-symbols/@-code) strategy.

In order to make sure the file you're referencing is the correct file, Cursor will show a preview of the file's path. This is especially useful when you have multiple files with the same name in different folders.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@file.png" />
</Frame>

### Chat Long File References

In Cursor's Chat, if the contents of a file is too long, Cursor will chunk the file into smaller chunks and rerank them based on relevance to the query.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@file-long-file.png" />
</Frame>

{/*

  commenting this out, not in product anymore afaik // ez 2025-02-09

  ### Cmd K Chunking Strategy

  For Cmd K, Cursor uses the file references differently based on the content length as well.

  - auto
  - Automatically pick one of the three reading strategies based on the file size
  - full file
  - The entire file is used as context.
  - outline
  - Cursor parses the outline of the file and uses the information as context.
  - chunks
  - Cursor chunks the file into smaller chunks and picks the most relevant one.

  <Frame>
  <img src="/images/context/@file-cmdk.png" />
  </Frame> */}

### Drag and Drop

You can drag and drop files from the primary sidebar into Composer, Chat or Cmd K to add them as context.


# @Folders
Source: https://docs.cursor.com/context/@-symbols/@-folders

Reference folders as context in Chat & Composer for enhanced AI conversations

You can reference entire folders in Cursor as context. When using `@Folders` with Agent, it attaches a list of all items in the directory, which allows the Agent to search through the contents itself. This gives Agent the ability to explore and analyze the folder's contents independently as needed for the task at hand.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@folder.png" />
</Frame>


# @Git
Source: https://docs.cursor.com/context/@-symbols/@-git

Learn how to use @Git in Cursor's Chat to analyze diffs, find bugs, and generate commit messages

<Info>Currently, `@Git` is only supported in Chat & Composer</Info>

In Cursor's Chat, you can use `@Git` to add git commits, diffs, or pull requests to your prompt.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@git.png" />
</Frame>

## Common Use Cases

One common use case for `@Git` is to allow Cursor's AI to scan the diff and look for bugs or issues that could be caused by the diff.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@git-usecase1.png" />
</Frame>

You could also use `@Diff of Working State` to generate a commit message from your current diffs.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@git-commit-message.png" />
</Frame>


# @Link
Source: https://docs.cursor.com/context/@-symbols/@-link

Use web content as context by linking to external websites and resources

## Paste Links

In order for Cursor to visit a link before paste the link and you'll see that the link is "tagged"

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@link.png" />
</Frame>

## Remove Links

By default, we automatically parse links and turn them into `@Links` in Chat.
If you prefer to have the link as plain text, click on the link and then click `Unlink`.

You can also paste without formatting (hold `Shift`) to make sure the link is not tagged

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@link-unlink.png" />
</Frame>


# @Lint Errors
Source: https://docs.cursor.com/context/@-symbols/@-lint-errors

Access and reference linting errors in your codebase

The `@Lint Errors` symbol automatically captures and provides context about any linting errors and warnings from your currently active file.

[Composer](/composer) and [Agent](/agent) can see lint errors by default

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@lint-errors.png" />
</Frame>


# @Notepads
Source: https://docs.cursor.com/context/@-symbols/@-notepads

Reference and include notepads as context in Cursor

The `@Notepads` symbol allows you to reference and include your [Notepads](/beta/notepads) as context in your conversations. Notepads are powerful context-sharing tools that bridge the gap between composers and chat interactions, allowing you to create reusable contexts for your development workflow.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@-notepads.png" />
</Frame>


# @Recent Changes
Source: https://docs.cursor.com/context/@-symbols/@-recent-changes

Access and reference recent changes in your workspace

Cursor automatically keeps track of recent changes made to your codebase. The `@Recent Changes` symbol allows you to pass these modifications as context

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@recent-changes.png" />
</Frame>


# @Summarized Composers
Source: https://docs.cursor.com/context/@-symbols/@-summarized-composers

Reference summarized versions of your previous Composer sessions as context in new conversations

When working on complex tasks in [Composer](/composer), you might want to reference context or decisions from previous conversations. The `@Summarized Composers` symbol allows you to include summarized versions of your previous Composer sessions as context.

This is particularly useful when:

* You have a long Composer session with important context you want to reference
* You're starting a new but related task and want to maintain continuity
* You want to share the reasoning or decisions from a previous session

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@-summarized-composers.png" />
</Frame>


# @Web
Source: https://docs.cursor.com/context/@-symbols/@-web

@Web command searches the internet automatically to find relevant context for Cursor queries

## `@Web`

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@web.png" />
</Frame>

With `@Web`, Cursor constructs a search query based on the query and the context you've provided, and searches the web to
find relevant information as additional context.

This can be useful to allow Cursor to find the most up-to-date information online, or to allow Cursor to scrape multiple websites in a few seconds to find the best answer, without the user having to manually search anywhere.

<Tip>When using Agent mode, Cursor will automatically search the web when it needs up-to-date information or additional context.</Tip>


# Overview
Source: https://docs.cursor.com/context/@-symbols/overview

Overview of all @ symbols available in Cursor for context and commands

In Cursors input boxes, such as in Composer, Chat and Cmd K, you can use @ symbols by typing `@`. A popup menu will appear with a list of suggestions,
and it will automatically filter to only show the most relevant suggestions based on your input.

## Keyboard Shortcuts

You can navigate through the list of suggestions using the up/down arrow keys. You can hit `Enter` to select a suggestion. If the suggestion is a category, such as `Files`,
the suggestions will be filtered to only show the most relevant items within that category.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@-symbols-basics.png" />
</Frame>

Here's the list of all @ symbols available:

* [@Files](/context/@-symbols/@-files) - Reference specific files in your project

* [@Folders](/context/@-symbols/@-folders) - Reference entire folders for broader context

* [@Code](/context/@-symbols/@-code) - Reference specific code snippets or symbols from your codebase

* [@Docs](/context/@-symbols/@-docs) - Access documentation and guides

* [@Git](/context/@-symbols/@-git) - Access git history and changes

* [@Notepads](/context/@-symbols/@-notepads) - Access notepads

* [@Summarized Composers](/context/@-symbols/@-summarized-composers) - Work with summarized composer sessions

* [@Cursor Rules](/context/@-symbols/@-cursor-rules) - Work with cursor rules

* [@Web](/context/@-symbols/@-web) - Reference external web resources and documentation

* [@Link (paste)](/context/@-symbols/@-link) - Create links to specific code or documentation

* [@Recent Changes](/context/@-symbols/@-recent-changes) - Create links to specific code or documentation

* [@Codebase](/context/@-symbols/@-codebase) - Reference your entire codebase as context ([Chat](/chat/overview) only)

* [@Lint Errors](/context/@-symbols/@-lint-errors) - Reference lint errors ([Chat](/chat/overview) only)

* [@Definitions](/context/@-symbols/@-definitions) - Look up symbol definitions ([Cmd K](/cmdk/overview) only)
  There are also some other symbols that can be used:

* [# Files](/context/@-symbols/pill-files) - Add files to the context without referencing

* [/ Commands](/context/@-symbols/slash-commands) - Add open and active files to the context


# #Files
Source: https://docs.cursor.com/context/@-symbols/pill-files

Use # to select files and @ for context control when chatting with AI agents

Use `#` followed by a filename to focus on specific files. Combine this with `@` symbols for precise context control.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/pill-files.png" alt="# file picker" />
</Frame>


# /command
Source: https://docs.cursor.com/context/@-symbols/slash-commands

Use / to reference open editor tabs and add them as context when composing chats with the AI agent

You type `/`to quickly reference open editors and add them as context

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/slash-commands.png" alt="/ commands context" />
</Frame>

* **Open editors**: All editors tabs currently open
* **Active editors**: All editor tabs in view. This is typically when splitting the layout to show multiple editors


# Codebase Indexing
Source: https://docs.cursor.com/context/codebase-indexing

Learn how to index your codebase in Cursor for more accurate AI assistance and search results

### Index your Codebase

For better and more accurate codebase answers, you can index your codebase. Behind the scenes, Cursor
computes embeddings for each file in your codebase, and will use these to improve the accuracy of your codebase answers.

When a project is opened, each Cursor instance will initialize indexing for that workspace. After the initial indexing setup is complete, Cursor will automatically index any new files added to your workspace to keep your codebase context current.

The status of your codebase indexing is under `Cursor Settings` > `Features` > `Codebase Indexing`.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/chat/codebase-indexing.png" />
</Frame>

### Advanced Settings

By default, Cursor will index all files in your codebase.

You can also expand the `Show Settings` section to access more advanced options.
Here, you can decide whether you want to enable automatic indexing for new repositories and configure the files
that Cursor will ignore during repository indexing.

Cursor uses the same package as VS Code to handle file ignoring, which means it respects all `.gitignore` files, including those in subdirectories. You can also create a `.cursorignore` file for user-specific ignore patterns, which you may want to add to your global `.gitignore` to avoid committing it to the repository.

If you have any large content files in your project that the AI definitely doesn't need to read, [ignoring those files](/context/ignore-files) could improve the accuracy of the answers.

### Working with large monorepos

When working with large monorepos containing hundreds of thousands of files, it's important to be strategic about what gets indexed.

* Use `.cursorignore` to let each developer configure which folders and paths they work on in the monorepo
* Add `.cursorignore` to your global `.gitignore`

This allows each developer to optimize indexing for their specific work areas within the monorepo.

## FAQ

### Where can I see all codebases I have indexed?

Currently, there is no way to see a list of all codebases you have indexed. You'll need to manually check each project's indexing status by opening the project in Cursor and checking the Codebase Indexing settings.

### How do I delete all codebases?

You can either delete your Cursor account from Settings to remove all indexed codebases, or manually delete individual codebases from the Codebase Indexing settings in each project. There's currently no way to delete all codebases at once without deleting your account.


# Ignore Files
Source: https://docs.cursor.com/context/ignore-files

Learn how to use .cursorignore and .cursorindexingignore to control file access and indexing in Cursor

## Overview

Cursor provides two different ignore files to control how files are handled:

* `.cursorignore`: Makes a best-effort attempt to exclude files from both AI features and indexing
* `.cursorindexingignore`: Controls only which files are indexed for search and context (same as the old `.cursorignore`)

<Note>
  As of 0.46, `.cursorignore` attempts to exclude files from both AI access and indexing (similar to the previously unreleased `.cursorban`). For indexing-only control like the old `.cursorignore`, use `.cursorindexingignore`.
</Note>

## `.cursorignore`

<Warning>
  The `.cursorignore` is best-effort, meaning we do not guarantee that files in it are blocked from being sent up. We may have bugs that allow ignored files to be sent up in certain cases. Please let us know if you find bugs like that and we will do our best to fix!
</Warning>

The `.cursorignore` file makes a best-effort attempt to exclude files from both AI features and indexing. This is useful for:

* Attempting to exclude sensitive files from AI access and indexing
* Excluding configuration files with secrets
* Limiting access to proprietary code

Files listed in `.cursorignore` will be excluded from Cursor's AI features in a best-effort way:

* Not included in tab and chat requests
* Not included in context for AI features
* Not indexed for search or context features
* Not available through @-symbols or other context tools

## `.cursorindexingignore`

<Tip>
  `.cursorindexingignore` files automatically inherits all patterns from your `.gitignore` files
</Tip>

The `.cursorindexingignore` file only controls which files are indexed for search and context features. This provides the same indexing control as the old `.cursorignore`. Use this file when you want to:

* Exclude large generated files from indexing
* Skip indexing of binary files
* Control which parts of your codebase are searchable
* Optimize indexing performance

Important: Files in `.cursorindexingignore` can still be manually included as context or accessed by AI features - they just won't be automatically indexed or included in search results.

<Accordion title="Default Indexing Ignore Files">
  For indexing only, in addition to the files designated in your `.gitignore`, `.cursorignore` and `.cursorindexignore` files, the following files are ignored by default. Note that these default files only apply to indexing, not to other AI features.

  ```sh
  package-lock.json
  pnpm-lock.yaml
  yarn.lock
  composer.lock
  Gemfile.lock
  bun.lockb
  .env*
  .git/
  .svn/
  .hg/
  *.lock
  *.bak
  *.tmp
  *.bin
  *.exe
  *.dll
  *.so
  *.lockb
  *.qwoff
  *.isl
  *.csv
  *.pdf
  *.doc
  *.doc
  *.xls
  *.xlsx
  *.ppt
  *.pptx
  *.odt
  *.ods
  *.odp
  *.odg
  *.odf
  *.sxw
  *.sxc
  *.sxi
  *.sxd
  *.sdc
  *.jpg
  *.jpeg
  *.png
  *.gif
  *.bmp
  *.tif
  *.mp3
  *.wav
  *.wma
  *.ogg
  *.flac
  *.aac
  *.mp4
  *.mov
  *.wmv
  *.flv
  *.avi
  *.zip
  *.tar
  *.gz
  *.7z
  *.rar
  *.tgz
  *.dmg
  *.iso
  *.cue
  *.mdf
  *.mds
  *.vcd
  *.toast
  *.img
  *.apk
  *.msi
  *.cab
  *.tar.gz
  *.tar.xz
  *.tar.bz2
  *.tar.lzma
  *.tar.Z
  *.tar.sz
  *.lzma
  *.ttf
  *.otf
  *.pak
  *.woff
  *.woff2
  *.eot
  *.webp
  *.vsix
  *.rmeta
  *.rlib
  *.parquet
  *.svg
  .egg-info/
  .venv/
  node_modules/
  __pycache__/
  .next/
  .nuxt/
  .cache/
  .sass-cache/
  .gradle/
  .DS_Store/
  .ipynb_checkpoints/
  .pytest_cache/
  .mypy_cache/
  .tox/
  .git/
  .hg/
  .svn/
  .bzr/
  .lock-wscript/
  .Python/
  .jupyter/
  .history/
  .yarn/
  .yarn-cache/
  .eslintcache/
  .parcel-cache/
  .cache-loader/
  .nyc_output/
  .node_repl_history/
  .pnp.js/
  .pnp/
  ```
</Accordion>

## File Format

Both files use the same syntax as `.gitignore`. Here are some examples:

### Basic Patterns

```sh
# Ignore all files in the `dist` directory
dist/

# Ignore all `.log` files
*.log

# Ignore specific file `config.json`
config.json
```

### Advanced Patterns

Include only `*.py` files in the `app` directory:

```sh
# ignore everything
*
# do not ignore app
!app/
# do not ignore directories inside app
!app/*/
!app/**/*/
# don't ignore python files
!*.py
```

## Troubleshooting

The ignore file syntax follows `.gitignore` exactly. If you encounter issues:

1. Replace "cursorignore" with "gitignore" in your search queries
2. Check [Stack Overflow](https://stackoverflow.com/questions/tagged/gitignore) for similar patterns
3. Test patterns with `git check-ignore -v [file]` to understand matching

Common gotchas:

* Patterns are matched relative to the ignore file location
* Later patterns override earlier ones
* Directory patterns need a trailing slash
* Negation patterns (`!`) must negate a previous pattern


# Model Context Protocol
Source: https://docs.cursor.com/context/model-context-protocol

Learn how to add and use custom MCP tools within Cursor feature

## What is MCP?

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) is an open protocol that standardizes how applications provide context and tools to LLMs. Think of MCP as a plugin system for Cursor - it allows you to extend the Agent's capabilities by connecting it to various data sources and tools through standardized interfaces.

<Card title="Learn More About MCP" icon="book-open" horizontal href="https://modelcontextprotocol.io/introduction">
  Visit the official MCP documentation to understand the protocol in depth
</Card>

### Uses

MCP allows you to connect Cursor to external systems and data sources. This means you can integrate Cursor with your existing tools and infrastructure, instead of having to tell Cursor what the structure of your project is outside of the code itself.

MCP servers can be **written in any language** that can print to `stdout` or serve an HTTP endpoint. This flexibility allows you to implement MCP servers using your preferred programming language and technology stack very quickly.

#### Examples

<Card title="Databases" icon="database">
  Allow Cursor to query your databases directly, instead of manually feeding in schemas, or manipulating the data yourself.
</Card>

<CardGroup cols="2">
  <Card title="Notion" icon="book">
    Read data out of notion to guide cursor to implement a feature
  </Card>

  <Card title="GitHub" icon="github">
    Let Cursor create PRs, create branches, find code, etc
  </Card>

  <Card title="Memory" icon="memory">
    Allow Cursor to remember and recall information while you work
  </Card>

  <Card title="Stripe" icon="credit-card">
    Allow Cursor to create customers, manage subscriptions, etc
  </Card>
</CardGroup>

### Architecture

MCP servers are lightweight programs that expose specific capabilities through the standardized protocol. They act as intermediaries between Cursor and external tools or data sources.

Cursor supports two transport types for MCP servers:

<CardGroup cols="2">
  <Card title="💻 stdio Transport">
    \- Runs on your **local machine**

    \- Managed automatically by Cursor

    \- Communicates directly via `stdout`

    \- Only accessible by you locally

    **Input:** Valid shell command that is ran by Cursor automatically
  </Card>

  <Card title="🌐 SSE Transport">
    \- Can run **locally or remotely**

    \- Managed and run by you

    \- Communicates **over the network**

    \- Can be **shared** across machines

    **Input:** URL to the `/sse` endpoint of an MCP server external to Cursor
  </Card>
</CardGroup>

<Tip>
  For stdio servers, the command should be a valid shell command that Cursor can run.

  For SSE servers, the URL should be the URL of the SSE endpoint, e.g. `http://example.com:8000/sse`.
</Tip>

Each transport type has different use cases, with stdio being simpler for local development and SSE offering more flexibility for distributed teams.

## Configuring MCP Servers

The MCP configuration file uses a JSON format with the following structure:

<CodeGroup>
  ```json CLI Server - Node.js
  // This example demonstrated an MCP server using the stdio format
  // Cursor automatically runs this process for you
  // This uses a Node.js server, ran with `npx`
  {
    "mcpServers": {
      "server-name": {
        "command": "npx",
        "args": ["-y", "mcp-server"],
        "env": {
          "API_KEY": "value"
        }
      }
    }
  }
  ```

  ```json CLI Server - Python
  // This example demonstrated an MCP server using the stdio format
  // Cursor automatically runs this process for you
  // This uses a Python server, ran with `python`
  {
    "mcpServers": {
      "server-name": {
        "command": "python",
        "args": ["mcp-server.py"],
        "env": {
          "API_KEY": "value"
        }
      }
    }
  }
  ```

  ```json SSE Server
  // This example demonstrated an MCP server using the SSE format
  // The user should manually setup and run the server
  // This could be networked, to allow others to access it too
  {
    "mcpServers": {
      "server-name": {
        "url": "http://localhost:3000/sse",
        "env": {
          "API_KEY": "value"
        }
      }
    }
  }
  ```
</CodeGroup>

<Tip>
  The `env` field allows you to specify environment variables that will be available to your MCP server process. This is particularly useful for managing API keys and other sensitive configuration.
</Tip>

### Configuration Locations

You can place this configuration in two locations, depending on your use case:

<Card title="Project Configuration" icon="folder-tree">
  For tools specific to a project, create a `.cursor/mcp.json` file in your project directory. This allows you to define MCP servers that are only available within that specific project.
</Card>

<Card title="Global Configuration" icon="globe">
  For tools that you want to use across all projects, create a `\~/.cursor/mcp.json` file in your home directory. This makes MCP servers available in all your Cursor workspaces.
</Card>

## Using MCP Tools in Agent

The Composer Agent will **automatically** use any MCP tools that are listed under `Available Tools` on the MCP settings page if it determines them to be relevant.
To prompt tool usage intentionally, simply tell the agent to use the tool, referring to it either by name or by description.

### Tool Approval

By default, when Agent wants to use an MCP tool, it will display a message asking for your approval. You can use the arrow next to the tool name to expand the message, and see what arguments the Agent is calling the tool with.

<Frame>
  ![](https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/advanced/mcp-mars-request.png)
</Frame>

#### Yolo Mode

You can enable Yolo mode to allow Agent to automatically run MCP tools without requiring approval, similar to how terminal commands are executed. Read more about Yolo mode and how to enable it [here](/agent#yolo-mode).

### Tool Response

When a tool is used Cursor will display the response in the chat.
This image shows the response from the sample tool, as well as expanded views of the tool call arguments and the tool call response.

<Frame>
  ![](https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/advanced/mcp-mars-response.png)
</Frame>

## Limitations

MCP is a very new protocol and is still in active development. There are some known caveats to be aware of:

<AccordionGroup>
  <Accordion title="Tool Quantity">
    Some MCP servers, or user's with many MCP servers active, may have many tools available for Cursor to use. Currently, Cursor will only send the first 40 tools to the Agent.
  </Accordion>

  <Accordion title="Remote Development">
    Cursor directly communicates with MCP servers from your local machine, either directly through `stdio` or via the network using `sse`. Therefore, MCP servers may not work properly when accessing Cursor over SSH or other development environments. We are hoping to improve this in future releases.
  </Accordion>

  <Accordion title="MCP Resources">
    MCP servers offer two main capabilities: tools and resources. Tools are availabe in Cursor today, and allow Cursor to execute the tools offered by an MCP server, and use the output in it's further steps. However, resources are not yet supported in Cursor. We are hoping to add resource support in future releases.
  </Accordion>
</AccordionGroup>


# Rules for AI
Source: https://docs.cursor.com/context/rules-for-ai

Learn how to customize AI behavior in Cursor using project-specific and global rules

Using rules in Cursor you can control the behavior of the underlying model. You can think of it as instructions and/or a system prompt for LLMs.

Inside Cursor, we have two main ways to customize the behavior of the AI to suit your needs:

<CardGroup cols={2}>
  <Card title="Project Rules" icon="folder-tree">
    Rules specific to a project, stored in the `.cursor/rules` directory. They are automatically included when matching files are referenced.
  </Card>

  <Card title="Global Rules" icon="globe">
    Rules applied globally to all projects, configured in the `Cursor Settings` > `General` > `Rules for AI` section.
  </Card>
</CardGroup>

Learn more about how to use them in the following sections.

## Project Rules (recommended)

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/project-rules.png" />
</Frame>

Project rules offer a powerful and flexible system with path specific configurations. Project rules are stored in the `.cursor/rules` directory and provide granular control over AI behavior in different parts of your project.

Here's how they work

* **Semantic Descriptions**: Each rule can include a description of when it should be applied
* **File Pattern Matching**: Use glob patterns to specify which files/folders the rule applies to
* **Automatic Attachment**: Rules can be automatically included when matching files are referenced
* **Reference files**: Use @file in your project rules to include them as context when the rule is applied.

<Tip>
  You can reference rule files using @file, allowing you to chain multiple rules
  together
</Tip>

You can create a new rule using the command palette with `Cmd + Shift + P` > `New Cursor Rule`. By using project rules you also get the benefit of version control since it's just a file

Example use cases:

* Framework-specific rules for certain file types (e.g., SolidJS preferences for `.tsx` files)
* Special handling for auto-generated files (e.g., `.proto` files)
* Custom UI development patterns
* Code style and architecture preferences for specific folders

## Global Rules

Global rules can be added by modifying the `Rules for AI` section under `Cursor Settings` > `General` > `Rules for AI`. This is useful if you want to specify rules that should always be included in every project like output language, length of responses etc.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/rules-for-ai.png" />
</Frame>

## `.cursorrules`

For backward compatibility, you can still use a `.cursorrules` file in the root of your project. We will eventually remove .cursorrules in the future, so we recommend migrating to the new Project Rules system for better flexibility and control.


# FAQ
Source: https://docs.cursor.com/faq

Frequently asked questions about Cursor's features, language support, models, and usage

<AccordionGroup>
  <Accordion title="What programming languages does Cursor support?">
    While Cursor works with any programming language, it excels with Python and JavaScript/TypeScript due to extensive model training data. It also performs well with Swift, C, and Rust. You can enhance support for any language by adding relevant documentation to your project.
  </Accordion>

  <Accordion title="How do you keep the AI models up-to-date with latest documentation?">
    Cursor leverages powerful foundational models like Claude 3.5 and GPT-4. For the most current library information, you can use our [@web](/context/@-symbols/@-web) search feature. Since core language concepts rarely change dramatically, the models maintain their effectiveness over time.
  </Accordion>

  <Accordion title="What is the purpose of the MCP server?">
    The MCP server serves as a bridge for bringing external context into Cursor. It enables connections to services like Google Drive and Notion, helping you incorporate documentation and requirements from these sources into your workflow.
  </Accordion>

  <Accordion title="Are there size limitations for project indexing?">
    Projects are limited to 10,000 files by default, though this can be adjusted if needed. To optimize indexing performance, you can use `.cursorignore` to exclude unnecessary files from the indexing process.
  </Accordion>

  <Accordion title="How do I share context between multiple repositories?">
    Currently, the simplest method is to place related repositories in the same directory and launch Cursor from there. We're actively developing improved support for managing multiple project folders.
  </Accordion>

  <Accordion title="How do Cursor updates work?">
    Cursor is frequently updated with new features and improvements. You can find the latest changes and updates in our changelog at [cursor.com/changelog](https://cursor.com/changelog). We regularly release updates to enhance your experience and add new capabilities.
  </Accordion>

  <Accordion title="Why haven't I received the latest release yet?">
    We roll out new releases gradually over multiple days to ensure stability. If you haven't received an update yet, you can expect it to show up soon. You can also manually check for updates by opening the Command Palette (Cmd/Ctrl + Shift + P) and typing "Attempt Update".
  </Accordion>
</AccordionGroup>

<AccordionGroup>
  <Accordion title="How can I delete my data?">
    You can delete your account and all associated data by going to your [Dashboard](https://cursor.com/settings) and clicking the "Delete Account" button
  </Accordion>
</AccordionGroup>

**Additional resources**

* [Common Issues](/troubleshooting/common-issues) - Solutions to frequently encountered problems
* [Keyboard Shortcuts](/kbd) - Complete list of keybindings and shortcuts


# Installation
Source: https://docs.cursor.com/get-started/installation

Learn how to install, set up, and use Cursor with AI features like Chat, Tab, and Composer

## Installation

1. Visit [cursor.com](https://cursor.com) and click the "Download" button
   <Tip>
     The installer for your operating system will automatically download
   </Tip>
2. Run the installer and wait for installation to complete
3. Launch Cursor via the Desktop shortcut or from the Applications menu

## Setting up

On your first launch, you'll be prompted to configure a few settings to ensure you get up and running quickly!

<CardGroup cols={2}>
  <Card title="Keyboard shortcuts" icon="keyboard">
    If you are coming from a different editor, you can choose the default shortcuts you want to start with, so they are as familiar as possible.
  </Card>

  <Card title="Language" icon="language">
    If you want the AI to talk to you in a different language, you can enter the name of the language you want to use. This can be configured further in the [Rules for AI](/context/rules-for-ai).
  </Card>

  <Card title="Codebase Indexing" icon="database">
    Cursor indexes your codebase locally to provide better AI suggestions. Learn more in [Codebase Indexing](/context/codebase-indexing).
  </Card>

  <Card title="CLI Shortcuts" icon="terminal">
    You can choose to install `cursor` and `code` commands to launch Cursor from the terminal.
  </Card>
</CardGroup>

After configuring these settings, you will have the option to import your VS Code settings in one click. If you accept, this will import your extensions, themes, user settings, and keyboard shortcuts into Cursor, so you can get started right away.

Next, you'll be asked about your data preference. To learn more about this, and make an informed decision, read more about our dedicated [privacy page](/account/privacy)

## Logging In

1. Once you click **"Sign Up"** or **"Login"**, you'll be prompted to setup an account.
   You can choose to use your email, or sign up with Google or GitHub.
2. Once signed in, you'll be sent back to Cursor and you'll be **ready to start coding!**

<Tip>
  If you're using Cursor for the first time, you'll get a 14-day free trial of
  Cursor Pro as soon as you sign up. Learn more about Cursor Pro on our
  [website](https://cursor.com/features).
</Tip>

## Migrating from other editors

While Cursor is built on top the same core as VS Code, there are some key differences that you should be aware of. Additionally, for those coming from other editors, you may not be familiar with the structure of Cursor.

To help you get started, we've put together a guide to help you migrate from other editors.

<CardGroup cols={2}>
  <Card horizontal title="Migrating from VSCode" icon="code-compare" href="/guides/migration/vscode" />

  <Card horizontal title="Migrating from JetBrains" icon="laptop-code" href="/guides/migration/jetbrains" />
</CardGroup>

We hope to add more migration guides for other editors soon!

## Next Steps

Now that you've installed Cursor, head over to the [Introduction](/get-started/introduction) to learn about Cursor's features and how to get started using them.


# Introduction
Source: https://docs.cursor.com/get-started/introduction

Learn how to use Cursor's core features: Tab completion, Chat for code queries, and Agent for assistance

## Overview

Cursor is a powerful AI-first code editor that enhances your development workflow. After [installation](/get-started/installation), you'll have access to these core features that work together seamlessly to make you more productive:

* **AI-powered code completion** that understands your codebase and provides context-aware suggestions
* **Conversation interface** for exploring, understanding, and modifying code with Ask, Edit, and Agent modes
* **Intelligent tools** for handling complex development tasks

## Getting Started

Start exploring Cursor's AI-powered features:

* **Tab**: Press `Tab` for intelligent code completions
* **CMD-K**: Use `Cmd/Ctrl + K` for inline code edits
* **Composer**: Use `⌘I` to open the unified AI interface with Ask, Edit, and Agent modes

## Settings

Cursor is designed to be flexible and customizable. You can configure it in two ways:

### Cursor Settings

* Access via gear icon, `Cmd/Ctrl + Shift + J`, or Command Palette > `Cursor Settings`
* Configure AI features and Cursor-specific preferences

### Editor Settings

* Access via Command Palette (`Cmd/Ctrl + Shift + P`) > `"Preferences: Open Settings (UI)"`
* Adjust editor behavior and appearance

Let's explore each feature in detail:

### Tab

Tab completion in Cursor is powered by advanced AI models that understand your code context. As you type, you'll receive intelligent suggestions that:

* Complete your current line of code
* Suggest entire function implementations
* Help with common patterns and boilerplate
* Adapt to your coding style over time

Learn more about [Tab features](/tab/overview) or see how it [compares to GitHub Copilot](/tab/from-gh-copilot).

### Composer

Cursor provides a unified AI interface with three modes that seamlessly work together:

**Ask Mode**

* Ask questions about specific code sections
* Get explanations of complex functions
* Find code patterns and examples
* Discover and understand your codebase

**Edit Mode**

* Make single-turn edits to your code
* Apply targeted changes with precision
* Review and apply changes with confidence
* Work with files individually

**Agent Mode (Default)**

* Make codebase-wide changes and refactoring
* Implement new features from requirements
* Debug complex issues across multiple files
* Generate tests and documentation
* Maintain consistency across your entire project

Switch between modes during conversations to best suit your current task. Learn more about the [unified AI interface](/composer) or explore specific capabilities in [Agent mode](/agent).

### Context

Context is the foundation that powers all of Cursor's AI features. Here's how it works:

* When you open a codebase, we automatically [index your code](/context/codebase-indexing) to make it available as context
* Use [@-symbols](/context/@-symbols/basic) to precisely control what context you provide:
  * [@files](/context/@-symbols/@-files) and [@folders](/context/@-symbols/@-folders) for specific paths
  * [@web](/context/@-symbols/@-web) for external documentation
  * [@git](/context/@-symbols/@-git) for version control context
* Configure [rules for AI](/context/rules-for-ai) to customize behavior
* Set up [MCP](/context/model-context-protocol) for external context providers

## Models

You can see all the models we support and their pricing on the [models page](/settings/models). Configure your [API keys](/settings/api-keys) and [preferences](/settings/preferences) in Settings.

## Usage

It's highly recommended to read about [usage](/account/usage) and [plans](/account/plans) to understand how Cursor pricing works. Check out our [pricing page](/account/pricing) for more details about plans and features.

Need help? Visit our [troubleshooting guide](/troubleshooting/troubleshooting-guide) or join our [community forum](/resources/forum).


# Welcome to Cursor
Source: https://docs.cursor.com/get-started/welcome

AI-powered IDE with Chat, Tab, and Agent for intelligent code development

Cursor is a new, intelligent IDE, empowered by seamless integrations with AI.
Built upon VSCode, Cursor is quick to learn, but can make you extraordinarily productive.

## Get Started

If you're new to Cursor, you can get started using the guides below.

<CardGroup cols={1}>
  <Card horizontal title="Introduction" icon="book-open" href="/get-started/introduction">
    <div className="text-sm">
      Learn about Cursor's core features and concepts.
    </div>
  </Card>

  <Card horizontal title="Installation" icon="download" href="/get-started/installation">
    <div className="text-sm">
      Get started with Cursor in minutes, by downloading and installing for your
      platform.
    </div>
  </Card>
</CardGroup>

## The Editor

Cursor has a number of core features that will seamlessly integrate with your workflow. <br />
Use the links below to learn more about what Cursor can do.

<CardGroup cols={2}>
  <Card title="Tab" icon="arrow-right" href="/tab/overview">
    <div className="text-sm">
      Smart code completion that learns from you! Make multi-line edits, fix
      errors you might have missed, and predict your next action.
    </div>
  </Card>

  <Card title="Agent" icon="pen-to-square" href="/chat/agent">
    <div className="text-sm">
      Your AI pair programmer for complex code changes. Make large-scale edits
      with precise context control and automatic fixes.
    </div>
  </Card>

  <Card title="Cmd-K" icon="code" href="/cmdk/overview">
    <div className="text-sm">
      Quick inline code editing and generation. Perfect for making precise
      changes without breaking your flow.
    </div>
  </Card>

  <Card title="Chat" icon="message" href="/chat/overview">
    <div className="text-sm">
      Context-aware AI assistant that understands your codebase. Get answers and
      apply code changes directly in your editor.
    </div>
  </Card>
</CardGroup>

## Where did Cursor come from?

Code is fundamentally text, and our tools for writing it have evolved from simple text editors into increasingly intelligent development environments.

Initially, we had features like syntax highlighting, to make code more readable. Then, we had features like autocomplete, to make code more efficient.

These have been the standard for a long time, but with Cursor, we're re-inventing how you work with code.

## How does it work?

Cursor provides the user with a few fundamental features that are only made possible by the development of LLMs (Large Language Models).

## How do I get started?

You can download Cursor from the [Cursor website](https://www.cursor.com) for your platform of choice. Being based on VS Code, it's extremely easy to get started, and all the AI features are opt-in.

You can also have Cursor import all your VS Code extensions and settings in one-click. To help you try Cursor, we have a 14-day free trial our of Pro plan, with no credit card required!

<CardGroup cols={2}>
  <Card title="Get Started with Installation" icon="download" href="/get-started/installation" />

  <Card title="Setup Your Business" icon="users" href="/account/teams/setup" />
</CardGroup>

## Community and Resources

To help you make the most of Cursor, we have a community of users and resources that you can use to get help and share your own experiences.

<CardGroup cols={2}>
  <Card title="Forum" icon="message" href="https://forum.cursor.com">
    For **technical queries**, and to share your own experiences, please visit our dedicated forum, to talk to **members of the team** and **other Cursor users**.
  </Card>

  <Card title="Support" icon="headset" href="mailto:hi@cursor.com">
    For other queries, including accounts, billing, and sales, please email our support team. **Due to high demand, response times may be slower than the forum.**
  </Card>
</CardGroup>


# Java
Source: https://docs.cursor.com/guides/languages/java

Migrate from JetBrains IDEs to Cursor in minutes

This guide will help you configure Cursor for Java development, including setting up the JDK, installing necessary extensions, debugging, running Java applications, and integrating build tools like Maven and Gradle. It also covers workflow features similar to IntelliJ or VS Code.

<Note>
  Before starting, ensure you have Cursor installed and updated to the latest version.
</Note>

## Setting up Java for Cursor

### Java Installation

Before setting up Cursor itself, you will need Java installed on your machine.

<Warning>
  Cursor does not ship with a Java compiler, so you need to install a JDK if you haven't already.
</Warning>

<CardGroup cols={1}>
  <Card title="Windows Installation" icon="windows">
    Download and install a JDK (e.g., OpenJDK, Oracle JDK, Microsoft Build of OpenJDK).<br />
    Set JAVA\_HOME and add JAVA\_HOME\bin to your PATH.
  </Card>

  <Card title="macOS Installation" icon="apple">
    Install via Homebrew (`brew install openjdk`) or download an installer.<br />
    Ensure JAVA\_HOME points to the installed JDK.
  </Card>

  <Card title="Linux Installation" icon="linux">
    Use your package manager (`sudo apt install openjdk-17-jdk` or equivalent) or install via SDKMAN.
  </Card>
</CardGroup>

To check installation, run:

```bash
java -version
javac -version
```

<Info>
  If Cursor does not detect your JDK, configure it manually in settings.json:
</Info>

```json
{
  "java.jdt.ls.java.home": "/path/to/jdk",
  "java.configuration.runtimes": [
    {
      "name": "JavaSE-17",
      "path": "/path/to/jdk-17",
      "default": true
    }
  ]
}
```

<Warning>
  Restart Cursor to apply changes.
</Warning>

### Cursor Setup

<Info>
  Cursor supports VS Code extensions. Install the following manually:
</Info>

<CardGroup cols={2}>
  <Card title="Extension Pack for Java" icon="java" href="https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack">
    Includes Java language support, debugger, test runner, Maven support, and project manager
  </Card>

  <Card title="Gradle for Java" icon="gears" href="https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-gradle">
    Essential for working with Gradle build system
  </Card>

  <Card title="Spring Boot Extension Pack" icon="leaf" href="https://marketplace.visualstudio.com/items?itemName=Pivotal.vscode-boot-dev-pack">
    Required for Spring Boot development
  </Card>

  <Card title="JavaFX Support" icon="window" href="https://marketplace.visualstudio.com/items?itemName=dlsc-oss.vscode-javafx">
    Necessary for JavaFX application development
  </Card>
</CardGroup>

### Configure Build Tools

#### Maven

Ensure Maven is installed (`mvn -version`). Install from [maven.apache.org](https://maven.apache.org/download.cgi) if needed:

1. Download the binary archive
2. Extract to desired location
3. Set MAVEN\_HOME environment variable to the extracted folder
4. Add %MAVEN\_HOME%\bin (Windows) or \$MAVEN\_HOME/bin (Unix) to PATH

#### Gradle

Ensure Gradle is installed (`gradle -version`). Install from [gradle.org](https://gradle.org/install/) if needed:

1. Download the binary distribution
2. Extract to desired location
3. Set GRADLE\_HOME environment variable to the extracted folder
4. Add %GRADLE\_HOME%\bin (Windows) or \$GRADLE\_HOME/bin (Unix) to PATH

Alternatively, use the Gradle Wrapper which will automatically download and use the correct Gradle version:

## Running and Debugging

Now you are all set up, it's time to run and debug your Java code.
Depending on your needs, you can use the following methods:

<CardGroup cols={2}>
  <Card title="Run" icon="play">
    Click the "Run" link that appears above any main method to quickly execute your program
  </Card>

  <Card title="Debug" icon="bug">
    Open the Run and Debug sidebar panel and use the Run button to start your application
  </Card>
</CardGroup>

<CardGroup cols={1}>
  <Card title="Terminal" icon="terminal">
    Execute from command line using Maven or Gradlecommands
  </Card>

  <Card title="Spring Boot" icon="leaf">
    Launch Spring Boot applications directly from the Spring Boot Dashboard extension
  </Card>
</CardGroup>

## Java x Cursor Workflow

Cursor's AI-powered features can significantly enhance your Java development workflow. Here are some ways to leverage Cursor's capabilities specifically for Java:

<CardGroup cols={2}>
  <Card title="Tab Completion" icon="arrow-right">
    <div className="text-sm">
      Smart completions for methods, signatures, and Java boilerplate like getters/setters.
    </div>
  </Card>

  <Card title="Agent Mode" icon="pen-to-square">
    <div className="text-sm">
      Implement design patterns, refactor code, or generate classes with proper inheritance.
    </div>
  </Card>

  <Card title="Cmd-K" icon="code">
    <div className="text-sm">
      Quick inline edits to methods, fix errors, or generate unit tests without breaking flow.
    </div>
  </Card>

  <Card title="Chat" icon="message">
    <div className="text-sm">
      Get help with Java concepts, debug exceptions, or understand framework features.
    </div>
  </Card>
</CardGroup>

### Example Workflows

1. **Generate Java Boilerplate**\
   Use [Tab completion](/tab/overview) to quickly generate constructors, getters/setters, equals/hashCode methods, and other repetitive Java patterns.

2. **Debug Complex Java Exceptions**\
   When facing a cryptic Java stack trace, highlight it and use [Ask](/chat/overview) to explain the root cause and suggest potential fixes.

3. **Refactor Legacy Java Code**\
   Use [Agent mode](/agent) to modernize older Java code - convert anonymous classes to lambdas, upgrade to newer Java language features, or implement design patterns.

4. **Frameworks Development**\
   Add your documentation to Cursor's context with @docs, and generate framework-specific code throughout Cursor.


# JavaScript & TypeScript
Source: https://docs.cursor.com/guides/languages/javascript

Learn how to setup Cursor for JavaScript & TypeScript

Welcome to JavaScript and TypeScript development in Cursor! The editor provides exceptional support for JS/TS development through its extension ecosystem. Here's what you need to know to get the most out of Cursor.

## Essential Extensions

While Cursor works great with any extensions you prefer, we recommend these for those just getting started:

* **ESLint** - Required for Cursor's AI-powered lint fixing capabilities
* **JavaScript and TypeScript Language Features** - Enhanced language support and IntelliSense
* **Path Intellisense** - Intelligent path completion for file paths

## Cursor Features

Cursor enhances your existing JavaScript/TypeScript workflow with:

* **Tab Completions**: Context-aware code completions that understand your project structure
* **Automatic Imports**: Tab can automatically import libraries as soon as you use them
* **Inline Editing**: Use `CMD+K` on any line to edit with perfect syntax
* **Composer Guidance**: Plan and edit your code across multiple files with the Composer

### Framework Intelligence with @Docs

Cursor's @Docs feature lets you supercharge your JavaScript development by adding custom documentation sources that the AI can reference. Add documentation from MDN, Node.js, or your favorite framework to get more accurate and contextual code suggestions.

<Card title="Learn more about @Docs" icon="book" href="/context/@-symbols/@-docs">
  Discover how to add and manage custom documentation sources in Cursor.
</Card>

### Automatic Linting Resolution

One of Cursor's standout features is its seamless integration with Linter extensions.
Ensure you have a linter, like ESLint, setup, and enable the 'Iterate on Lints' setting.

Then, when using the Agent mode in Composer, once the AI has attempted to answer your query, and has made any code changes, it will automatically read the output of the linter and will attempt to fix any lint errors it might not have known about.

## Framework Support

Cursor works seamlessly with all major JavaScript frameworks and libraries, such as:

### React & Next.js

* Full JSX/TSX support with intelligent component suggestions
* Server component and API route intelligence for Next.js
* Recommended: [**React Developer Tools**](https://marketplace.visualstudio.com/items?itemName=msjsdiag.vscode-react-native) extension

### Vue.js

* Template syntax support with Volar integration
* Component auto-completion and type checking
* Recommended: [**Vue Language Features**](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

### Angular

* Template validation and TypeScript decorator support
* Component and service generation
* Recommended: [**Angular Language Service**](https://marketplace.visualstudio.com/items?itemName=Angular.ng-template)

### Svelte

* Component syntax highlighting and intelligent completions
* Reactive statement and store suggestions
* Recommended: [**Svelte for VS Code**](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode)

### Backend Frameworks (Express/NestJS)

* Route and middleware intelligence
* TypeScript decorator support for NestJS
* API testing tools integration

Remember, Cursor's AI features work well with all these frameworks, understanding their patterns and best practices to provide relevant suggestions. The AI can help with everything from component creation to complex refactoring tasks, while respecting your project's existing patterns.


# Python
Source: https://docs.cursor.com/guides/languages/python

A comprehensive guide to setting up the perfect Python development environment in Cursor

<Note>This guide was heavily inspired by [Jack Fields](https://x.com/OrdinaryInds) and his [article](https://medium.com/ordinaryindustries/the-ultimate-vs-code-setup-for-python-538026b34d94) about setting up VS Code for Python development. Please check his article for more details.</Note>

## Prerequisites

Before we begin, ensure you have:

* [Python](https://python.org) installed (3.8 or higher recommended)
* [Git](https://git-scm.com/) for version control
* Cursor installed and updated to the latest version

## Essential Extensions

### Core Python Support

The following extensions setup Cursor to be fully featured for Python development. These provide you with syntax highlighting, linting, debugging and unit testing.

<CardGroup cols={2}>
  <Card title="Python" icon="python" href="https://marketplace.visualstudio.com/items?itemName=ms-python.python">
    Core language support from Microsoft
  </Card>

  <Card title="Pylance" icon="bolt" href="https://marketplace.visualstudio.com/items?itemName=ms-python.vscode-pylance">
    Fast Python language server
  </Card>

  <Card title="Python Debugger" icon="bug" href="https://marketplace.visualstudio.com/items?itemName=ms-python.debugpy">
    Enhanced debugging capabilities
  </Card>

  <Card title="Python Test Explorer" icon="vial" href="https://marketplace.visualstudio.com/items?itemName=LittleFoxTeam.vscode-python-test-adapter">
    Visual testing interface
  </Card>
</CardGroup>

### Code Quality Tools

<CardGroup cols={2}>
  <Card title="Python Docstring Generator" icon="file-lines" href="https://marketplace.visualstudio.com/items?itemName=njpwerner.autodocstring">
    Automatic documentation generation
  </Card>

  <Card title="Python Path" icon="folder-tree" href="https://marketplace.visualstudio.com/items?itemName=mgesbert.python-path">
    Manage Python paths
  </Card>

  <Card title="Python Environment Manager" icon="gears" href="https://marketplace.visualstudio.com/items?itemName=ms-python.vscode-python-envs">
    Virtual environment management
  </Card>

  <Card title="Python Snippets" icon="code" href="https://marketplace.visualstudio.com/items?itemName=EricSia.pythonsnippets3">
    Code snippets for Python
  </Card>
</CardGroup>

### Advanced Python Tooling

While the above extensions have previously been the most popular extensions for Python development in Cursor, we've also added some additional extensions that can help you get the most out of your Python development.

#### `uv` - Python Environment Manager

[uv](https://github.com/astral-sh/uv) is a modern Python package manager that can be used to create and manage virtual environments, in addition to replacing pip as the default package manager.

To install uv, run the following command in your terminal:

```bash
pip install uv
```

#### `ruff` - Python Linter and Formatter

[Ruff](https://docs.astral.sh/ruff/) is a modern Python linter and formatter that can be used to check for programming errors, helps enforce coding standards, and can suggest refactoring. It can be used alongside Black for code formatting.

To install Ruff, run the following command in your terminal:

```bash
pip install ruff
```

## Cursor Configuration

### 1. Python Interpreter

Configure your Python interpreter in Cursor:

1. Open Command Palette (Cmd/Ctrl + Shift + P)
2. Search for "Python: Select Interpreter"
3. Choose your Python interpreter (or virtual environment if you're using one)

### 2. Code Formatting

Set up automatic code formatting with Black:

<Note>Black is a code formatter that automatically formats your code to follow a consistent style. It requires zero configuration and is widely adopted in the Python community.</Note>

To install Black, run the following command in your terminal:

```bash
pip install black
```

Then, configure Cursor to use Black for code formatting, by adding the following to your `settings.json` file:

```json
{
    "python.formatting.provider": "black",
    "editor.formatOnSave": true,
    "python.formatting.blackArgs": [
        "--line-length",
        "88"
    ]
}
```

### 3. Linting

We can use PyLint to check for programming errors, helps enforce coding standards, and can suggest refactoring.

To install PyLint, run the following command in your terminal:

```bash
pip install pylint
```

```json
{
    "python.linting.enabled": true,
    "python.linting.pylintEnabled": true,
    "python.linting.lintOnSave": true
}
```

### 4. Type Checking

In addition to linting, we can use MyPy to check for type errors.

To install MyPy, run the following command in your terminal:

```bash
pip install mypy
```

```json
{
    "python.linting.mypyEnabled": true
}
```

## Debugging

Cursor provides powerful debugging capabilities for Python:

1. Set breakpoints by clicking the gutter
2. Use the Debug panel (Cmd/Ctrl + Shift + D)
3. Configure `launch.json` for custom debug configurations

## Recommended Features

<CardGroup cols={3}>
  <Card title="Tab Completion" icon="wand-magic-sparkles" href="/tab/overview">
    Intelligent code suggestions that understand your actions
  </Card>

  <Card title="Chat" icon="comments" href="/chat/overview">
    Explore and understand code through natural conversations
  </Card>

  <Card title="Agent" icon="robot" href="/agent">
    Handle complex development tasks with AI assistance
  </Card>

  <Card title="Context" icon="network-wired" href="/context/model-context-protocol">
    Pull in context from 3rd party systems
  </Card>

  <Card title="Auto-Imports" icon="file-import" href="/tab/auto-import">
    Automatically import modules as you code
  </Card>

  <Card title="AI Review" icon="check-double" href="/tab/overview#quality">
    Cursor constantly reviews your code with AI
  </Card>
</CardGroup>

## Framework Support

Cursor works seamlessly with popular Python frameworks:

* **Web Frameworks**: Django, Flask, FastAPI
* **Data Science**: Jupyter, NumPy, Pandas
* **Machine Learning**: TensorFlow, PyTorch, scikit-learn
* **Testing**: pytest, unittest
* **API**: requests, aiohttp
* **Database**: SQLAlchemy, psycopg2


# iOS & macOS (Swift)
Source: https://docs.cursor.com/guides/languages/swift

Learn how to setup Cursor for Swift

Welcome to Swift development in Cursor! Whether you're building iOS apps, macOS applications, or server-side Swift projects, we've got you covered. This guide will help you set up your Swift environment in Cursor, starting with the basics and moving on to more advanced features.

## Basic Workflow

The simplest way to use Cursor with Swift is to treat it as your primary code editor while still relying on Xcode for building and running your apps. You'll get great features like:

* Smart code completion
* AI-powered coding assistance (try [CMD+K](/cmdk/overview) on any line)
* Quick access to documentation with [@Docs](/context/@-symbols/@-docs)
* Syntax highlighting
* Basic code navigation

When you need to build or run your app, simply switch to Xcode. This workflow is perfect for developers who want to leverage Cursor's AI capabilities while sticking to familiar Xcode tools for debugging and deployment.

### Hot Reloading

When using Xcode workspaces or projects (instead of opening a folder directly in Xcode), Xcode can often ignore changes to your files that were made in Cursor, or outside of Xcode in general.

While you can open the folder in Xcode to resolve this, you may need to use a project for your Swift development workflow.

A great solution to this is to use [Inject](https://github.com/krzysztofzablocki/Inject), a hot reloading library for Swift that allows your app to "hot reload" and update as soon as changes are made in real time. This does not suffer from the side effects of the Xcode workspace/project issue, and allows you to make changes in Cursor and have them reflected in your app immediately.

<CardGroup cols={1}>
  <Card title="Inject - Hot Reloading for Swift" horizontal icon="fire" href="https://github.com/krzysztofzablocki/Inject">
    Learn more about Inject and how to use it in your Swift projects.
  </Card>
</CardGroup>

## Advanced Swift Development

<Note>This section of the guide was heavily inspired by [Thomas Ricouard](https://x.com/Dimillian) and his [article](https://dimillian.medium.com/how-to-use-cursor-for-ios-development-54b912c23941) about using Cursor for iOS development. Please check his article for more details and drop him a follow for more Swift content.</Note>

If you are looking to only need one editor open at a time, and want to avoid the need to switch between Xcode and Cursor, you can use an extension like [Sweetpad](https://sweetpad.hyzyla.dev/) to integrate Cursor directly with Xcode's underlying build system.

Sweetpad is a powerful extension that allows you to build, run and debug your Swift projects directly in Cursor, without compromising on Xcode's features.

To get started with Sweetpad, you'll still need to have Xcode installed on your Mac - it's the foundation of Swift development. You can download Xcode from the [Mac App Store](https://apps.apple.com/us/app/xcode/id497799835). Once you have Xcode set up, let's enhance your development experience in Cursor with a few essential tools.

Open your terminal and run:

```bash
# Builds your projects without needing Xcode open
brew install xcode-build-server

# Pretty print's the `xcodebuild` command output into Cursor's terminal
brew install xcbeautify

# Allows for advanced formating and language features
brew install swiftformat
```

Next, install the [Swift Language Support](https://marketplace.visualstudio.com/items?itemName=sswg.swift-lang) extension in Cursor. This will give you syntax highlighting and basic language features right out of the box.

Then, we can install the [Sweetpad](https://sweetpad.hyzyla.dev/) extension to integrate Cursor with Xcode. Sweetpad wraps a bunch of shortcuts around the `xcodebuild` CLI (and much more), and allows you to scan your targets, select the destination, build, and run your app just like Xcode. On top of that, it'll set up your project for Xcode Build Server so you get all the features mentioned above.

### Sweetpad Usage

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

/**
 * Enhanced logging system for LLMS generator
 * @param {string} level - Log level (info, warn, error, debug)
 * @param {string} message - Message to log
 * @param {Object} [data] - Optional data to include in log
 */
async function logActivity(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(data ? { data } : {})
  };
  
  // Console output for immediate visibility
  const logColors = {
    info: '\x1b[32m', // green
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
    debug: '\x1b[36m'  // cyan
  };
  
  const resetColor = '\x1b[0m';
  console.log(`${logColors[level] || ''}[${timestamp}][${level.toUpperCase()}] ${message}${resetColor}`);
  
  if (data) {
    console.log(data);
  }
  
  try {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, '../../logs');
    await fs.mkdir(logsDir, { recursive: true });
    
    // Write to file based on date
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `llms-generator-${today}.log`);
    
    // Append to log file
    await fs.appendFile(
      logFile, 
      JSON.stringify(logEntry) + '\n',
      'utf8'
    );
  } catch (err) {
    console.error('Error writing to log file:', err);
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
    maxOutputTokens: 8000,
    topP: 0.9,
    topK: 40
  };
  
  const advancedConfig = {
    temperature: 0.2,
    maxOutputTokens: 30000,  // Much larger for comprehensive outputs
    topP: 0.95,
    topK: 40
  };
  
  // Use Pro model for advanced tasks (like LLMS-full.txt generation)
  if (modelType === 'advanced') {
    return genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: advancedConfig
    });
  }
  
  // Use standard model for regular tasks (like LLMS.txt generation)
  return genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    generationConfig: standardConfig
  });
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
  await logActivity('info', 'Starting LLMS.txt generation', { 
    companyName, websiteUrl, email 
  });
  
  try {
    // Validate and normalize URL
    const normalizedUrl = urlUtils.normalizeUrl(websiteUrl);
    await logActivity('debug', 'Normalized URL for crawling', { 
      original: websiteUrl, normalized: normalizedUrl 
    });
    
    // Crawl website to extract content
    await logActivity('info', 'Beginning website crawl');
    const pages = await crawlWebsite(normalizedUrl);
    await logActivity('info', 'Website crawl completed', { 
      pagesCount: pages.length 
    });
    
    // Generate content with AI
    await logActivity('info', 'Generating LLMS.txt content with AI');
    const llmsContent = await generateLLMSContent(pages, companyName, companyDescription);
    await logActivity('info', 'LLMS.txt content generation completed', { 
      contentLength: llmsContent.length 
    });
    
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
    const pages = await crawlWebsiteDeep(normalizedUrl);
    await logActivity('info', 'Deep website crawl completed', { 
      pagesCount: pages.length 
    });
    
    // Generate enhanced content with AI
    await logActivity('info', 'Generating comprehensive LLMS-full.txt content with AI');
    const llmsFullContent = await generateLLMSFullContent(pages, companyName, companyDescription);
    await logActivity('info', 'LLMS-full.txt content generation completed', { 
      contentLength: llmsFullContent.length 
    });
    
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
 * Crawl website to extract important pages
 * @param {string} websiteUrl - URL of the website to crawl
 * @returns {Promise<Array>} - Array of page objects with title, url, and content
 */
async function crawlWebsite(websiteUrl) {
  const browser = await playwright.chromium.launch({
    headless: true,
    timeout: 60000 // Increase timeout to 1 minute
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await logActivity('info', `Beginning website crawl for ${websiteUrl}`);
    await page.goto(websiteUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 // Keep 30 seconds timeout for page load
    });
    
    // Wait a bit extra for any JavaScript to execute
    await page.waitForTimeout(3000);
    
    await logActivity('info', `Successfully loaded main page: ${websiteUrl}`);
    
    // Extract links from the main page
    const links = await page.evaluate(() => {
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
          
          // For privacy/terms pages, inspect parent elements for context
          if (!text && (a.href.includes('privacy') || a.href.includes('terms'))) {
            const parentText = a.closest('li, div, p')?.textContent.trim();
            if (parentText && parentText.length < 100) {
              text = parentText;
            }
          }
          
          return { 
            url: a.href, 
            text: text
          };
        })
        .filter(link => 
          link.url && 
          link.text && 
          link.text.length > 0 && 
          link.url.startsWith(window.location.origin)
        );
    });
    
    if (links.length === 0) {
      await logActivity('warn', `No links found on the main page: ${websiteUrl}`);
    } else {
      await logActivity('info', `Found ${links.length} links on the main page`);
    }
    
    // Filter and prioritize important pages
    const importantLinks = prioritizeLinks(links, websiteUrl);
    await logActivity('info', `Prioritized ${importantLinks.length} links for crawling`);
    
    // Limit to top 50 most important pages to keep processing time reasonable
    const pagesToVisit = importantLinks.slice(0, 50);
    await logActivity('info', `Will visit top ${pagesToVisit.length} prioritized pages`);
    
    // Visit each page and extract content
    const pages = [];
    let visitedCount = 0;
    let successCount = 0;
    
    for (const linkObj of pagesToVisit) {
      visitedCount++;
      
      try {
        await logActivity('debug', `Visiting page ${visitedCount}/${pagesToVisit.length}: ${linkObj.url}`);
        await page.goto(linkObj.url, { 
          waitUntil: 'domcontentloaded',
          timeout: 15000 // 15 seconds timeout for each subpage
        });
        
        // Extract page title and main content
        const pageData = await page.evaluate(() => {
          // Get page title
          const title = document.title;
          
          // Get main content (prioritize main, article, or content divs)
          let mainContent = '';
          const mainElement = document.querySelector('main') || 
                            document.querySelector('article') || 
                            document.querySelector('.content') ||
                            document.querySelector('#content') ||
                            document.body;
          
          if (mainElement) {
            // Strip out scripts, styles, and hidden elements
            const elementsToExclude = mainElement.querySelectorAll('script, style, [style*="display: none"], [style*="display:none"]');
            elementsToExclude.forEach(el => {
              if (el.parentNode) {
                el.parentNode.removeChild(el);
              }
            });
            
            mainContent = mainElement.textContent.trim().replace(/\s+/g, ' ');
          }
          
          return {
            title,
            content: mainContent,
          };
        });
        
        // Add the page to our results if it has content
        if (pageData.content && pageData.content.length > 100) {
          pages.push({
            title: pageData.title,
            url: linkObj.url,
            content: pageData.content.substring(0, 5000) // Limit content size
          });
          successCount++;
          await logActivity('debug', `Successfully extracted content from: ${linkObj.url}`, {
            titleLength: pageData.title.length,
            contentLength: pageData.content.length
          });
        } else {
          await logActivity('warn', `Page had insufficient content: ${linkObj.url}`);
        }
      } catch (error) {
        await logActivity('error', `Error visiting page ${linkObj.url}:`, {
          errorMessage: error.message
        });
        // Continue with next page
        continue;
      }
    }
    
    await logActivity('info', `Website crawl completed. Visited ${visitedCount} pages, successfully extracted ${successCount} pages`);
    return pages;
  } finally {
    await browser.close();
  }
}

/**
 * Perform a deeper crawl of the website for LLMS-full.txt
 * @param {string} websiteUrl - URL of the website to crawl
 * @returns {Promise<Array>} - Array of page objects with title, url, and content
 */
async function crawlWebsiteDeep(websiteUrl) {
  // Similar to crawlWebsite but with more pages and deeper content extraction
  const browser = await playwright.chromium.launch({
    headless: true,
    timeout: 180000 // 3 minutes timeout for the entire operation
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();
  
  try {
    await logActivity('info', `Beginning deep website crawl for ${websiteUrl}`);
    await page.goto(websiteUrl, { 
      waitUntil: 'networkidle',
      timeout: 45000 // 45 seconds timeout for main page load
    });
    
    await logActivity('info', `Successfully loaded main page for deep crawl: ${websiteUrl}`);
    
    // Wait for dynamic content to load
    await page.waitForTimeout(3000);
    
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
          
          // For privacy/terms pages, inspect parent elements for context
          if (!text && (a.href.includes('privacy') || a.href.includes('terms'))) {
            const parentText = a.closest('li, div, p')?.textContent.trim();
            if (parentText && parentText.length < 100) {
              text = parentText;
            }
          }
          
          return { 
            url: a.href, 
            text: text
          };
        })
        .filter(link => 
          link.url && 
          link.text && 
          link.text.length > 0 && 
          link.url.startsWith(window.location.origin)
        );
    });
    
    // Get all unique links
    links = [...new Map(links.map(link => [link.url, link])).values()];
    await logActivity('info', `Found ${links.length} unique links on the main page`);
    
    // Look for navigation elements specifically - these often contain important links
    const navLinks = await page.evaluate(() => {
      const navSelectors = [
        'nav a', 'header a', '.nav a', '.navigation a', '.menu a', 
        '.navbar a', '.header a', '.top-menu a', '.main-menu a',
        '.global-nav a', '.primary-nav a', '.site-header a', '.site-nav a'
      ];
      
      const navLinks = Array.from(document.querySelectorAll(navSelectors.join(', ')));
      return navLinks
        .map(a => {
          return { 
            url: a.href, 
            text: a.textContent.trim() || a.getAttribute('title') || a.getAttribute('aria-label') || 'Navigation Link'
          };
        })
        .filter(link => 
          link.url && 
          link.text && 
          link.url.startsWith(window.location.origin)
        );
    });
    
    await logActivity('info', `Found ${navLinks.length} navigation menu links`);
    
    // Add nav links to our collection
    for (const navLink of navLinks) {
      if (!links.some(link => link.url === navLink.url)) {
        links.push(navLink);
      }
    }
    
    // Now visit additional key pages if they aren't in the links yet
    const baseUrl = new URL(websiteUrl);
    const keyPaths = [
      '/about', '/about-us', '/company', 
      '/products', '/services', '/features',
      '/pricing', '/plans',
      '/docs', '/documentation', '/developers',
      '/api', '/developers/api',
      '/blog', '/news',
      '/contact', '/support',
      '/privacy', '/privacy-policy',
      '/terms', '/terms-of-service',
      '/legal', '/license',
      '/download', '/downloads',
      '/help', '/faq',
      '/team', '/careers'
    ];
    
    // Add potential key pages to our link list
    let keyPagesAdded = 0;
    for (const path of keyPaths) {
      const potentialUrl = new URL(path, baseUrl).toString();
      if (!links.some(link => link.url === potentialUrl)) {
        links.push({ url: potentialUrl, text: path.replace('/', '') });
        keyPagesAdded++;
      }
    }
    await logActivity('info', `Added ${keyPagesAdded} key pages to crawl list`);
    
    // ENHANCED: Look for documentation pages specifically
    const docLinks = links.filter(link => {
      const url = link.url.toLowerCase();
      return isDocumentationPage(url);
    });
    await logActivity('info', `Found ${docLinks.length} potential documentation links`);
    
    // We will visit more pages and do a deeper crawl
    const allVisitedUrls = new Set();
    const allQueuedUrls = new Set(links.map(link => link.url)); // Track URLs we've already queued
    const pages = [];
    
    // First prioritize and visit main navigation links
    const mainPagesToVisit = prioritizeLinks(links, websiteUrl).slice(0, 150); // Up from 60
    await logActivity('info', `Will visit top ${mainPagesToVisit.length} prioritized main pages`);
    
    let mainPagesVisited = 0;
    let mainPagesSuccessful = 0;
    let totalLinksFound = links.length;
    
    for (const linkObj of mainPagesToVisit) {
      if (allVisitedUrls.has(linkObj.url)) {
        await logActivity('debug', `Skipping already visited page: ${linkObj.url}`);
        continue;
      }
      
      mainPagesVisited++;
      
      try {
        await logActivity('debug', `Visiting main page ${mainPagesVisited}/${mainPagesToVisit.length}: ${linkObj.url}`);
        await page.goto(linkObj.url, { 
          waitUntil: 'networkidle',
          timeout: 20000 // 20 seconds timeout for each subpage
        });
        
        // Mark as visited
        allVisitedUrls.add(linkObj.url);
        
        // Wait for dynamic content
        await page.waitForTimeout(1000);
        
        // Extract page data
        const pageData = await extractPageDetails(page);
        
        if (pageData.content && pageData.content.length > 150) {
          // Format headings for better usability
          const formattedHeadings = [];
          if (pageData.headings.h1 && pageData.headings.h1.length > 0) {
            formattedHeadings.push(...pageData.headings.h1);
          }
          if (pageData.headings.h2 && pageData.headings.h2.length > 0) {
            formattedHeadings.push(...pageData.headings.h2.slice(0, 10)); // Top 10 h2 headings
          }
          
          pages.push({
            title: pageData.title,
            url: linkObj.url,
            metaDescription: pageData.metaDescription,
            headings: formattedHeadings,
            links: pageData.pageLinks,
            content: pageData.content.substring(0, 10000) // Increased from 8000
          });
          
          mainPagesSuccessful++;
          await logActivity('debug', `Successfully extracted content from main page: ${linkObj.url}`, {
            titleLength: pageData.title.length,
            contentLength: pageData.content.length,
            headingsCount: formattedHeadings.length
          });
          
          // IMPORTANT: Process all links from this page to discover more content
          if (pageData.pageLinks && pageData.pageLinks.length > 0) {
            let newLinksAdded = 0;
            
            for (const pageLink of pageData.pageLinks) {
              // Only add links we haven't seen before
              if (!allQueuedUrls.has(pageLink.url)) {
                links.push(pageLink);
                allQueuedUrls.add(pageLink.url);
                newLinksAdded++;
              }
            }
            
            totalLinksFound += newLinksAdded;
            await logActivity('info', `Found ${newLinksAdded} new links on ${linkObj.url}, total links: ${totalLinksFound}`);
          }
          
          // For documentation pages, collect their links for recursive crawling
          if (isDocumentationPage(linkObj.url)) {
            await logActivity('info', `Found documentation page: ${linkObj.url}`);
            
            // Try to find more documentation-specific links
            const docSpecificLinks = await page.evaluate(() => {
              // Look specifically in documentation navigation, sidebars, etc.
              const docNavSelectors = [
                '.docs-nav a', '.docs-sidebar a', '.documentation-nav a',
                '.doc-nav a', '.api-nav a', '.sidebar-nav a',
                '.toc a', '.table-of-contents a', '.sidebar a'
              ];
              
              const docNavLinks = Array.from(document.querySelectorAll(docNavSelectors.join(', ')));
              return docNavLinks
                .map(a => {
                  return { 
                    url: a.href, 
                    text: a.textContent.trim() || a.getAttribute('title') || 'Documentation Link'
                  };
                })
                .filter(link => 
                  link.url && 
                  link.text && 
                  link.url.startsWith(window.location.origin)
                );
            });
            
            let newDocLinks = 0;
            // Add unique sublinks to our collection
            for (const docLink of docSpecificLinks) {
              if (!allQueuedUrls.has(docLink.url)) {
                links.push(docLink);
                allQueuedUrls.add(docLink.url);
                newDocLinks++;
                
                // Also add to docLinks collection
                if (!docLinks.some(link => link.url === docLink.url)) {
                  docLinks.push(docLink);
                }
              }
            }
            
            await logActivity('info', `Added ${newDocLinks} new documentation-specific links from ${linkObj.url}`);
          }
        } else {
          await logActivity('warn', `Main page had insufficient content: ${linkObj.url}`);
        }
      } catch (error) {
        await logActivity('error', `Error visiting main page ${linkObj.url}:`, {
          errorMessage: error.message
        });
        // Continue with next page
      }
    }
    
    await logActivity('info', `Completed main pages crawl. Visited ${mainPagesVisited}, extracted ${mainPagesSuccessful}, total links found: ${totalLinksFound}`);
    
    // Check if there's a main documentation index page
    const docIndexPages = docLinks.filter(link => {
      const url = link.url.toLowerCase();
      return url.endsWith('/docs') || 
             url.endsWith('/docs/') ||
             url.endsWith('/documentation') ||
             url.endsWith('/documentation/') ||
             url.includes('/docs/index') ||
             url.includes('/documentation/index') ||
             url === baseUrl.origin + '/api' ||
             url === baseUrl.origin + '/api/' ||
             url === baseUrl.origin + '/developer' ||
             url === baseUrl.origin + '/developer/';
    });
    
    await logActivity('info', `Found ${docIndexPages.length} documentation index pages to process first`);

    // Process documentation index pages first and with higher limits
    for (const indexPage of docIndexPages) {
      if (allVisitedUrls.has(indexPage.url)) {
        await logActivity('debug', `Skipping already visited doc index page: ${indexPage.url}`);
        continue;
      }
      
      try {
        await logActivity('info', `Processing documentation index page: ${indexPage.url}`);
        await page.goto(indexPage.url, { 
          waitUntil: 'networkidle',
          timeout: 30000 // Longer timeout for index pages
        });
        
        // Mark as visited
        allVisitedUrls.add(indexPage.url);
        
        // Get ALL links from index pages
        const indexLinks = await page.evaluate(() => {
          // Get ALL links on the page
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
              link.text.length > 1 && 
              link.url.startsWith(window.location.origin)
            );
        });
        
        await logActivity('info', `Found ${indexLinks.length} links on documentation index page: ${indexPage.url}`);
        
        // Add all these links to our docLinks collection
        let newDocLinks = 0;
        for (const indexLink of indexLinks) {
          if (!allQueuedUrls.has(indexLink.url)) {
            links.push(indexLink);
            allQueuedUrls.add(indexLink.url);
            newDocLinks++;
            
            // Also add to docLinks collection
            if (!docLinks.some(link => link.url === indexLink.url)) {
              docLinks.push(indexLink);
            }
          }
        }
        await logActivity('info', `Added ${newDocLinks} new links from documentation index page`);
        totalLinksFound += newDocLinks;
      } catch (error) {
        await logActivity('error', `Error processing documentation index page ${indexPage.url}:`, {
          errorMessage: error.message
        });
      }
    }
    
    // ENHANCED: Now specifically target documentation pages with deeper crawling
    // Re-prioritize docLinks with any new ones we found
    const docPagesToVisit = prioritizeLinks(docLinks, websiteUrl).slice(0, 300); // Up from 150
    await logActivity('info', `Will visit ${docPagesToVisit.length} documentation pages for deeper crawl`);
    
    let docPagesVisited = 0;
    let docPagesSuccessful = 0;
    
    for (const docLink of docPagesToVisit) {
      if (allVisitedUrls.has(docLink.url)) {
        await logActivity('debug', `Skipping already visited documentation page: ${docLink.url}`);
        continue;
      }
      
      docPagesVisited++;
      
      try {
        await logActivity('debug', `Visiting documentation page ${docPagesVisited}/${docPagesToVisit.length}: ${docLink.url}`);
        await page.goto(docLink.url, { 
          waitUntil: 'networkidle',
          timeout: 20000 
        });
        
        // Mark as visited
        allVisitedUrls.add(docLink.url);
        
        // Wait for dynamic content
        await page.waitForTimeout(1000);
        
        // Extract documentation-specific details
        const pageData = await extractPageDetails(page);
        
        if (pageData.content && pageData.content.length > 150) {
          // For documentation pages, collect more headings and structure
          const formattedHeadings = [];
          if (pageData.headings.h1 && pageData.headings.h1.length > 0) {
            formattedHeadings.push(...pageData.headings.h1);
          }
          if (pageData.headings.h2 && pageData.headings.h2.length > 0) {
            formattedHeadings.push(...pageData.headings.h2);
          }
          if (pageData.headings.h3 && pageData.headings.h3.length > 0) {
            formattedHeadings.push(...pageData.headings.h3.slice(0, 10));
          }
          
          pages.push({
            title: pageData.title,
            url: docLink.url,
            metaDescription: pageData.metaDescription,
            headings: formattedHeadings,
            links: pageData.pageLinks,
            content: pageData.content.substring(0, 10000), // Increased from 8000
            isDocumentation: true
          });
          
          docPagesSuccessful++;
          await logActivity('debug', `Successfully extracted content from documentation page: ${docLink.url}`, {
            titleLength: pageData.title.length,
            contentLength: pageData.content.length,
            headingsCount: formattedHeadings.length
          });
          
          // IMPORTANT: Also collect links from documentation pages to find more doc pages
          if (pageData.pageLinks && pageData.pageLinks.length > 0) {
            let newDocLinksAdded = 0;
            
            for (const pageLink of pageData.pageLinks) {
              // Only add links we haven't seen before
              if (!allQueuedUrls.has(pageLink.url)) {
                links.push(pageLink);
                allQueuedUrls.add(pageLink.url);
                newDocLinksAdded++;
                
                // If it looks like a doc link, add to docLinks collection for later processing
                if (isDocumentationPage(pageLink.url) && !docLinks.some(link => link.url === pageLink.url)) {
                  docLinks.push(pageLink);
                }
              }
            }
            
            if (newDocLinksAdded > 0) {
              totalLinksFound += newDocLinksAdded;
              await logActivity('info', `Found ${newDocLinksAdded} new links on doc page ${docLink.url}, total: ${totalLinksFound}`);
            }
          }
        } else {
          await logActivity('warn', `Documentation page had insufficient content: ${docLink.url}`);
        }
      } catch (error) {
        await logActivity('error', `Error visiting documentation page ${docLink.url}:`, {
          errorMessage: error.message
        });
      }
    }
    
    // At this point, we might have discovered many more links
    // Let's process a third batch focusing on any important pages we missed
    
    // Get all unvisited links
    const remainingLinks = links.filter(link => !allVisitedUrls.has(link.url));
    await logActivity('info', `Have ${remainingLinks.length} unvisited links remaining`);
    
    // Prioritize them
    const additionalPagesToVisit = prioritizeLinks(remainingLinks, websiteUrl).slice(0, 200);
    await logActivity('info', `Will visit up to ${additionalPagesToVisit.length} additional high-priority pages`);
    
    let additionalPagesVisited = 0;
    let additionalPagesSuccessful = 0;
    
    for (const linkObj of additionalPagesToVisit) {
      if (allVisitedUrls.has(linkObj.url)) {
        continue;
      }
      
      additionalPagesVisited++;
      
      try {
        await logActivity('debug', `Visiting additional page ${additionalPagesVisited}/${additionalPagesToVisit.length}: ${linkObj.url}`);
        await page.goto(linkObj.url, { 
          waitUntil: 'networkidle',
          timeout: 20000 
        });
        
        // Mark as visited
        allVisitedUrls.add(linkObj.url);
        
        // Extract page data
        const pageData = await extractPageDetails(page);
        
        if (pageData.content && pageData.content.length > 150) {
          const formattedHeadings = [];
          if (pageData.headings.h1 && pageData.headings.h1.length > 0) {
            formattedHeadings.push(...pageData.headings.h1);
          }
          if (pageData.headings.h2 && pageData.headings.h2.length > 0) {
            formattedHeadings.push(...pageData.headings.h2.slice(0, 10));
          }
          
          pages.push({
            title: pageData.title,
            url: linkObj.url,
            metaDescription: pageData.metaDescription,
            headings: formattedHeadings,
            content: pageData.content.substring(0, 10000),
            isDocumentation: isDocumentationPage(linkObj.url)
          });
          
          additionalPagesSuccessful++;
          await logActivity('debug', `Successfully extracted content from additional page: ${linkObj.url}`, {
            titleLength: pageData.title.length,
            contentLength: pageData.content.length
          });
        }
      } catch (error) {
        await logActivity('error', `Error visiting additional page ${linkObj.url}:`, {
          errorMessage: error.message
        });
      }
    }
    
    await logActivity('info', `Deep website crawl completed.`, { 
      totalPagesExtracted: pages.length,
      uniqueUrlsVisited: allVisitedUrls.size,
      totalLinksDiscovered: totalLinksFound,
      mainPhasePagesVisited: mainPagesVisited,
      mainPhasePagesSuccessful: mainPagesSuccessful,
      docPhasePagesVisited: docPagesVisited,
      docPhasePagesSuccessful: docPagesSuccessful,
      additionalPhasePagesVisited: additionalPagesVisited,
      additionalPhasePagesSuccessful: additionalPagesSuccessful
    });
    
    return pages;
  } finally {
    await browser.close();
  }
}

// HELPER FUNCTIONS FOR ENHANCED CRAWLING

/**
 * Check if a URL is likely a documentation page
 * @param {string} url - URL to check
 * @returns {boolean} - True if likely a documentation page
 */
function isDocumentationPage(url) {
  const lowerUrl = url.toLowerCase();
  
  // Add more documentation keywords
  return lowerUrl.includes('/docs') || 
         lowerUrl.includes('/documentation') || 
         lowerUrl.includes('/guide') || 
         lowerUrl.includes('/guides') ||
         lowerUrl.includes('/developer') ||
         lowerUrl.includes('/api') ||
         lowerUrl.includes('/reference') ||
         lowerUrl.includes('/getting-started') ||
         lowerUrl.includes('/tutorials') ||
         lowerUrl.includes('/help') ||
         lowerUrl.includes('/manual') ||
         lowerUrl.includes('/learn') ||
         lowerUrl.includes('/knowledge') ||
         // Check for documentation-style paths
         /\/docs\/[\w-]+\/[\w-]+/.test(lowerUrl);
}

/**
 * Extract detailed page information using page evaluation
 * @param {Object} page - Playwright page object
 * @returns {Promise<Object>} - Page details
 */
async function extractPageDetails(page) {
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
    
    // Get all link texts in the page
    const pageLinks = Array.from(document.querySelectorAll('a'))
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
        
        // For privacy/terms pages, inspect parent elements for context
        if (!text && (a.href.includes('privacy') || a.href.includes('terms'))) {
          const parentText = a.closest('li, div, p')?.textContent.trim();
          if (parentText && parentText.length < 100) {
            text = parentText;
          }
        }
        
        return {
          text: text,
          url: a.href
        };
      })
      .filter(link => 
        link.text && 
        link.text.length > 1 && 
        link.url && 
        link.url.startsWith(window.location.origin)
      )
      .slice(0, 30); // Increased from 20 to 30 links per page
    
    // Extract main content with more detail
    let content = '';
    const contentSelectors = [
      'main', 'article', '#content', '.content', '[role="main"]',
      '.main-content', '#main-content', '.article', '.post', '.page-content',
      '.docs-content', '.documentation', '.markdown-body', '.docs-body'
    ];
    
    // Try each potential content container
    let mainElement = null;
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element && element.innerText.length > 150) {
        mainElement = element;
        break;
      }
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
 * @returns {Array} - Prioritized array of link objects
 */
function prioritizeLinks(links, websiteUrl) {
  // Filter out external links, anchors, etc.
  const filteredLinks = links.filter(link => {
    const url = new URL(link.url);
    const baseUrl = new URL(websiteUrl);
    
    // Keep only links from the same domain
    return url.hostname === baseUrl.hostname &&
           // Filter out common non-content pages
           !url.pathname.includes('/wp-admin/') &&
           !url.pathname.includes('/wp-login.php') &&
           !url.pathname.endsWith('.jpg') &&
           !url.pathname.endsWith('.png') &&
           !url.pathname.endsWith('.gif') &&
           !url.pathname.endsWith('.pdf') &&
           // Filter out anchor links
           !link.url.includes('#') &&
           // Filter out duplicate links
           links.findIndex(l => l.url === link.url) === links.indexOf(link);
  });
  
  // Score and sort links by importance
  const scoredLinks = filteredLinks.map(link => {
    let score = 0;
    const lowerText = link.text.toLowerCase();
    const lowerUrl = link.url.toLowerCase();
    
    // Prioritize important pages
    if (lowerUrl.includes('/about') || lowerText.includes('about')) score += 10;
    if (lowerUrl.includes('/product') || lowerText.includes('product')) score += 8;
    if (lowerUrl.includes('/service') || lowerText.includes('service')) score += 8;
    if (lowerUrl.includes('/feature') || lowerText.includes('feature')) score += 7;
    
    // Give higher scores to documentation pages
    if (lowerUrl.includes('/api') || lowerText.includes('api')) score += 12;
    if (lowerUrl.includes('/docs') || lowerText.includes('documentation')) score += 12;
    
    // Other standard pages
    if (lowerUrl.includes('/pricing') || lowerText.includes('pricing')) score += 6;
    if (lowerUrl.includes('/contact') || lowerText.includes('contact')) score += 5;
    if (lowerUrl.includes('/blog') || lowerText.includes('blog')) score += 4;
    
    // Only penalize depth for non-documentation pages
    const pathSegments = new URL(link.url).pathname.split('/').filter(Boolean);
    const isDocPage = isDocumentationPage(link.url);
    
    // Don't penalize documentation pages for depth
    if (!isDocPage) {
      score -= pathSegments.length;
    }
    
    return { ...link, score };
  });
  
  // Sort by score (highest first)
  return scoredLinks.sort((a, b) => b.score - a.score);
}

/**
 * Generate content for LLMS.txt using Google Generative AI
 * @param {Array} pages - Array of page data with titles and content
 * @param {String} companyName - Name of the company
 * @param {String} companyDescription - Description of the company 
 * @returns {Promise<String>} - Generated LLMS.txt content
 */
async function generateLLMSContent(pages, companyName, companyDescription) {
  try {
    await logActivity('info', 'Starting LLMS.txt generation with example-based approach');
    
    // Get the appropriate model using the helper function
    const model = getGeminiModel('standard');
    
    // Prepare data for the model
    const data = {
      companyName,
      companyDescription,
      pages: pages.slice(0, 30).map(page => ({
        title: page.title,
        description: page.metaDescription || '',
        headings: page.headings || [],
        url: page.url,
        content: page.content ? page.content.substring(0, 1000) : ''
      }))
    };

    // =================================================================
    // ADD YOUR HIGH-QUALITY LLMS.TXT EXAMPLE HERE (REPLACE THIS COMMENT)
    // This should be a complete, well-formatted LLMS.txt file that will
    // serve as an exemplar for the model to learn from
    // =================================================================
    const exampleLlmsTxt = `# Anthropic

## Docs

- [Get API Key](https://docs.anthropic.com/en/api/admin-api/apikeys/get-api-key)
- [List API Keys](https://docs.anthropic.com/en/api/admin-api/apikeys/list-api-keys)
- [Update API Keys](https://docs.anthropic.com/en/api/admin-api/apikeys/update-api-key)
- [Create Invite](https://docs.anthropic.com/en/api/admin-api/invites/create-invite)
- [Delete Invite](https://docs.anthropic.com/en/api/admin-api/invites/delete-invite)
- [Get Invite](https://docs.anthropic.com/en/api/admin-api/invites/get-invite)
- [List Invites](https://docs.anthropic.com/en/api/admin-api/invites/list-invites)
- [Get User](https://docs.anthropic.com/en/api/admin-api/users/get-user)
- [List Users](https://docs.anthropic.com/en/api/admin-api/users/list-users)
- [Remove User](https://docs.anthropic.com/en/api/admin-api/users/remove-user)
- [Update User](https://docs.anthropic.com/en/api/admin-api/users/update-user)
- [Add Workspace Member](https://docs.anthropic.com/en/api/admin-api/workspace_members/create-workspace-member)
- [Delete Workspace Member](https://docs.anthropic.com/en/api/admin-api/workspace_members/delete-workspace-member)
- [Get Workspace Member](https://docs.anthropic.com/en/api/admin-api/workspace_members/get-workspace-member)
- [List Workspace Members](https://docs.anthropic.com/en/api/admin-api/workspace_members/list-workspace-members)
- [Update Workspace Member](https://docs.anthropic.com/en/api/admin-api/workspace_members/update-workspace-member)
- [Archive Workspace](https://docs.anthropic.com/en/api/admin-api/workspaces/archive-workspace)
- [Create Workspace](https://docs.anthropic.com/en/api/admin-api/workspaces/create-workspace)
- [Get Workspace](https://docs.anthropic.com/en/api/admin-api/workspaces/get-workspace)
- [List Workspaces](https://docs.anthropic.com/en/api/admin-api/workspaces/list-workspaces)
- [Update Workspace](https://docs.anthropic.com/en/api/admin-api/workspaces/update-workspace)
- [Cancel a Message Batch](https://docs.anthropic.com/en/api/canceling-message-batches): Batches may be canceled any time before processing ends. Once cancellation is initiated, the batch enters a `canceling` state, at which time the system may complete any in-progress, non-interruptible requests before finalizing cancellation.

The number of canceled requests is specified in `request_counts`. To determine which requests were canceled, check the individual results within the batch. Note that cancellation may not result in any canceled requests if they were non-interruptible.

Learn more about the Message Batches API in our [user guide](/en/docs/build-with-claude/batch-processing)
- [Amazon Bedrock API](https://docs.anthropic.com/en/api/claude-on-amazon-bedrock): Anthropic’s Claude models are now generally available through Amazon Bedrock.
- [Vertex AI API](https://docs.anthropic.com/en/api/claude-on-vertex-ai): Anthropic’s Claude models are now generally available through [Vertex AI](https://cloud.google.com/vertex-ai).
- [Client SDKs](https://docs.anthropic.com/en/api/client-sdks): We provide libraries in Python and TypeScript that make it easier to work with the Anthropic API.
- [Create a Text Completion](https://docs.anthropic.com/en/api/complete): [Legacy] Create a Text Completion.

The Text Completions API is a legacy API. We recommend using the [Messages API](https://docs.anthropic.com/en/api/messages) going forward.

Future models and features will not be compatible with Text Completions. See our [migration guide](https://docs.anthropic.com/en/api/migrating-from-text-completions-to-messages) for guidance in migrating from Text Completions to Messages.
- [Create a Message Batch](https://docs.anthropic.com/en/api/creating-message-batches): Send a batch of Message creation requests.

The Message Batches API can be used to process multiple Messages API requests at once. Once a Message Batch is created, it begins processing immediately. Batches can take up to 24 hours to complete.

Learn more about the Message Batches API in our [user guide](/en/docs/build-with-claude/batch-processing)
- [Delete a Message Batch](https://docs.anthropic.com/en/api/deleting-message-batches): Delete a Message Batch.

Message Batches can only be deleted once they've finished processing. If you'd like to delete an in-progress batch, you must first cancel it.

Learn more about the Message Batches API in our [user guide](/en/docs/build-with-claude/batch-processing)
- [Errors](https://docs.anthropic.com/en/api/errors)
- [Getting help](https://docs.anthropic.com/en/api/getting-help): We've tried to provide the answers to the most common questions in these docs. However, if you need further technical support using Claude, the Anthropic API, or any of our products, you may reach our support team at [support.anthropic.com](https://support.anthropic.com).
- [Getting started](https://docs.anthropic.com/en/api/getting-started)
- [IP addresses](https://docs.anthropic.com/en/api/ip-addresses): Anthropic services live at a fixed range of IP addresses. You can add these to your firewall to open the minimum amount of surface area for egress traffic when accessing the Anthropic API and Console. These ranges will not change without notice.
- [List Message Batches](https://docs.anthropic.com/en/api/listing-message-batches): List all Message Batches within a Workspace. Most recently created batches are returned first.

Learn more about the Message Batches API in our [user guide](/en/docs/build-with-claude/batch-processing)
- [Messages](https://docs.anthropic.com/en/api/messages): Send a structured list of input messages with text and/or image content, and the model will generate the next message in the conversation.

The Messages API can be used for either single queries or stateless multi-turn conversations.

Learn more about the Messages API in our [user guide](/en/docs/initial-setup)
- [Message Batches examples](https://docs.anthropic.com/en/api/messages-batch-examples): Example usage for the Message Batches API
- [Count Message tokens](https://docs.anthropic.com/en/api/messages-count-tokens): Count the number of tokens in a Message.

The Token Count API can be used to count the number of tokens in a Message, including tools, images, and documents, without creating it.

Learn more about token counting in our [user guide](/en/docs/build-with-claude/token-counting)
- [Messages examples](https://docs.anthropic.com/en/api/messages-examples): Request and response examples for the Messages API
- [Streaming Messages](https://docs.anthropic.com/en/api/messages-streaming)
- [Migrating from Text Completions](https://docs.anthropic.com/en/api/migrating-from-text-completions-to-messages): Migrating from Text Completions to Messages
- [Get a Model](https://docs.anthropic.com/en/api/models): Get a specific model.

The Models API response can be used to determine information about a specific model or resolve a model alias to a model ID.
- [List Models](https://docs.anthropic.com/en/api/models-list): List available models.

The Models API response can be used to determine which models are available for use in the API. More recently released models are listed first.
- [OpenAI SDK compatibility (beta)](https://docs.anthropic.com/en/api/openai-sdk): With a few code changes, you can use the OpenAI SDK to test the Anthropic API. Anthropic provides a compatibility layer that lets you quickly evaluate Anthropic model capabilities with minimal effort.
- [Prompt validation](https://docs.anthropic.com/en/api/prompt-validation): With Text Completions
- [Rate limits](https://docs.anthropic.com/en/api/rate-limits): To mitigate misuse and manage capacity on our API, we have implemented limits on how much an organization can use the Claude API.
- [Retrieve Message Batch Results](https://docs.anthropic.com/en/api/retrieving-message-batch-results): Streams the results of a Message Batch as a `.jsonl` file.

Each line in the file is a JSON object containing the result of a single request in the Message Batch. Results are not guaranteed to be in the same order as requests. Use the `custom_id` field to match results to requests.

Learn more about the Message Batches API in our [user guide](/en/docs/build-with-claude/batch-processing)
- [Retrieve a Message Batch](https://docs.anthropic.com/en/api/retrieving-message-batches): This endpoint is idempotent and can be used to poll for Message Batch completion. To access the results of a Message Batch, make a request to the `results_url` field in the response.

Learn more about the Message Batches API in our [user guide](/en/docs/build-with-claude/batch-processing)
- [Streaming Text Completions](https://docs.anthropic.com/en/api/streaming)
- [Supported regions](https://docs.anthropic.com/en/api/supported-regions): Here are the countries, regions, and territories we can currently support access from:
- [Versions](https://docs.anthropic.com/en/api/versioning): When making API requests, you must send an `anthropic-version` request header. For example, `anthropic-version: 2023-06-01`. If you are using our [client libraries](/en/api/client-libraries), this is handled for you automatically.
- [All models overview](https://docs.anthropic.com/en/docs/about-claude/models/all-models): Claude is a family of state-of-the-art large language models developed by Anthropic. This guide introduces our models and compares their performance with legacy models. 
- [Extended thinking models](https://docs.anthropic.com/en/docs/about-claude/models/extended-thinking-models)
- [Security and compliance](https://docs.anthropic.com/en/docs/about-claude/security-compliance)
- [Content moderation](https://docs.anthropic.com/en/docs/about-claude/use-case-guides/content-moderation): Content moderation is a critical aspect of maintaining a safe, respectful, and productive environment in digital applications. In this guide, we'll discuss how Claude can be used to moderate content within your digital application.
- [Customer support agent](https://docs.anthropic.com/en/docs/about-claude/use-case-guides/customer-support-chat): This guide walks through how to leverage Claude's advanced conversational capabilities to handle customer inquiries in real time, providing 24/7 support, reducing wait times, and managing high support volumes with accurate responses and positive interactions.
- [Legal summarization](https://docs.anthropic.com/en/docs/about-claude/use-case-guides/legal-summarization): This guide walks through how to leverage Claude's advanced natural language processing capabilities to efficiently summarize legal documents, extracting key information and expediting legal research. With Claude, you can streamline the review of contracts, litigation prep, and regulatory work, saving time and ensuring accuracy in your legal processes.
- [Guides to common use cases](https://docs.anthropic.com/en/docs/about-claude/use-case-guides/overview)
- [Ticket routing](https://docs.anthropic.com/en/docs/about-claude/use-case-guides/ticket-routing): This guide walks through how to harness Claude's advanced natural language understanding capabilities to classify customer support tickets at scale based on customer intent, urgency, prioritization, customer profile, and more.
- [Admin API](https://docs.anthropic.com/en/docs/administration/administration-api)
- [Claude Code overview](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview): Learn about Claude Code, an agentic coding tool made by Anthropic. Currently in beta as a research preview.
- [Claude Code troubleshooting](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/troubleshooting): Solutions for common issues with Claude Code installation and usage.
- [Claude Code tutorials](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/tutorials): Practical examples and patterns for effectively using Claude Code in your development workflow.
- [Google Sheets add-on](https://docs.anthropic.com/en/docs/agents-and-tools/claude-for-sheets): The [Claude for Sheets extension](https://workspace.google.com/marketplace/app/claude%5Ffor%5Fsheets/909417792257) integrates Claude into Google Sheets, allowing you to execute interactions with Claude directly in cells.
- [Computer use (beta)](https://docs.anthropic.com/en/docs/agents-and-tools/computer-use)
- [Model Context Protocol (MCP)](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)
- [Batch processing](https://docs.anthropic.com/en/docs/build-with-claude/batch-processing)
- [Citations](https://docs.anthropic.com/en/docs/build-with-claude/citations)
- [Context windows](https://docs.anthropic.com/en/docs/build-with-claude/context-windows)
- [Define your success criteria](https://docs.anthropic.com/en/docs/build-with-claude/define-success)
- [Create strong empirical evaluations](https://docs.anthropic.com/en/docs/build-with-claude/develop-tests)
- [Embeddings](https://docs.anthropic.com/en/docs/build-with-claude/embeddings): Text embeddings are numerical representations of text that enable measuring semantic similarity. This guide introduces embeddings, their applications, and how to use embedding models for tasks like search, recommendations, and anomaly detection.
- [Building with extended thinking](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)
- [Multilingual support](https://docs.anthropic.com/en/docs/build-with-claude/multilingual-support): Claude excels at tasks across multiple languages, maintaining strong cross-lingual performance relative to English.
- [PDF support](https://docs.anthropic.com/en/docs/build-with-claude/pdf-support): Process PDFs with Claude. Extract text, analyze charts, and understand visual content from your documents.
- [Prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Be clear, direct, and detailed](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/be-clear-and-direct)
- [Let Claude think (chain of thought prompting) to increase performance](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought)
- [Chain complex prompts for stronger performance](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-prompts)
- [Extended thinking tips](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips)
- [Long context prompting tips](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips)
- [Use examples (multishot prompting) to guide Claude's behavior](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting)
- [Prompt engineering overview](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview)
- [Prefill Claude's response for greater output control](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prefill-claudes-response)
- [Automatically generate first draft prompt templates](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-generator)
- [Use our prompt improver to optimize your prompts](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-improver)
- [Use prompt templates and variables](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-templates-and-variables)
- [Giving Claude a role with a system prompt](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts)
- [Use XML tags to structure your prompts](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags)
- [Token counting](https://docs.anthropic.com/en/docs/build-with-claude/token-counting)
- [Tool use with Claude](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview)
- [Text editor tool](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/text-editor-tool)
- [Token-efficient tool use (beta)](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/token-efficient-tool-use)
- [Vision](https://docs.anthropic.com/en/docs/build-with-claude/vision): The Claude 3 family of models comes with new vision capabilities that allow Claude to understand and analyze images, opening up exciting possibilities for multimodal interaction.
- [Initial setup](https://docs.anthropic.com/en/docs/initial-setup): Let’s learn how to use the Anthropic API to build with Claude.
- [Intro to Claude](https://docs.anthropic.com/en/docs/intro-to-claude): Claude is a family of [highly performant and intelligent AI models](/en/docs/about-claude/models) built by Anthropic. While Claude is powerful and extensible, it's also the most trustworthy and reliable AI available. It follows critical protocols, makes fewer mistakes, and is resistant to jailbreaks—allowing [enterprise customers](https://www.anthropic.com/customers) to build the safest AI-powered applications at scale.
- [Anthropic Privacy Policy](https://docs.anthropic.com/en/docs/legal-center/privacy)
- [API feature overview](https://docs.anthropic.com/en/docs/resources/api-features): Learn about Anthropic's API features.
- [Claude 3.7 system card](https://docs.anthropic.com/en/docs/resources/claude-3-7-system-card)
- [Claude 3 model card](https://docs.anthropic.com/en/docs/resources/claude-3-model-card)
- [Anthropic Cookbook](https://docs.anthropic.com/en/docs/resources/cookbook)
- [Anthropic Courses](https://docs.anthropic.com/en/docs/resources/courses)
- [Glossary](https://docs.anthropic.com/en/docs/resources/glossary): These concepts are not unique to Anthropic’s language models, but we present a brief summary of key terms below.
- [Model deprecations](https://docs.anthropic.com/en/docs/resources/model-deprecations)
- [System status](https://docs.anthropic.com/en/docs/resources/status)
- [Using the Evaluation Tool](https://docs.anthropic.com/en/docs/test-and-evaluate/eval-tool): The [Anthropic Console](https://console.anthropic.com/dashboard) features an **Evaluation tool** that allows you to test your prompts under various scenarios.
- [Increase output consistency (JSON mode)](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/increase-consistency)
- [Keep Claude in character with role prompting and prefilling](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/keep-claude-in-character)
- [Mitigate jailbreaks and prompt injections](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)
- [Reduce hallucinations](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations)
- [Reducing latency](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-latency)
- [Reduce prompt leak](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-prompt-leak)
- [Welcome to Claude](https://docs.anthropic.com/en/docs/welcome): Claude is a highly performant, trustworthy, and intelligent AI platform built by Anthropic. Claude excels at tasks involving language, reasoning, analysis, coding, and more.
- [null](https://docs.anthropic.com/en/home)
- [Adaptive editor](https://docs.anthropic.com/en/prompt-library/adaptive-editor): Rewrite text following user-given instructions, such as with a different tone, audience, or style.
- [Airport code analyst](https://docs.anthropic.com/en/prompt-library/airport-code-analyst): Find and extract airport codes from text.
- [Alien anthropologist](https://docs.anthropic.com/en/prompt-library/alien-anthropologist): Analyze human culture and customs from the perspective of an alien anthropologist.
- [Alliteration alchemist](https://docs.anthropic.com/en/prompt-library/alliteration-alchemist): Generate alliterative phrases and sentences for any given subject.
- [Babel's broadcasts](https://docs.anthropic.com/en/prompt-library/babels-broadcasts): Create compelling product announcement tweets in the world's 10 most spoken languages.
- [Brand builder](https://docs.anthropic.com/en/prompt-library/brand-builder): Craft a design brief for a holistic brand identity.
- [Career coach](https://docs.anthropic.com/en/prompt-library/career-coach): Engage in role-play conversations with an AI career coach.
- [Cite your sources](https://docs.anthropic.com/en/prompt-library/cite-your-sources): Get answers to questions about a document's content with relevant citations supporting the response.
- [Code clarifier](https://docs.anthropic.com/en/prompt-library/code-clarifier): Simplify and explain complex code in plain language.
- [Code consultant](https://docs.anthropic.com/en/prompt-library/code-consultant): Suggest improvements to optimize Python code performance.
- [Corporate clairvoyant](https://docs.anthropic.com/en/prompt-library/corporate-clairvoyant): Extract insights, identify risks, and distill key information from long corporate reports into a single memo.
- [Cosmic Keystrokes](https://docs.anthropic.com/en/prompt-library/cosmic-keystrokes): Generate an interactive speed typing game in a single HTML file, featuring side-scrolling gameplay and Tailwind CSS styling.
- [CSV converter](https://docs.anthropic.com/en/prompt-library/csv-converter): Convert data from various formats (JSON, XML, etc.) into properly formatted CSV files.
- [Culinary creator](https://docs.anthropic.com/en/prompt-library/culinary-creator): Suggest recipe ideas based on the user's available ingredients and dietary preferences.
- [Data organizer](https://docs.anthropic.com/en/prompt-library/data-organizer): Turn unstructured text into bespoke JSON tables.
- [Direction decoder](https://docs.anthropic.com/en/prompt-library/direction-decoder): Transform natural language into step-by-step directions.
- [Dream interpreter](https://docs.anthropic.com/en/prompt-library/dream-interpreter): Offer interpretations and insights into the symbolism of the user's dreams.
- [Efficiency estimator](https://docs.anthropic.com/en/prompt-library/efficiency-estimator): Calculate the time complexity of functions and algorithms.
- [Email extractor](https://docs.anthropic.com/en/prompt-library/email-extractor): Extract email addresses from a document into a JSON-formatted list.
- [Emoji encoder](https://docs.anthropic.com/en/prompt-library/emoji-encoder): Convert plain text into fun and expressive emoji messages.
- [Ethical dilemma navigator](https://docs.anthropic.com/en/prompt-library/ethical-dilemma-navigator): Help the user think through complex ethical dilemmas and provide different perspectives.
- [Excel formula expert](https://docs.anthropic.com/en/prompt-library/excel-formula-expert): Create Excel formulas based on user-described calculations or data manipulations.
- [Function fabricator](https://docs.anthropic.com/en/prompt-library/function-fabricator): Create Python functions based on detailed specifications.
- [Futuristic fashion advisor](https://docs.anthropic.com/en/prompt-library/futuristic-fashion-advisor): Suggest avant-garde fashion trends and styles for the user's specific preferences.
- [Git gud](https://docs.anthropic.com/en/prompt-library/git-gud): Generate appropriate Git commands based on user-described version control actions.
- [Google apps scripter](https://docs.anthropic.com/en/prompt-library/google-apps-scripter): Generate Google Apps scripts to complete tasks based on user requirements.
- [Grading guru](https://docs.anthropic.com/en/prompt-library/grading-guru): Compare and evaluate the quality of written texts based on user-defined criteria and standards.
- [Grammar genie](https://docs.anthropic.com/en/prompt-library/grammar-genie): Transform grammatically incorrect sentences into proper English.
- [Hal the humorous helper](https://docs.anthropic.com/en/prompt-library/hal-the-humorous-helper): Chat with a knowledgeable AI that has a sarcastic side.
- [Idiom illuminator](https://docs.anthropic.com/en/prompt-library/idiom-illuminator): Explain the meaning and origin of common idioms and proverbs.
- [Interview question crafter](https://docs.anthropic.com/en/prompt-library/interview-question-crafter): Generate questions for interviews.
- [LaTeX legend](https://docs.anthropic.com/en/prompt-library/latex-legend): Write LaTeX documents, generating code for mathematical equations, tables, and more.
- [Lesson planner](https://docs.anthropic.com/en/prompt-library/lesson-planner): Craft in depth lesson plans on any subject.
- [Library](https://docs.anthropic.com/en/prompt-library/library)
- [Master moderator](https://docs.anthropic.com/en/prompt-library/master-moderator): Evaluate user inputs for potential harmful or illegal content.
- [Meeting scribe](https://docs.anthropic.com/en/prompt-library/meeting-scribe): Distill meetings into concise summaries including discussion topics, key takeaways, and action items.
- [Memo maestro](https://docs.anthropic.com/en/prompt-library/memo-maestro): Compose comprehensive company memos based on key points.
- [Mindfulness mentor](https://docs.anthropic.com/en/prompt-library/mindfulness-mentor): Guide the user through mindfulness exercises and techniques for stress reduction.
- [Mood colorizer](https://docs.anthropic.com/en/prompt-library/mood-colorizer): Transform text descriptions of moods into corresponding HEX codes.
- [Motivational muse](https://docs.anthropic.com/en/prompt-library/motivational-muse): Provide personalized motivational messages and affirmations based on user input.
- [Neologism creator](https://docs.anthropic.com/en/prompt-library/neologism-creator): Invent new words and provide their definitions based on user-provided concepts or ideas.
- [Perspectives ponderer](https://docs.anthropic.com/en/prompt-library/perspectives-ponderer): Weigh the pros and cons of a user-provided topic.
- [Philosophical musings](https://docs.anthropic.com/en/prompt-library/philosophical-musings): Engage in deep philosophical discussions and thought experiments.
- [PII purifier](https://docs.anthropic.com/en/prompt-library/pii-purifier): Automatically detect and remove personally identifiable information (PII) from text documents.
- [Polyglot superpowers](https://docs.anthropic.com/en/prompt-library/polyglot-superpowers): Translate text from any language into any language.
- [Portmanteau poet](https://docs.anthropic.com/en/prompt-library/portmanteau-poet): Blend two words together to create a new, meaningful portmanteau.
- [Product naming pro](https://docs.anthropic.com/en/prompt-library/product-naming-pro): Create catchy product names from descriptions and keywords.
- [Prose polisher](https://docs.anthropic.com/en/prompt-library/prose-polisher): Refine and improve written content with advanced copyediting techniques and suggestions.
- [Pun-dit](https://docs.anthropic.com/en/prompt-library/pun-dit): Generate clever puns and wordplay based on any given topic.
- [Python bug buster](https://docs.anthropic.com/en/prompt-library/python-bug-buster): Detect and fix bugs in Python code.
- [Review classifier](https://docs.anthropic.com/en/prompt-library/review-classifier): Categorize feedback into pre-specified tags and categorizations.
- [Riddle me this](https://docs.anthropic.com/en/prompt-library/riddle-me-this): Generate riddles and guide the user to the solutions.
- [Sci-fi scenario simulator](https://docs.anthropic.com/en/prompt-library/sci-fi-scenario-simulator): Discuss with the user various science fiction scenarios and associated challenges and considerations.
- [Second-grade simplifier](https://docs.anthropic.com/en/prompt-library/second-grade-simplifier): Make complex text easy for young learners to understand.
- [Simile savant](https://docs.anthropic.com/en/prompt-library/simile-savant): Generate similes from basic descriptions.
- [Socratic sage](https://docs.anthropic.com/en/prompt-library/socratic-sage): Engage in Socratic style conversation over a user-given topic.
- [Spreadsheet sorcerer](https://docs.anthropic.com/en/prompt-library/spreadsheet-sorcerer): Generate CSV spreadsheets with various types of data.
- [SQL sorcerer](https://docs.anthropic.com/en/prompt-library/sql-sorcerer): Transform everyday language into SQL queries.
- [Storytelling sidekick](https://docs.anthropic.com/en/prompt-library/storytelling-sidekick): Collaboratively create engaging stories with the user, offering plot twists and character development.
- [Time travel consultant](https://docs.anthropic.com/en/prompt-library/time-travel-consultant): Help the user navigate hypothetical time travel scenarios and their implications.
- [Tongue twister](https://docs.anthropic.com/en/prompt-library/tongue-twister): Create challenging tongue twisters.
- [Trivia generator](https://docs.anthropic.com/en/prompt-library/trivia-generator): Generate trivia questions on a wide range of topics and provide hints when needed.
- [Tweet tone detector](https://docs.anthropic.com/en/prompt-library/tweet-tone-detector): Detect the tone and sentiment behind tweets.
- [VR fitness innovator](https://docs.anthropic.com/en/prompt-library/vr-fitness-innovator): Brainstorm creative ideas for virtual reality fitness games.
- [Website wizard](https://docs.anthropic.com/en/prompt-library/website-wizard): Create one-page websites based on user specifications.
- [API](https://docs.anthropic.com/en/release-notes/api): Follow along with updates across Anthropic's API and Developer Console.
- [Claude Apps](https://docs.anthropic.com/en/release-notes/claude-apps): Follow along with updates across Anthropic's Claude applications.
- [Overview](https://docs.anthropic.com/en/release-notes/overview): Follow along with updates across Anthropic's products and services.
- [System Prompts](https://docs.anthropic.com/en/release-notes/system-prompts): See updates to the core system prompts on [Claude.ai](https://www.claude.ai) and the Claude [iOS](http://anthropic.com/ios) and [Android](http://anthropic.com/android) apps.


## Optional

- [Developer Console](https://console.anthropic.com/)
- [Developer Discord](https://www.anthropic.com/discord)
- [Support](https://support.anthropic.com/)`

    // Create prompt for the model that includes the example
    const prompt = `
You are tasked with creating an LLMS.txt file for ${companyName} based on the following website data. An LLMS.txt file is a concise but comprehensive description of a company's purpose, products, links, and policies in markdown format.

EXAMPLE OF WELL-FORMATTED LLMS.TXT FILE:
${exampleLlmsTxt}

WEBSITE DATA:
${JSON.stringify(data, null, 2)}

Please generate an LLMS.txt file for ${companyName} following this format:
1. Start with "# ${companyName}" as the main heading
2. Use "##" for section headers (Key Products & Services, Important Links, Policies)
3. Include a blockquote with > for the mission statement or brief description
4. Format lists with bullet points (-)
5. Include all important URLs as absolute links in markdown format: [Link Name](URL)
6. Add brief descriptions after URLs where appropriate
7. Keep the content factual and professional
8. Be concise yet thorough
9. Focus only on information found in the provided website data

The final output should ONLY contain the LLMS.txt content, with proper markdown formatting, especially the "#" and "##" headers. DO NOT remove or alter any markdown formatting.
`;

    await logActivity('info', 'Sending prompt to model for LLMS.txt generation');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Keep the markdown formatting - don't clean it
    return text.trim();
  } catch (error) {
    console.error('Error generating LLMS content:', error);
    throw new Error(`Failed to generate LLMS content: ${error.message}`);
  }
}

/**
 * Generate content for LLMS-full.txt using Google Generative AI
 * @param {Array} pages - Array of page data with titles and content
 * @param {String} companyName - Name of the company 
 * @param {String} companyDescription - Description of the company
 * @returns {Promise<String>} - Generated LLMS-full.txt content
 */
async function generateLLMSFullContent(pages, companyName, companyDescription) {
  try {
    await logActivity('info', 'Starting LLMS-full.txt generation with example-based approach');
    
    // Sort and filter pages for different sections
    const pagesByCategory = categorizePages(pages);
    
    // Get models for different sections
    const standardModel = getGeminiModel('standard');
    const advancedModel = getGeminiModel('advanced');
    
    // =====================================================================
    // ADD YOUR HIGH-QUALITY LLMS-FULL.TXT EXAMPLE HERE (REPLACE THIS COMMENT)
    // This should be a complete, well-formatted LLMS-full.txt file that will
    // serve as an exemplar for the model to learn from. This example will be
    // used in generating all sections of the LLMS-full.txt file.
    // =====================================================================
    const exampleLlmsFullTxt = `# Billing
Source: https://docs.cursor.com/account/billing

Guide to Cursor billing: manage subscriptions, seats, cycles, and payments through Stripe portal

We use Stripe as our billing and payments provider

### How do I access billing settings?

The billing portal is where you'll manage all aspects of your subscription. You can access it through the [dashboard](https://cursor.com/settings) by clicking the "Billing" button in your account settings. This takes you to a secure portal where you can handle all billing-related tasks.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/billing/billing-account.png" />
</Frame>

### What are Cursor's billing cycles?

Billing cycles run on either a monthly or annual basis, starting on the day you subscribe. For Business accounts with multiple seats, we use prorated billing when your team size changes. This means you only pay for the actual time each seat is used within a billing cycle.

### How do team seats work for Business accounts?

Business accounts use a per-seat billing model where each team member requires one seat license. When adding new members mid-cycle, you're only charged for their remaining time in that billing period. Team admins can manage seats directly through the dashboard.

### Can I switch between monthly and annual billing?

Yes you can! Here's how:

**Pro plan**

1. Go to [settings](https://cursor.com/settings)
2. Click on "Manage subscription" and you will be taken to the billing portal
3. Click on "Update subscription"
4. From here you can switch between monthly and annual billing
5. Select "Yearly" or "Monthly", then click on "Continue"

**Business plan**

1. Go to [settings](https://cursor.com/settings)
2. In the account section, click on "Advanced" then "Upgrade to yearly billing"

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/plans/business/upgrade-to-yearly.png" />
</Frame>

<Note>
  Please note that you can only switch from monthly to yearly billing
  self-serve. To switch from yearly to monthly billing, please contact us at
  [hi@cursor.com](mailto:hi@cursor.com).
</Note>

### Where can I find my invoices?

All your billing history is available in the billing portal, where you can view and download both current and past invoices.

### Can I get invoices automatically emailed to me?

Currently, invoices need to be downloaded manually from the billing portal. We know this is a hassle, so we're developing automatic invoice emails as a new feature, and once available, you'll be able to opt-in!

### How do I update my billing information?

You can update your payment method, company name, address, and tax information through the billing portal. We use Stripe as our payment processor to ensure secure transactions. Please note that changes to billing information will only affect future invoices - we cannot modify historical invoices.

### How do I cancel my subscription?

You can cancel your subscription directly through the billing portal using the "Cancel subscription" button. Your access will continue until the end of your current billing period.

### I'm having other billing issues. How can I get help?

For any billing-related questions not covered here, please email us at [hi@cursor.com](mailto:hi@cursor.com). Include your account details and specific concerns, and our team will help you resolve them quickly!

### Can I get a refund?

You can self-serve a refund by going to the billing portal and clicking on the `Cancel subscription` button. Our self-serve refund policy is as follows:

**EU, UK or Turkey customers**

* Eligible for a refund if you cancel your subscription within 14 days of purchase.

**All other customers (US + rest of world)**

* Monthly subscriptions: Refundable within 24 hours after purchase.
* Annual subscriptions: Refundable within 72 hours after purchase

If you're not in the window of self-serve refunds, reach out to us at [hi@cursor.com](mailto:hi@cursor.com) and we'll help you!


# Dashboard
Source: https://docs.cursor.com/account/dashboard

Learn how to manage billing, usage pricing, and team settings in the dashboard for different plans

<Note>You can view the Cursor dashboard by going to [cursor.com/settings](https://cursor.com/settings)</Note>

From the dashboard you can access billing portal, setup usage based pricing and manage your team. Depending on if you're on Free, Pro or Business, you'll see different sections.

## Pro

From here you can access billing portal, setup usage based pricing and see how many requests you have left.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/pro.png" style={{ padding: 32, backgroundColor: "#0c0c0c" }} />
</Frame>

## Business

Business will have a section for teams.

### Team

Read more about how to manage teams in [members](/account/teams/members)

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/team.png" style={{ padding: 32, backgroundColor: "#0c0c0c" }} />
</Frame>

### Metrics

Read more in [team analytics](/account/teams/analytics). This is only available for teams

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/metrics.png" style={{ padding: 32, backgroundColor: "#0c0c0c" }} />
</Frame>

### Usage based pricing

This is where you can toggle usage based pricing and set spending limits. Read more about [usage based pricing](/account/usage) and how to configure it

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/usage-based-pricing.png" style={{ padding: 32, backgroundColor: "#0c0c0c" }} />
</Frame>


# Plans & Usage
Source: https://docs.cursor.com/account/plans-and-usage

Learn about Cursor's pricing plans, usage limits, request pools, and billing information

<Note>To view your current usage, you can visit the dashboard at [cursor.com/settings](https://cursor.com/settings)</Note>

## Available Plans

<CardGroup cols={3}>
  <Card title="Hobby">
    <ul style={{ listStyle: "disc", paddingLeft: 12 }}>
      <li>50 slow `premium` model uses per month</li>
      <li>2000 [completions](/tab/overview)</li>
    </ul>
  </Card>

  <Card title="Pro">
    <ul style={{ listStyle: "disc", paddingLeft: 12 }}>
      <li>500 fast `premium` requests per month</li>
      <li>Unlimited slow `premium` requests per month</li>
      <li>Unlimited [completions](/tab/overview)</li>
      <li>10 o1-mini per day</li>
    </ul>
  </Card>

  <Card title="Business">
    <ul style={{ listStyle: "disc", paddingLeft: 12 }}>
      <li>Same usage as Pro</li>
      <li>Enforces privacy mode</li>
      <li>Centralized team billing</li>
      <li>Admin dashboard with usage stats</li>
      <li>SAML/OIDC SSO</li>
    </ul>
  </Card>
</CardGroup>

<CardGroup cols={1}>
  <Card title="Free Trial">
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <div>
        <ul style={{ listStyle: "disc", paddingLeft: 12 }}>
          <li>14 days Pro Trial</li>
        </ul>
      </div>

      <div>
        <ul style={{ listStyle: "disc", paddingLeft: 12 }}>
          <li>150 `premium` model uses</li>
        </ul>
      </div>

      <div>
        <ul style={{ listStyle: "disc", paddingLeft: 12 }}>
          <li>Unlimited [completions](/tab/overview)</li>
        </ul>
      </div>
    </div>
  </Card>
</CardGroup>

<Tip>
  For costs and more pricing info, please visit the [Cursor Pricing](https://cursor.com/pricing) page.
</Tip>

## Understanding Usage

### Fast and Slow Requests

There are two types of requests in Cursor, **slow** and **fast** that has its own pool.

By default, Cursor servers try to give all users fast `premium` model requests. However, when users run out of fast `premium` credits, they are moved to a slow pool. Wait times in the slow pool are calculated proportionally to how many slow requests you've used, so they generally remain manageable unless you're well over your fast request limit.

To bypass wait times entirely, you can enable usage-based pricing (you'll only be charged for requests beyond your included fast requests).

See [models](/settings/models) for an overview of which models are `premium` and their alternatives.

### Included Requests

Every subscription includes a set amount of fast requests. The number of included requests depends on your plan as shown in the plan comparison above.

### Additional Requests

We offer usage-based pricing for additional requests beyond your plan's included quota:

#### Usage-based Pricing

You may opt in to usage-based pricing for requests that go beyond what is included in your Pro or Business plan from your [dashboard](/account/dashboard).

<Info>Usage-based pricing is only available with a paid subscription.</Info>

From the dashboard, you can toggle usage based pricing for `premium` models and `other` models (see [models](/settings/models) to understand which model is which). You can also configure a spend limit in USD to make sure you never go over that. Once the spending limit is hit, slow requests will be used.

We will bill for additional fast requests when you've made requests totaling \$20, **or** on the 2nd or 3rd day of the month, whichever comes first.

<AccordionGroup>
  <Accordion title="Single invoice">
    375 fast requests made with a `premium` model (\$15) will be billed at the beginning of the next month since the total value is under \$20
  </Accordion>

  <Accordion title="Multiple invoices">
    <p>
      1150 fast requests made with a `premium` (\$46) will be billed 3 times:
    </p>

    <p>1. When first batch of 500 requests has been made (\$20)</p>
    <p>2. When second batch of 500 requests has been made (also \$20)</p>
    <p>3. Beginning of next month (remaining \$6)</p>
  </Accordion>
</AccordionGroup>

For team accounts, administrators can restrict usage-based pricing settings to admin-only access.

Cost per request for each model can be found on the [models](/settings/models) page.

#### Fast Requests Packages

<Warning>Fast requests packages have been deprecated in favor of usage-based pricing. Existing users with additional packages can continue to use them and have the option to remove them, but new packages cannot be purchased.</Warning>

Fast Request Packages were bundles of 500 requests that could be purchased in addition to your plan's included quota. These have been replaced by usage-based pricing for fast requests, as purchasing them in bundles often meant users would pay for requests they didn't use.

### FAQ

#### When do my fast requests reset?

Your Fast Requests reset on a fixed monthly date based on when you first set up your plan. If you purchase additional requests (for example, upgrading from 500 to 1000 requests), the reset date remains unchanged. For instance, if your plan started on the 23rd, your requests will always reset on the 23rd of each month, regardless of when you purchase additional requests.

#### What does "500 premium requests" mean for teams?

Each user gets their own quota of 500 fast requests for premium models per month. These requests are not pooled across the team - every team member gets their own fresh 500 requests when their personal monthly cycle resets.


# Pricing
Source: https://docs.cursor.com/account/pricing





# Privacy + Security
Source: https://docs.cursor.com/account/privacy

A guide to Cursor's privacy settings, data handling, and code indexing with Privacy Mode option

Cursor is built with privacy and security at its core. We have built Cursor from the ground up to give you the peace of mind that your code and data is private and secure.

## Quick Links

To learn more about Cursor's privacy and security practices, please see the following links:

<CardGroup cols={2}>
  <Card title="Privacy Policy" icon="user-shield" href="https://cursor.com/privacy">
    Read our comprehensive privacy policy to understand how we handle your data
  </Card>

  <Card title="Security Overview" icon="lock" href="https://cursor.com/security">
    Learn about our security practices and how we protect your code
  </Card>
</CardGroup>

<CardGroup cols={1}>
  <Card horizontal title="Trust Center" icon="shield-halved" href="https://trust.cursor.com">
    View our Trust Center to learn more about our security practices and to access our SOC2 certification. security reports and annual penetration testing reports.
  </Card>
</CardGroup>

## Privacy FAQs

### What is Privacy Mode?

With `Privacy Mode` enabled, none of your code will ever be stored by us or any third-party. Otherwise, we may collect prompts, code snippets and telemetry data to improve Cursor. You can [read more about Privacy Mode here](https://cursor.com/privacy). Privacy mode is enforced for Business plans

You can enable `Privacy Mode` at onboarding or under `Cursor Settings` > `General` > `Privacy Mode`.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/get-started/privacy-mode.png" alt="Privacy Mode" />
</Frame>

### Are requests always routed through the Cursor backend?

Yes! Even if you use your API key, your requests will still go through our backend. That's where we do our final prompt building.

### Does indexing the codebase require storing code?

It does not! If you choose to index your codebase, Cursor will upload your codebase in small chunks to our server to compute embeddings, but all plaintext code ceases to exist after the life of the request.

The embeddings and metadata about your codebase (hashes, obfuscated file names) are stored in our database, but none of your code is.

You can read more about this on our [security page](https://cursor.com/security).


# Analytics
Source: https://docs.cursor.com/account/teams/analytics

Track team metrics including usage stats, per-user activity, and active user counts from the dashboard

Team admins can track metrics for their team from the [dashboard](/account/dashboard).

<Info>
  Expect this to improve a lot during H1 2025, including API for programmatic
  access
</Info>

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/metrics.png" />
</Frame>

The metrics dashboard shows usage statistics for your team over the last 30 days:

### Total Usage

View aggregate metrics across your entire team, including total tabs and premium requests used. For teams less than 30 days old, metrics reflect actual usage since team creation, including activity from team members' individual accounts prior to joining.

### Per Active User

See average usage metrics per active user, including tabs accepted, lines of code, and premium requests.

### User Activity

Track both weekly and monthly active user counts.

## FAQ

<AccordionGroup>
  <Accordion title="Why do I see different request counts in the metrics page versus the team tab?">
    The difference in numbers you're seeing is because the team tab shows requests for the current billing period, while the metrics page shows a rolling 30-day window. We know is can be confusing - we're working on making this clearer in the dashboard.
  </Accordion>
</AccordionGroup>


# Members + Roles
Source: https://docs.cursor.com/account/teams/members

Learn about team roles, member management, SSO, usage controls, and billing for organizational teams

## Roles

Teams have access to three user roles to help manage teams. Each role has specific permissions and billing implications.

<AccordionGroup>
  <Accordion title="Member (default)">
    * Access to all [Business features](https://cursor.com/pricing)
    * Can invite team members
    * Billed for a user seat
  </Accordion>

  <Accordion title="Admin">
    Admins have comprehensive control over team management and security settings to ensure smooth team operations.

    * Full team management capabilities:
      * Invite/remove team members
      * Modify team roles
    * Usage and security controls:
      * Toggle usage-based pricing
      * Configure SSO & domain verification
      * Set organization-wide spending caps
    * Access to admin dashboard
    * Billed for a user seat
  </Accordion>

  <Accordion title="Unpaid Admin">
    Unpaid Admins manage the team without using a paid seat - ideal for IT staff who don't need Cursor access.

    * Same capabilities as Admin
    * **Not billed for a user seat**
    * Requires at least one paid Admin on the team to assign this role
  </Accordion>
</AccordionGroup>

<div className="full-width-table">
  ### Comparison

  <Accordion title="Role Capabilities">
    | Capability             | Member | Admin | Unpaid Admin |
    | ---------------------- | :----: | :---: | :----------: |
    | Use Cursor features    |    ✓   |   ✓   |              |
    | Invite members         |    ✓   |   ✓   |       ✓      |
    | Remove members         |        |   ✓   |       ✓      |
    | Change user role       |        |   ✓   |       ✓      |
    | Admin dashboard        |        |   ✓   |       ✓      |
    | Configure SSO/Security |        |   ✓   |       ✓      |
    | Manage Billing         |        |   ✓   |       ✓      |
    | Set usage controls     |    ✓   |   ✓   |       ✓      |
    | Requires paid seat     |    ✓   |   ✓   |              |
  </Accordion>
</div>

## Managing members

All members in the team can invite other members. We currently do not have any way to control invites.

### Add member

#### Email invitation

* Click the `Invite Members` button
* Enter email addresses

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/invite-members.png" style={{ padding: `32px 64px`, backgroundColor: "#0c0c0c" }} />
</Frame>

#### Invite link

* Click the `Invite Members` button
* Copy the `Invite Link`
* Share with team members

<Info>
  Invite links do not expire and anyone who gets access to the link can join a
  team. You can prevent this by setting up [SSO](/account/teams/sso)
</Info>

### Remove member

Admins can remove members at any time by clicking the context menu and then "Remove". We'll only charge for time the member was in the team

### Change role

Admins can change roles for other members by clicking the context menu and then "Change role". There has to be at least one Admin per team

## Security & SSO

SAML 2.0 Single Sign-On (SSO) is available on Business and Enterprise plans. Key features:

* Configure SSO connections ([learn more about SSO setup](/account/teams/sso))
* Set up domain verification
* Automatic user enrollment through SSO
* SSO enforcement options
* Identity provider integration (Okta, etc)

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/sso-settings.png" style={{ padding: `32px 64px`, backgroundColor: "#0c0c0c" }} />
</Frame>

## Usage Controls

Access usage settings to:

* Enable usage-based pricing
* Enable for usage-based for premium models
* Set admin-only modifications for usage-based pricing settings
* Set monthly spending limits
* Monitor team-wide usage

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/usage-based-pricing.png" style={{ backgroundColor: "#0c0c0c" }} />
</Frame>

## Billing

When adding new team members:

* Each new member or admin adds a billable seat (see [pricing](https://cursor.com/pricing))
* Seat changes are prorated for your billing period
* Unpaid admin seats are not counted

Adding new team members in the middle of a month, we'll only charge you for the days they actually use. Similarly, if someone leaves the team, we'll credit your account for any unused days.

If you change someone's role (e.g from Admin to Unpaid Admin), we'll automatically adjust the billing from the day of the change. You can choose to be billed either monthly or yearly - both options are available to suit your needs.

### Switching from monthly to yearly billing

You can save 20% of the Business plan by switching from monthly to yearly billing. This can be done from the [dashboard](/account/dashboard)

1. Go to [settings](https://cursor.com/settings)
2. In the account section, click on "Advanced" then "Upgrade to yearly billing"

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/plans/business/upgrade-to-yearly.png" />
</Frame>

<Note>
  Please note that you can only switch from monthly to yearly billing
  self-service. To switch from yearly to monthly billing, please contact us at
  [hi@cursor.com](mailto:hi@cursor.com).
</Note>


# Get Started
Source: https://docs.cursor.com/account/teams/setup

Learn how to create and manage a business team: setup, invite members, and configure SSO options

## Creating a team

<Steps>
  <Step title="Set up Business plan">
    To create a team, you need to be on the [Business plan](/account/plans).

    If you're setting up a new account, head over to [create team](https://cursor.com/team/new-team). If you're on a Pro plan, you can click the "Upgrade to Business" button in [dashboard](/account/dashboard)
  </Step>

  <Step title="Enter team details">
    After clicking "New Team", enter the details for the team. You will have to
    select name and billing cycle for the team

    <Frame>
      <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/create-team.png" />
    </Frame>
  </Step>

  <Step title="Invite members">
    After the team is created, you can start inviting members to the team. All
    changes to users are prorated, meaning that we will only charge for the time
    that a user has been a member of the team

    <Frame>
      <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/invite-members.png" style={{ paddingLeft: 16, paddingRight: 16, backgroundColor: '#0c0c0c' }} />
    </Frame>
  </Step>

  <Step title="Enable SSO (optional)">
    After the team is created, you can enable [SSO](/account/teams/sso) for the team for additional security.

    <Frame>
      <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/sso-settings.png" />
    </Frame>
  </Step>
</Steps>

## FAQ

### How can I purchase 10 licenses for my company?

Start by creating a team, then invite your team members. We charge based on the amount of users in your team. We don't have a fixed amount of seats, it's prorated as you update team members

### How can I set up a team when I'm not going to use Cursor myself?

We require at least one paid member to create a team. If you are creating the team, we require you to start as a paid member. After you've invited another member to the team, you can assign yourself the [Unpaid Admin role](/account/teams/members). Seat changes are not billed immediately, so you can set up a team, invite a member and change your own role without being charged

### How can I add Cursor to an MDM, like Kandji?

You can get the versions from here:

* Mac: [Apple Silicon](https://downloader.cursor.sh/mac/dmg/arm64)
* Mac: [Intel](https://downloader.cursor.sh/mac/dmg/x64)
* Windows: [x64](https://downloader.cursor.sh/windows/nsis/x64)
* Windows: [arm64](https://downloader.cursor.sh/windows/nsis/arm64)

Then follow the instructions for your MDM:

* Kandji: [Custom Apps](https://support.kandji.io/kb/custom-apps-overview)


# SSO
Source: https://docs.cursor.com/account/teams/sso

Learn how to set up SAML 2.0 Single Sign-On (SSO) for secure team authentication in Cursor

## Overview

SAML 2.0 Single Sign-On (SSO) is available at no additional cost on the Cursor Business plan. This enables you to use your existing identity provider (IdP) to authenticate your team members, avoiding the need for your team members to have a Cursor account, and remember another password.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/account/sso-settings.png" style={{ padding: 32, backgroundColor: "#0c0c0c" }} />
</Frame>

## Prerequisites

* A Cursor Business plan
* Admin access to your identity provider (e.g., Okta)
* Admin access to your Cursor organization

## Configuration Steps

<Steps>
  <Step title="Sign in to your Cursor account">
    Navigate to [cursor.com/settings](http://cursor.com/settings) and sign in with an admin account.
  </Step>

  <Step title="Locate the SSO configuration">
    Find the "Configure SSO" button in the bottom left of the settings page
  </Step>

  <Step title="Begin the setup process">
    Click the button to start the SSO setup process, and follow the setup wizard to configure your identity provider.
  </Step>

  <Step title="Configure your identity provider">
    In your identity provider (e.g., Okta):

    * Create a new SAML application
    * Configure the SAML settings using the information provided in Cursor
    * Set up Just-in-Time (JIT) provisioning for seamless user access
  </Step>
</Steps>

### Identity Provider Setup Guides

For detailed setup instructions specific to your identity provider, refer to the guides below:

<Card title="Identity Provider Guides" icon="book" href="https://workos.com/docs/integrations">
  Access comprehensive setup instructions for all major identity providers including Okta, Azure AD, Google Workspace, and more.
</Card>

<Info>SCIM provisioning coming H1 2025</Info>

## Additional Settings

* SSO enforcement is managed through the admin dashboard
* New users are automatically enrolled in your organization when they sign in through SSO
* User management can be handled directly through your identity provider

## Troubleshooting

If you encounter issues during setup:

* Verify your domain has been verified in Cursor
* Ensure all required SAML attributes are properly mapped
* Check that the SSO configuration is enabled in your admin dashboard
* If a user is unable to authenticate, ensure the first and last name set in the identity provider matches their name in Cursor
* Check the guides above for detailed setup instructions specific to your identity provider
* If you continue to experience issues, please reach out to us at [hi@cursor.com](mailto:hi@cursor.com)


# Notepads (Beta)
Source: https://docs.cursor.com/beta/notepads

A guide to using Notepads in Cursor for sharing context between Composers and Chat interactions

<Warning>
  Notepads are currently in beta and subject to be deprecated in the future.
</Warning>

# Overview

Notepads are powerful context-sharing tools in Cursor that bridge the gap between composers and chat interactions. Think of them as enhanced reference documents that go beyond the capabilities of `.cursorrules`, allowing you to create reusable contexts for your development workflow.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/features/beta/notepads/empty-notepad.png" />
</Frame>

Notepads serve as collections of thoughts, rules, and documentation that can be:

* Shared between different parts of your development environment
* Referenced using the `@` syntax
* Enhanced with file attachments
* Used as dynamic templates for various development scenarios

## Getting started

1. Click the "+" button in the Notepads section
2. Give your notepad a meaningful name
3. Add your content, context, files and other relevant information the same way you would in composer or chat.
4. Reference it in composers or chat using `@`

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/features/beta/notepads/create-notepad.png" />
</Frame>

# Key features

* **Context Sharing**: Seamlessly share context between composers and chat
* **File Attachments**: Attach documentation and reference files (not possible in `.cursorrules`)
* **Dynamic References**: Use `@` mentions to link to other resources
* **Flexible Content**: Write and structure information in a way that suits your needs

# Common use cases

1. **Dynamic Boilerplate Generation**
   * Create templates for common code patterns
   * Store project-specific scaffolding rules
   * Maintain consistent code structure across your team

2. **Architecture Documentation**
   * Frontend specifications
   * Backend design patterns
   * Data model documentation
   * System architecture guidelines

3. **Development Guidelines**
   * Coding standards
   * Project-specific rules
   * Best practices
   * Team conventions

## FAQ

### What should I write in Notepads?

Notepads are ideal for:

* Project architecture decisions
* Development guidelines and standards
* Reusable code templates
* Documentation that needs to be referenced frequently
* Team-specific conventions and rules

### What should not be written in Notepads?

Avoid using Notepads for:

* Temporary notes or scratch work
* Information that belongs in version control (like git)
* Sensitive data or credentials
* Highly volatile information that changes frequently

### Should I follow a particular format or structure?

While Notepads are flexible, we recommend:

* Using clear headings and sections
* Including examples where relevant
* Keeping content focused and organized
* Using markdown formatting for better readability
* Adding relevant file attachments when necessary

### Example Notepad

Here's a typical example of a Notepad for a web application project:

```md Notepad example
# API Development Guidelines

## Endpoint Structure
- Use RESTful conventions
- Base URL: `/api/v1`
- Resource naming in plural form

## Authentication
- JWT-based authentication
- Token format: Bearer {token}
- Refresh token mechanism required

## Response Format
{
  "status": "success|error",
  "data": {},
  "message": "Optional message"
} 

## Attached References
@api-specs.yaml
@auth-flow.md
```


# Agent
Source: https://docs.cursor.com/chat/agent

AI assistant that uses tools and reasoning to perform coding tasks with minimal supervision

You can delegate tasks to Cursor Agent and let it work alongside you. Agent performs its work in [Composer](/composer) and is built on top of it. Make sure to read about [Composer](/composer) to best work with Agent.

## Tools

Agent has access to multiple tools, including

* Reading & Writing code
* Searching codebase
* Call [MCP](/context/model-context-protocol) servers
* Run terminal commands
* Automatic web search for up-to-date information

The reasoning capabilities of Agent enables some very powerful workflows where it can perform many consecutive actions without much supervision. When needed, Agent will automatically search the web to find relevant information, documentation, or examples to help with your task.

<Frame>
  <video src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/agent/agent-mcp-postgres.mp4" autoPlay loop muted playsInline />
</Frame>

<Tip>
  Agent can make up to 25 tool calls before stopping. When the limit is reached, you can press "Continue"
  to let Agent make more tool calls (every "Continue" call is counted as one [request](/account/usage)).
</Tip>

### Terminal

When Agent runs terminal commands, it uses VS Code's terminal profiles to determine which shell to use. It iterates through the available profiles, starting with the default one, and selects the first profile that supports command detection. This means the shell used by Agent might differ from your default system shell if another compatible terminal profile is found first.

To change which terminal profile is used:

1. Open Command Palette (`Cmd/Ctrl+Shift+P`)
2. Search for "Terminal: Select Default Profile"
3. Select your preferred terminal profile

## Yolo mode

With Yolo mode enabled, Agent can execute terminal commands by itself. This especially useful when running test suites. Instruct Agent with a task and how to verify changes (running a test), and it will continue until the task is completed.

### Guardrails

You can define guardrails and allow/deny lists for certain commands you don't want Agent to run automatically. This is done from Cursor Settings

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/agent/yolo-settings.png" style={{ padding: 32, background: "#181818" }} />
</Frame>

## Rules

You can direct the Agent with [rules](/context/rules-for-ai). They can auto attached to any Agent request based on glob patterns, or the Agent can grab one based on the rule description.

Read more about how you can [work with rules](/context/rules-for-ai)

## Use Agent

Start by opening a new Composer and enable Agent mode. From there, you can give it instructions on what work to perform.

<Frame>
  <video src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/agent/agent-toggle.mp4" autoPlay loop muted playsInline />
</Frame>

## Models

You can use `claude-3.5-sonnet`, `gpt-4o` and `o3-mini` with Agent today. We'll be adding more models soon!

## FAQ

### What's the difference between Agent and Composer?

You can toggle between Normal and Agent mode in Composer. The main difference is that Agent will think harder, use reasoning and tools to solve problems thrown at it. Normal mode (Edit) is for single-turn edits, while Ask mode helps you understand and explore your code.


# Apply
Source: https://docs.cursor.com/chat/apply

Learn how to apply, accept, or reject code suggestions from chat using Cursor's Apply feature

Cursor's `Apply` allows you to quickly integrate a codeblock suggestion from the chat into your code.

## Apply Code Blocks

To apply a code block suggestion, you can press on the play button in the top right corner of each chat code block.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/chat/apply.png" />
</Frame>

This will edit your file to incorporate the code produced by Chat. Since you can add the most context and have the most back-and-forth with the model in Chat,
we recommend Chat + Apply for more complex AI-driven code changes.

## Accept or Reject

Once you have applied a code block, you can go through the diffs and accept or reject the changes. You can also click
on the "Accept" or "Reject" buttons in the top right corner of the chat code block.

`Ctrl/⌘ Enter` to accept, `Ctrl/⌘ Backspace` to reject.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/chat/accept-apply.png" />
</Frame>


# Overview
Source: https://docs.cursor.com/chat/overview

Unified AI interface that combines Ask, Edit, and Agent modes to help write, edit, and understand code directly in your editor

Cursor's unified AI interface combines different capabilities in one seamless experience. Use `⌘I` to open it, and `⌘N` to create a new conversation. Switch between modes using the mode picker in the input box.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/composer/empty-composer-0.46.png" alt="Unified AI Interface" />
</Frame>

## Modes

The interface offers three modes that you can select from the mode picker:

<CardGroup cols={3}>
  <Card title="Agent" icon="head-side-gear" href="/chat/agent">
    Access tools and reasoning capabilities for complex tasks. Default mode. (⌘I)
  </Card>

  <Card title="Edit" icon="pen-to-square">
    Make single-turn edits to your code with precision and clarity.
  </Card>

  <Card title="Ask" icon="comments">
    Ask questions about your code, get explanations, and discover your codebase. (⌘L)
  </Card>
</CardGroup>

You can switch between modes during a conversation using the mode picker or `⌘.` shortcut. This flexibility lets you adapt to your current needs - from asking questions to making changes to using advanced tools.

## Context

You can use [@-symbols](/context/@-symbols/basic) to include relevant context in your prompts. The interface will automatically suggest relevant context based on your query.

### Autocontext (Beta)

Cursor can automatically include relevant code in your conversations using embeddings and a custom model. Instead of manually selecting context with @-symbols, it analyzes your prompt and includes the most relevant code from your codebase. Enable this feature in Settings > Features > Autocontext.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@-symbols-basics.png" alt="@ Symbol Context Menu" />
</Frame>

## Generating & Applying Changes

Cursor has a custom model trained in-house that is able to take a series of edits, as suggested by the AI model you are using, and apply it to files with 1000s of lines in seconds.

This happens automatically in both Agent and Edit modes.

In Ask mode, you can apply changes by clicking the `Apply` button in the bottom right of the diff view.

Once your changes have been made, you can review them inside your codebase, and then choose to accept or reject them, if you'd like to interate further.

<Card horizontal title="Learn More about Apply" icon="code-commit" href="/chat/apply">
  Find out more about applying changes with Cursor's custom trained model.
</Card>

## Checkpoints

For every iteration a checkpoint is created. You can return to any previous version by clicking on `checkout` near that checkpoint. This is handy if you don't like the current changes and want to revert to an earlier state.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/composer/checkpoints.png" alt="Checkpoints" />
</Frame>

## Chat History

Access previous conversations through the history. Open it from the history icon to the right of Cursor Tab. You'll see a list of past conversations which you can revisit, rename, or remove.

Open with `⌘+⌥+L` or `Ctrl+Alt+L` when the interface is focused.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/composer/history.png" alt="History Icon" />
</Frame>

## Layout

* **Pane**: A sidebar with the interface on the left and your code editor on the right.
* **Editor**: A single editor window, similar to viewing code normally. You can move it around, split it, or even place it in a separate window.
* **Floating**: A draggable window that you can position where you like

You can change this from the menu > Open as \[layout]

## Iterate on lints

Cursor gives the AI direct access to the linter within your codebase, which helps it check over it's own code, as well as existing code in your project.

When Cursor detects issues flagged by an installed linter, the AI can intelligently attempt to fix them on it's own, with the ability to iterate on the changes if needed.

This means you will always end up with clean, compliant code without having to manually check and fix any issues.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/composer/iterate-on-lint.png" alt="Iterate on Lint Fix" />
</Frame>

<Note>
  Some languages (like Rust) require files to be saved before lint errors
  appear, which may limit this feature's effectiveness in all languages.
</Note>

## FAQ

### What's the difference between the modes?

**Ask mode** helps you understand and explore code. Use it to ask questions, get explanations, and learn about your codebase.

**Edit mode** focuses on making single-turn edits to your code. It provides a workspace where you can make precise changes to your files.

**Agent mode** (default) combines both capabilities with additional tools and reasoning abilities for handling complex tasks.

### How are long conversations handled?

For long conversations, Cursor summarizes earlier messages with smaller models like `cursor-small` and `gpt-4o-mini` to keep responses fast and relevant.

This approach helps ensure that even extended conversations remain responsive and coherent, without losing track of key details from earlier exchanges.

### Can I access my conversation history on another computer?

Conversation history is stored locally on your computer and is not stored on Cursor's servers or tied to your Cursor account.

This means if you switch to a different computer, you won't have access to your previous history. You can only access your history on the computer where it was originally created.


# Overview
Source: https://docs.cursor.com/cmdk/overview

Learn how to use Cmd/Ctrl K in Cursor to generate, edit code and ask questions with the Prompt Bar

Cmd K, also known or "Ctrl K" on Windows/Linux, allows you to generate new code or edit existing code in the editor window.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cmdk/regular.png" />
</Frame>

## Prompt Bars

In Cursor, we call the bar that appears when you press `Ctrl/Cmd K` the "Prompt Bar". It works similarly to the AI input box for chat, in
which you can type normally, or use [@ symbols](context/@-symbols) to reference other context.

## Inline Generation

If no code is selected when you press `Ctrl/Cmd K`, Cursor will generate new code based on the prompt you type in the prompt bar.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cmdk/generate.png" />
</Frame>

## Inline Edits

For in-place edits, you can simply select the code you want to edit and type into the prompt bar.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cmdk/edit.png" />
</Frame>

## Follow-up Instructions

After each generation, you can further refine the prompt by adding more instructions to the prompt bar, and pressing `Enter` so the AI regenerates based on your follow-up instructions.

## Default Context

By default, Cursor will try to find different kinds of useful information to improve code generation, in addition to the manual [@ symbols](/context/@-symbols/@-files) you include.

Additional context may include related files, recently viewed files, and more. After gathering, Cursor ranks the context items by relevance to your edit/generation
and keeps the top items in context for the large language model.

## Quick Question

If you press `Option/Alt Enter` while in the prompt bar, Cursor will respond to any questions you have about the selection, and the context you have attached.

The contents of this conversation could be further used in follow-up generations, so you could simply type "do it" after Cursor comes up with a response to generate the code after a quick question.


# Terminal Cmd K
Source: https://docs.cursor.com/cmdk/terminal-cmdk

Use Ctrl/⌘ K in Cursor terminal to generate and run commands through a prompt bar interface

In the built-in Cursor terminal, you can press `Ctrl/⌘ K` to open a prompt bar on the bottom of the terminal.
This prompt bar allows you to describe your desired action in the terminal, and terminal Cmd K will generate a command.
You can accept the command by hitting `esc` or run the command immediately with `Ctrl/⌘ + Enter`.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cmdk/terminal-cmdk.png" />
</Frame>

By default, Terminal Cmd K sees your recent terminal history, your instructions, and anything else you put in the prompt bar as context.


# @Code
Source: https://docs.cursor.com/context/@-symbols/@-code

Learn to reference code using @Code symbol and keyboard shortcuts for adding code to Chat or Edit

To reference specific sections of code, you can use the `@Code` symbol.

## Code Preview

Similar to the [`@Files`](/context/@-symbols/@-files) symbol, Cursor will show a preview of the code's content so you can verify that the code you're referencing is the correct one.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@code.png" />
</Frame>

## From the Editor

Another way to add code snippets as context is to select the code you want to reference, and click on either "Add to Chat" (`Ctrl/⌘ Shift L`) or "Add to Edit" (`Ctrl/⌘ Shift K`).

These will add the selected code snippet to either the Chat input box or the currently active Cmd K prompt bar.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@code-select.png" />
</Frame>

To add a selected code to a new chat, you can press `Ctrl/⌘ L`.


# @Codebase
Source: https://docs.cursor.com/context/@-symbols/@-codebase

Learn how Chat processes codebase queries using gathering, reranking, reasoning, and generation steps

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/chat/@codebase.png" />
</Frame>

Through `@Codebase`, Chat goes through these steps until it finds the most important pieces of code to use.

* Gathering: scanning through your codebase for important files / code chunks
* Reranking: reordering the context items based on relevancy to the query
* Reasoning: thinking through a plan of using the context
* Generating: coming up with a response

Another way of submitting an advanced codebase query is to click on the dropdown next to the `Ctrl/⌘ + Enter` button and select `reranker` for the search behavior.
This is only available when `@Codebase` isn't used, otherwise `@Codebase` takes precedence.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/chat/codebase-dropdown.png" />
</Frame>


# @Cursor Rules
Source: https://docs.cursor.com/context/@-symbols/@-cursor-rules

Work with and reference Cursor rules in your project

The `@Cursor Rules` symbol provides access to [project rules](/context/rules-for-ai#project-rules-recommended) and guidelines you've set up for your project, allowing you to explicitly apply them to your context.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@cursor-rules.png" />
</Frame>


# @Definitions
Source: https://docs.cursor.com/context/@-symbols/@-definitions

Add nearby code definitions to Cmd K context using the @Definitions symbol

<Info>This feature is currently only for Cmd K.</Info>

The `@Definitions` symbol adds all nearby definitions to Cmd K as context.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@definitions.png" />
</Frame>


# @Docs
Source: https://docs.cursor.com/context/@-symbols/@-docs

Learn how to use, add, and manage custom documentation as context in Cursor using @Docs

<Frame>
  ![](https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@docs.png)
</Frame>

Cursor comes with a set of third party docs crawled, indexed, and ready to be used as context. You can access them by using the `@Docs` symbol. You can find a list of our default pre-scraped docs [here](https://raw.githubusercontent.com/getcursor/crawler/main/docs.jsonl).

## Add Custom Docs

If you want to crawl and index custom docs that are not already provided, you can do so by `@Docs` > `Add new doc`.
The following modal will appear after you've pasted in the URL of your desired doc:

<Frame>
  ![](https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@docs-add.png)
</Frame>

Cursor will then index and learn the doc, and you will be able to use it as context like any other doc. Make sure to add a trailing slash to the URL if you want to index all subpages and subdirectories

<Frame>
  ![](https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@docs-learning.png)
</Frame>

<Info>
  Cursor will automatically keep Docs indexed and will re-index them periodically to keep them up to date as they are edited or changed.
</Info>

## Manage Custom Docs

Under `Cursor Settings` > `Features` > `Docs`, you will see the docs you have added.
You can edit, delete, or add new docs here.

<Frame>
  ![](https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@docs-manage.png)
</Frame>


# @Files
Source: https://docs.cursor.com/context/@-symbols/@-files

Learn how to reference files using @ in Cursor's Chat and Cmd K, with preview and chunking features

In AI input boxes such as in Chat and Cmd K, you can reference entire files by using `@Files`.
Also, if you continue to type after `@`, you will see your file search results after the [`@Code`](/context/@-symbols/@-code) strategy.

In order to make sure the file you're referencing is the correct file, Cursor will show a preview of the file's path. This is especially useful when you have multiple files with the same name in different folders.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@file.png" />
</Frame>

### Chat Long File References

In Cursor's Chat, if the contents of a file is too long, Cursor will chunk the file into smaller chunks and rerank them based on relevance to the query.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@file-long-file.png" />
</Frame>

{/*

  commenting this out, not in product anymore afaik // ez 2025-02-09

  ### Cmd K Chunking Strategy

  For Cmd K, Cursor uses the file references differently based on the content length as well.

  - auto
  - Automatically pick one of the three reading strategies based on the file size
  - full file
  - The entire file is used as context.
  - outline
  - Cursor parses the outline of the file and uses the information as context.
  - chunks
  - Cursor chunks the file into smaller chunks and picks the most relevant one.

  <Frame>
  <img src="/images/context/@file-cmdk.png" />
  </Frame> */}

### Drag and Drop

You can drag and drop files from the primary sidebar into Composer, Chat or Cmd K to add them as context.


# @Folders
Source: https://docs.cursor.com/context/@-symbols/@-folders

Reference folders as context in Chat & Composer for enhanced AI conversations

You can reference entire folders in Cursor as context. When using `@Folders` with Agent, it attaches a list of all items in the directory, which allows the Agent to search through the contents itself. This gives Agent the ability to explore and analyze the folder's contents independently as needed for the task at hand.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@folder.png" />
</Frame>


# @Git
Source: https://docs.cursor.com/context/@-symbols/@-git

Learn how to use @Git in Cursor's Chat to analyze diffs, find bugs, and generate commit messages

<Info>Currently, `@Git` is only supported in Chat & Composer</Info>

In Cursor's Chat, you can use `@Git` to add git commits, diffs, or pull requests to your prompt.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@git.png" />
</Frame>

## Common Use Cases

One common use case for `@Git` is to allow Cursor's AI to scan the diff and look for bugs or issues that could be caused by the diff.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@git-usecase1.png" />
</Frame>

You could also use `@Diff of Working State` to generate a commit message from your current diffs.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@git-commit-message.png" />
</Frame>


# @Link
Source: https://docs.cursor.com/context/@-symbols/@-link

Use web content as context by linking to external websites and resources

## Paste Links

In order for Cursor to visit a link before paste the link and you'll see that the link is "tagged"

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@link.png" />
</Frame>

## Remove Links

By default, we automatically parse links and turn them into `@Links` in Chat.
If you prefer to have the link as plain text, click on the link and then click `Unlink`.

You can also paste without formatting (hold `Shift`) to make sure the link is not tagged

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@link-unlink.png" />
</Frame>


# @Lint Errors
Source: https://docs.cursor.com/context/@-symbols/@-lint-errors

Access and reference linting errors in your codebase

The `@Lint Errors` symbol automatically captures and provides context about any linting errors and warnings from your currently active file.

[Composer](/composer) and [Agent](/agent) can see lint errors by default

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@lint-errors.png" />
</Frame>


# @Notepads
Source: https://docs.cursor.com/context/@-symbols/@-notepads

Reference and include notepads as context in Cursor

The `@Notepads` symbol allows you to reference and include your [Notepads](/beta/notepads) as context in your conversations. Notepads are powerful context-sharing tools that bridge the gap between composers and chat interactions, allowing you to create reusable contexts for your development workflow.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@-notepads.png" />
</Frame>


# @Recent Changes
Source: https://docs.cursor.com/context/@-symbols/@-recent-changes

Access and reference recent changes in your workspace

Cursor automatically keeps track of recent changes made to your codebase. The `@Recent Changes` symbol allows you to pass these modifications as context

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@recent-changes.png" />
</Frame>


# @Summarized Composers
Source: https://docs.cursor.com/context/@-symbols/@-summarized-composers

Reference summarized versions of your previous Composer sessions as context in new conversations

When working on complex tasks in [Composer](/composer), you might want to reference context or decisions from previous conversations. The `@Summarized Composers` symbol allows you to include summarized versions of your previous Composer sessions as context.

This is particularly useful when:

* You have a long Composer session with important context you want to reference
* You're starting a new but related task and want to maintain continuity
* You want to share the reasoning or decisions from a previous session

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@-summarized-composers.png" />
</Frame>


# @Web
Source: https://docs.cursor.com/context/@-symbols/@-web

@Web command searches the internet automatically to find relevant context for Cursor queries

## `@Web`

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@web.png" />
</Frame>

With `@Web`, Cursor constructs a search query based on the query and the context you've provided, and searches the web to
find relevant information as additional context.

This can be useful to allow Cursor to find the most up-to-date information online, or to allow Cursor to scrape multiple websites in a few seconds to find the best answer, without the user having to manually search anywhere.

<Tip>When using Agent mode, Cursor will automatically search the web when it needs up-to-date information or additional context.</Tip>


# Overview
Source: https://docs.cursor.com/context/@-symbols/overview

Overview of all @ symbols available in Cursor for context and commands

In Cursors input boxes, such as in Composer, Chat and Cmd K, you can use @ symbols by typing `@`. A popup menu will appear with a list of suggestions,
and it will automatically filter to only show the most relevant suggestions based on your input.

## Keyboard Shortcuts

You can navigate through the list of suggestions using the up/down arrow keys. You can hit `Enter` to select a suggestion. If the suggestion is a category, such as `Files`,
the suggestions will be filtered to only show the most relevant items within that category.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/@-symbols-basics.png" />
</Frame>

Here's the list of all @ symbols available:

* [@Files](/context/@-symbols/@-files) - Reference specific files in your project

* [@Folders](/context/@-symbols/@-folders) - Reference entire folders for broader context

* [@Code](/context/@-symbols/@-code) - Reference specific code snippets or symbols from your codebase

* [@Docs](/context/@-symbols/@-docs) - Access documentation and guides

* [@Git](/context/@-symbols/@-git) - Access git history and changes

* [@Notepads](/context/@-symbols/@-notepads) - Access notepads

* [@Summarized Composers](/context/@-symbols/@-summarized-composers) - Work with summarized composer sessions

* [@Cursor Rules](/context/@-symbols/@-cursor-rules) - Work with cursor rules

* [@Web](/context/@-symbols/@-web) - Reference external web resources and documentation

* [@Link (paste)](/context/@-symbols/@-link) - Create links to specific code or documentation

* [@Recent Changes](/context/@-symbols/@-recent-changes) - Create links to specific code or documentation

* [@Codebase](/context/@-symbols/@-codebase) - Reference your entire codebase as context ([Chat](/chat/overview) only)

* [@Lint Errors](/context/@-symbols/@-lint-errors) - Reference lint errors ([Chat](/chat/overview) only)

* [@Definitions](/context/@-symbols/@-definitions) - Look up symbol definitions ([Cmd K](/cmdk/overview) only)
  There are also some other symbols that can be used:

* [# Files](/context/@-symbols/pill-files) - Add files to the context without referencing

* [/ Commands](/context/@-symbols/slash-commands) - Add open and active files to the context


# #Files
Source: https://docs.cursor.com/context/@-symbols/pill-files

Use # to select files and @ for context control when chatting with AI agents

Use `#` followed by a filename to focus on specific files. Combine this with `@` symbols for precise context control.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/pill-files.png" alt="# file picker" />
</Frame>


# /command
Source: https://docs.cursor.com/context/@-symbols/slash-commands

Use / to reference open editor tabs and add them as context when composing chats with the AI agent

You type `/`to quickly reference open editors and add them as context

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/slash-commands.png" alt="/ commands context" />
</Frame>

* **Open editors**: All editors tabs currently open
* **Active editors**: All editor tabs in view. This is typically when splitting the layout to show multiple editors


# Codebase Indexing
Source: https://docs.cursor.com/context/codebase-indexing

Learn how to index your codebase in Cursor for more accurate AI assistance and search results

### Index your Codebase

For better and more accurate codebase answers, you can index your codebase. Behind the scenes, Cursor
computes embeddings for each file in your codebase, and will use these to improve the accuracy of your codebase answers.

When a project is opened, each Cursor instance will initialize indexing for that workspace. After the initial indexing setup is complete, Cursor will automatically index any new files added to your workspace to keep your codebase context current.

The status of your codebase indexing is under `Cursor Settings` > `Features` > `Codebase Indexing`.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/chat/codebase-indexing.png" />
</Frame>

### Advanced Settings

By default, Cursor will index all files in your codebase.

You can also expand the `Show Settings` section to access more advanced options.
Here, you can decide whether you want to enable automatic indexing for new repositories and configure the files
that Cursor will ignore during repository indexing.

Cursor uses the same package as VS Code to handle file ignoring, which means it respects all `.gitignore` files, including those in subdirectories. You can also create a `.cursorignore` file for user-specific ignore patterns, which you may want to add to your global `.gitignore` to avoid committing it to the repository.

If you have any large content files in your project that the AI definitely doesn't need to read, [ignoring those files](/context/ignore-files) could improve the accuracy of the answers.

### Working with large monorepos

When working with large monorepos containing hundreds of thousands of files, it's important to be strategic about what gets indexed.

* Use `.cursorignore` to let each developer configure which folders and paths they work on in the monorepo
* Add `.cursorignore` to your global `.gitignore`

This allows each developer to optimize indexing for their specific work areas within the monorepo.

## FAQ

### Where can I see all codebases I have indexed?

Currently, there is no way to see a list of all codebases you have indexed. You'll need to manually check each project's indexing status by opening the project in Cursor and checking the Codebase Indexing settings.

### How do I delete all codebases?

You can either delete your Cursor account from Settings to remove all indexed codebases, or manually delete individual codebases from the Codebase Indexing settings in each project. There's currently no way to delete all codebases at once without deleting your account.


# Ignore Files
Source: https://docs.cursor.com/context/ignore-files

Learn how to use .cursorignore and .cursorindexingignore to control file access and indexing in Cursor

## Overview

Cursor provides two different ignore files to control how files are handled:

* `.cursorignore`: Makes a best-effort attempt to exclude files from both AI features and indexing
* `.cursorindexingignore`: Controls only which files are indexed for search and context (same as the old `.cursorignore`)

<Note>
  As of 0.46, `.cursorignore` attempts to exclude files from both AI access and indexing (similar to the previously unreleased `.cursorban`). For indexing-only control like the old `.cursorignore`, use `.cursorindexingignore`.
</Note>

## `.cursorignore`

<Warning>
  The `.cursorignore` is best-effort, meaning we do not guarantee that files in it are blocked from being sent up. We may have bugs that allow ignored files to be sent up in certain cases. Please let us know if you find bugs like that and we will do our best to fix!
</Warning>

The `.cursorignore` file makes a best-effort attempt to exclude files from both AI features and indexing. This is useful for:

* Attempting to exclude sensitive files from AI access and indexing
* Excluding configuration files with secrets
* Limiting access to proprietary code

Files listed in `.cursorignore` will be excluded from Cursor's AI features in a best-effort way:

* Not included in tab and chat requests
* Not included in context for AI features
* Not indexed for search or context features
* Not available through @-symbols or other context tools

## `.cursorindexingignore`

<Tip>
  `.cursorindexingignore` files automatically inherits all patterns from your `.gitignore` files
</Tip>

The `.cursorindexingignore` file only controls which files are indexed for search and context features. This provides the same indexing control as the old `.cursorignore`. Use this file when you want to:

* Exclude large generated files from indexing
* Skip indexing of binary files
* Control which parts of your codebase are searchable
* Optimize indexing performance

Important: Files in `.cursorindexingignore` can still be manually included as context or accessed by AI features - they just won't be automatically indexed or included in search results.

<Accordion title="Default Indexing Ignore Files">
  For indexing only, in addition to the files designated in your `.gitignore`, `.cursorignore` and `.cursorindexignore` files, the following files are ignored by default. Note that these default files only apply to indexing, not to other AI features.

  ```sh
  package-lock.json
  pnpm-lock.yaml
  yarn.lock
  composer.lock
  Gemfile.lock
  bun.lockb
  .env*
  .git/
  .svn/
  .hg/
  *.lock
  *.bak
  *.tmp
  *.bin
  *.exe
  *.dll
  *.so
  *.lockb
  *.qwoff
  *.isl
  *.csv
  *.pdf
  *.doc
  *.doc
  *.xls
  *.xlsx
  *.ppt
  *.pptx
  *.odt
  *.ods
  *.odp
  *.odg
  *.odf
  *.sxw
  *.sxc
  *.sxi
  *.sxd
  *.sdc
  *.jpg
  *.jpeg
  *.png
  *.gif
  *.bmp
  *.tif
  *.mp3
  *.wav
  *.wma
  *.ogg
  *.flac
  *.aac
  *.mp4
  *.mov
  *.wmv
  *.flv
  *.avi
  *.zip
  *.tar
  *.gz
  *.7z
  *.rar
  *.tgz
  *.dmg
  *.iso
  *.cue
  *.mdf
  *.mds
  *.vcd
  *.toast
  *.img
  *.apk
  *.msi
  *.cab
  *.tar.gz
  *.tar.xz
  *.tar.bz2
  *.tar.lzma
  *.tar.Z
  *.tar.sz
  *.lzma
  *.ttf
  *.otf
  *.pak
  *.woff
  *.woff2
  *.eot
  *.webp
  *.vsix
  *.rmeta
  *.rlib
  *.parquet
  *.svg
  .egg-info/
  .venv/
  node_modules/
  __pycache__/
  .next/
  .nuxt/
  .cache/
  .sass-cache/
  .gradle/
  .DS_Store/
  .ipynb_checkpoints/
  .pytest_cache/
  .mypy_cache/
  .tox/
  .git/
  .hg/
  .svn/
  .bzr/
  .lock-wscript/
  .Python/
  .jupyter/
  .history/
  .yarn/
  .yarn-cache/
  .eslintcache/
  .parcel-cache/
  .cache-loader/
  .nyc_output/
  .node_repl_history/
  .pnp.js/
  .pnp/
  ```
</Accordion>

## File Format

Both files use the same syntax as `.gitignore`. Here are some examples:

### Basic Patterns

```sh
# Ignore all files in the `dist` directory
dist/

# Ignore all `.log` files
*.log

# Ignore specific file `config.json`
config.json
```

### Advanced Patterns

Include only `*.py` files in the `app` directory:

```sh
# ignore everything
*
# do not ignore app
!app/
# do not ignore directories inside app
!app/*/
!app/**/*/
# don't ignore python files
!*.py
```

## Troubleshooting

The ignore file syntax follows `.gitignore` exactly. If you encounter issues:

1. Replace "cursorignore" with "gitignore" in your search queries
2. Check [Stack Overflow](https://stackoverflow.com/questions/tagged/gitignore) for similar patterns
3. Test patterns with `git check-ignore -v [file]` to understand matching

Common gotchas:

* Patterns are matched relative to the ignore file location
* Later patterns override earlier ones
* Directory patterns need a trailing slash
* Negation patterns (`!`) must negate a previous pattern


# Model Context Protocol
Source: https://docs.cursor.com/context/model-context-protocol

Learn how to add and use custom MCP tools within Cursor feature

## What is MCP?

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) is an open protocol that standardizes how applications provide context and tools to LLMs. Think of MCP as a plugin system for Cursor - it allows you to extend the Agent's capabilities by connecting it to various data sources and tools through standardized interfaces.

<Card title="Learn More About MCP" icon="book-open" horizontal href="https://modelcontextprotocol.io/introduction">
  Visit the official MCP documentation to understand the protocol in depth
</Card>

### Uses

MCP allows you to connect Cursor to external systems and data sources. This means you can integrate Cursor with your existing tools and infrastructure, instead of having to tell Cursor what the structure of your project is outside of the code itself.

MCP servers can be **written in any language** that can print to `stdout` or serve an HTTP endpoint. This flexibility allows you to implement MCP servers using your preferred programming language and technology stack very quickly.

#### Examples

<Card title="Databases" icon="database">
  Allow Cursor to query your databases directly, instead of manually feeding in schemas, or manipulating the data yourself.
</Card>

<CardGroup cols="2">
  <Card title="Notion" icon="book">
    Read data out of notion to guide cursor to implement a feature
  </Card>

  <Card title="GitHub" icon="github">
    Let Cursor create PRs, create branches, find code, etc
  </Card>

  <Card title="Memory" icon="memory">
    Allow Cursor to remember and recall information while you work
  </Card>

  <Card title="Stripe" icon="credit-card">
    Allow Cursor to create customers, manage subscriptions, etc
  </Card>
</CardGroup>

### Architecture

MCP servers are lightweight programs that expose specific capabilities through the standardized protocol. They act as intermediaries between Cursor and external tools or data sources.

Cursor supports two transport types for MCP servers:

<CardGroup cols="2">
  <Card title="💻 stdio Transport">
    \- Runs on your **local machine**

    \- Managed automatically by Cursor

    \- Communicates directly via `stdout`

    \- Only accessible by you locally

    **Input:** Valid shell command that is ran by Cursor automatically
  </Card>

  <Card title="🌐 SSE Transport">
    \- Can run **locally or remotely**

    \- Managed and run by you

    \- Communicates **over the network**

    \- Can be **shared** across machines

    **Input:** URL to the `/sse` endpoint of an MCP server external to Cursor
  </Card>
</CardGroup>

<Tip>
  For stdio servers, the command should be a valid shell command that Cursor can run.

  For SSE servers, the URL should be the URL of the SSE endpoint, e.g. `http://example.com:8000/sse`.
</Tip>

Each transport type has different use cases, with stdio being simpler for local development and SSE offering more flexibility for distributed teams.

## Configuring MCP Servers

The MCP configuration file uses a JSON format with the following structure:

<CodeGroup>
  ```json CLI Server - Node.js
  // This example demonstrated an MCP server using the stdio format
  // Cursor automatically runs this process for you
  // This uses a Node.js server, ran with `npx`
  {
    "mcpServers": {
      "server-name": {
        "command": "npx",
        "args": ["-y", "mcp-server"],
        "env": {
          "API_KEY": "value"
        }
      }
    }
  }
  ```

  ```json CLI Server - Python
  // This example demonstrated an MCP server using the stdio format
  // Cursor automatically runs this process for you
  // This uses a Python server, ran with `python`
  {
    "mcpServers": {
      "server-name": {
        "command": "python",
        "args": ["mcp-server.py"],
        "env": {
          "API_KEY": "value"
        }
      }
    }
  }
  ```

  ```json SSE Server
  // This example demonstrated an MCP server using the SSE format
  // The user should manually setup and run the server
  // This could be networked, to allow others to access it too
  {
    "mcpServers": {
      "server-name": {
        "url": "http://localhost:3000/sse",
        "env": {
          "API_KEY": "value"
        }
      }
    }
  }
  ```
</CodeGroup>

<Tip>
  The `env` field allows you to specify environment variables that will be available to your MCP server process. This is particularly useful for managing API keys and other sensitive configuration.
</Tip>

### Configuration Locations

You can place this configuration in two locations, depending on your use case:

<Card title="Project Configuration" icon="folder-tree">
  For tools specific to a project, create a `.cursor/mcp.json` file in your project directory. This allows you to define MCP servers that are only available within that specific project.
</Card>

<Card title="Global Configuration" icon="globe">
  For tools that you want to use across all projects, create a `\~/.cursor/mcp.json` file in your home directory. This makes MCP servers available in all your Cursor workspaces.
</Card>

## Using MCP Tools in Agent

The Composer Agent will **automatically** use any MCP tools that are listed under `Available Tools` on the MCP settings page if it determines them to be relevant.
To prompt tool usage intentionally, simply tell the agent to use the tool, referring to it either by name or by description.

### Tool Approval

By default, when Agent wants to use an MCP tool, it will display a message asking for your approval. You can use the arrow next to the tool name to expand the message, and see what arguments the Agent is calling the tool with.

<Frame>
  ![](https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/advanced/mcp-mars-request.png)
</Frame>

#### Yolo Mode

You can enable Yolo mode to allow Agent to automatically run MCP tools without requiring approval, similar to how terminal commands are executed. Read more about Yolo mode and how to enable it [here](/agent#yolo-mode).

### Tool Response

When a tool is used Cursor will display the response in the chat.
This image shows the response from the sample tool, as well as expanded views of the tool call arguments and the tool call response.

<Frame>
  ![](https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/advanced/mcp-mars-response.png)
</Frame>

## Limitations

MCP is a very new protocol and is still in active development. There are some known caveats to be aware of:

<AccordionGroup>
  <Accordion title="Tool Quantity">
    Some MCP servers, or user's with many MCP servers active, may have many tools available for Cursor to use. Currently, Cursor will only send the first 40 tools to the Agent.
  </Accordion>

  <Accordion title="Remote Development">
    Cursor directly communicates with MCP servers from your local machine, either directly through `stdio` or via the network using `sse`. Therefore, MCP servers may not work properly when accessing Cursor over SSH or other development environments. We are hoping to improve this in future releases.
  </Accordion>

  <Accordion title="MCP Resources">
    MCP servers offer two main capabilities: tools and resources. Tools are availabe in Cursor today, and allow Cursor to execute the tools offered by an MCP server, and use the output in it's further steps. However, resources are not yet supported in Cursor. We are hoping to add resource support in future releases.
  </Accordion>
</AccordionGroup>


# Rules for AI
Source: https://docs.cursor.com/context/rules-for-ai

Learn how to customize AI behavior in Cursor using project-specific and global rules

Using rules in Cursor you can control the behavior of the underlying model. You can think of it as instructions and/or a system prompt for LLMs.

Inside Cursor, we have two main ways to customize the behavior of the AI to suit your needs:

<CardGroup cols={2}>
  <Card title="Project Rules" icon="folder-tree">
    Rules specific to a project, stored in the `.cursor/rules` directory. They are automatically included when matching files are referenced.
  </Card>

  <Card title="Global Rules" icon="globe">
    Rules applied globally to all projects, configured in the `Cursor Settings` > `General` > `Rules for AI` section.
  </Card>
</CardGroup>

Learn more about how to use them in the following sections.

## Project Rules (recommended)

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/project-rules.png" />
</Frame>

Project rules offer a powerful and flexible system with path specific configurations. Project rules are stored in the `.cursor/rules` directory and provide granular control over AI behavior in different parts of your project.

Here's how they work

* **Semantic Descriptions**: Each rule can include a description of when it should be applied
* **File Pattern Matching**: Use glob patterns to specify which files/folders the rule applies to
* **Automatic Attachment**: Rules can be automatically included when matching files are referenced
* **Reference files**: Use @file in your project rules to include them as context when the rule is applied.

<Tip>
  You can reference rule files using @file, allowing you to chain multiple rules
  together
</Tip>

You can create a new rule using the command palette with `Cmd + Shift + P` > `New Cursor Rule`. By using project rules you also get the benefit of version control since it's just a file

Example use cases:

* Framework-specific rules for certain file types (e.g., SolidJS preferences for `.tsx` files)
* Special handling for auto-generated files (e.g., `.proto` files)
* Custom UI development patterns
* Code style and architecture preferences for specific folders

## Global Rules

Global rules can be added by modifying the `Rules for AI` section under `Cursor Settings` > `General` > `Rules for AI`. This is useful if you want to specify rules that should always be included in every project like output language, length of responses etc.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/context/rules-for-ai.png" />
</Frame>

## `.cursorrules`

For backward compatibility, you can still use a `.cursorrules` file in the root of your project. We will eventually remove .cursorrules in the future, so we recommend migrating to the new Project Rules system for better flexibility and control.


# FAQ
Source: https://docs.cursor.com/faq

Frequently asked questions about Cursor's features, language support, models, and usage

<AccordionGroup>
  <Accordion title="What programming languages does Cursor support?">
    While Cursor works with any programming language, it excels with Python and JavaScript/TypeScript due to extensive model training data. It also performs well with Swift, C, and Rust. You can enhance support for any language by adding relevant documentation to your project.
  </Accordion>

  <Accordion title="How do you keep the AI models up-to-date with latest documentation?">
    Cursor leverages powerful foundational models like Claude 3.5 and GPT-4. For the most current library information, you can use our [@web](/context/@-symbols/@-web) search feature. Since core language concepts rarely change dramatically, the models maintain their effectiveness over time.
  </Accordion>

  <Accordion title="What is the purpose of the MCP server?">
    The MCP server serves as a bridge for bringing external context into Cursor. It enables connections to services like Google Drive and Notion, helping you incorporate documentation and requirements from these sources into your workflow.
  </Accordion>

  <Accordion title="Are there size limitations for project indexing?">
    Projects are limited to 10,000 files by default, though this can be adjusted if needed. To optimize indexing performance, you can use `.cursorignore` to exclude unnecessary files from the indexing process.
  </Accordion>

  <Accordion title="How do I share context between multiple repositories?">
    Currently, the simplest method is to place related repositories in the same directory and launch Cursor from there. We're actively developing improved support for managing multiple project folders.
  </Accordion>

  <Accordion title="How do Cursor updates work?">
    Cursor is frequently updated with new features and improvements. You can find the latest changes and updates in our changelog at [cursor.com/changelog](https://cursor.com/changelog). We regularly release updates to enhance your experience and add new capabilities.
  </Accordion>

  <Accordion title="Why haven't I received the latest release yet?">
    We roll out new releases gradually over multiple days to ensure stability. If you haven't received an update yet, you can expect it to show up soon. You can also manually check for updates by opening the Command Palette (Cmd/Ctrl + Shift + P) and typing "Attempt Update".
  </Accordion>
</AccordionGroup>

<AccordionGroup>
  <Accordion title="How can I delete my data?">
    You can delete your account and all associated data by going to your [Dashboard](https://cursor.com/settings) and clicking the "Delete Account" button
  </Accordion>
</AccordionGroup>

**Additional resources**

* [Common Issues](/troubleshooting/common-issues) - Solutions to frequently encountered problems
* [Keyboard Shortcuts](/kbd) - Complete list of keybindings and shortcuts


# Installation
Source: https://docs.cursor.com/get-started/installation

Learn how to install, set up, and use Cursor with AI features like Chat, Tab, and Composer

## Installation

1. Visit [cursor.com](https://cursor.com) and click the "Download" button
   <Tip>
     The installer for your operating system will automatically download
   </Tip>
2. Run the installer and wait for installation to complete
3. Launch Cursor via the Desktop shortcut or from the Applications menu

## Setting up

On your first launch, you'll be prompted to configure a few settings to ensure you get up and running quickly!

<CardGroup cols={2}>
  <Card title="Keyboard shortcuts" icon="keyboard">
    If you are coming from a different editor, you can choose the default shortcuts you want to start with, so they are as familiar as possible.
  </Card>

  <Card title="Language" icon="language">
    If you want the AI to talk to you in a different language, you can enter the name of the language you want to use. This can be configured further in the [Rules for AI](/context/rules-for-ai).
  </Card>

  <Card title="Codebase Indexing" icon="database">
    Cursor indexes your codebase locally to provide better AI suggestions. Learn more in [Codebase Indexing](/context/codebase-indexing).
  </Card>

  <Card title="CLI Shortcuts" icon="terminal">
    You can choose to install `cursor` and `code` commands to launch Cursor from the terminal.
  </Card>
</CardGroup>

After configuring these settings, you will have the option to import your VS Code settings in one click. If you accept, this will import your extensions, themes, user settings, and keyboard shortcuts into Cursor, so you can get started right away.

Next, you'll be asked about your data preference. To learn more about this, and make an informed decision, read more about our dedicated [privacy page](/account/privacy)

## Logging In

1. Once you click **"Sign Up"** or **"Login"**, you'll be prompted to setup an account.
   You can choose to use your email, or sign up with Google or GitHub.
2. Once signed in, you'll be sent back to Cursor and you'll be **ready to start coding!**

<Tip>
  If you're using Cursor for the first time, you'll get a 14-day free trial of
  Cursor Pro as soon as you sign up. Learn more about Cursor Pro on our
  [website](https://cursor.com/features).
</Tip>

## Migrating from other editors

While Cursor is built on top the same core as VS Code, there are some key differences that you should be aware of. Additionally, for those coming from other editors, you may not be familiar with the structure of Cursor.

To help you get started, we've put together a guide to help you migrate from other editors.

<CardGroup cols={2}>
  <Card horizontal title="Migrating from VSCode" icon="code-compare" href="/guides/migration/vscode" />

  <Card horizontal title="Migrating from JetBrains" icon="laptop-code" href="/guides/migration/jetbrains" />
</CardGroup>

We hope to add more migration guides for other editors soon!

## Next Steps

Now that you've installed Cursor, head over to the [Introduction](/get-started/introduction) to learn about Cursor's features and how to get started using them.


# Introduction
Source: https://docs.cursor.com/get-started/introduction

Learn how to use Cursor's core features: Tab completion, Chat for code queries, and Agent for assistance

## Overview

Cursor is a powerful AI-first code editor that enhances your development workflow. After [installation](/get-started/installation), you'll have access to these core features that work together seamlessly to make you more productive:

* **AI-powered code completion** that understands your codebase and provides context-aware suggestions
* **Conversation interface** for exploring, understanding, and modifying code with Ask, Edit, and Agent modes
* **Intelligent tools** for handling complex development tasks

## Getting Started

Start exploring Cursor's AI-powered features:

* **Tab**: Press `Tab` for intelligent code completions
* **CMD-K**: Use `Cmd/Ctrl + K` for inline code edits
* **Composer**: Use `⌘I` to open the unified AI interface with Ask, Edit, and Agent modes

## Settings

Cursor is designed to be flexible and customizable. You can configure it in two ways:

### Cursor Settings

* Access via gear icon, `Cmd/Ctrl + Shift + J`, or Command Palette > `Cursor Settings`
* Configure AI features and Cursor-specific preferences

### Editor Settings

* Access via Command Palette (`Cmd/Ctrl + Shift + P`) > `"Preferences: Open Settings (UI)"`
* Adjust editor behavior and appearance

Let's explore each feature in detail:

### Tab

Tab completion in Cursor is powered by advanced AI models that understand your code context. As you type, you'll receive intelligent suggestions that:

* Complete your current line of code
* Suggest entire function implementations
* Help with common patterns and boilerplate
* Adapt to your coding style over time

Learn more about [Tab features](/tab/overview) or see how it [compares to GitHub Copilot](/tab/from-gh-copilot).

### Composer

Cursor provides a unified AI interface with three modes that seamlessly work together:

**Ask Mode**

* Ask questions about specific code sections
* Get explanations of complex functions
* Find code patterns and examples
* Discover and understand your codebase

**Edit Mode**

* Make single-turn edits to your code
* Apply targeted changes with precision
* Review and apply changes with confidence
* Work with files individually

**Agent Mode (Default)**

* Make codebase-wide changes and refactoring
* Implement new features from requirements
* Debug complex issues across multiple files
* Generate tests and documentation
* Maintain consistency across your entire project

Switch between modes during conversations to best suit your current task. Learn more about the [unified AI interface](/composer) or explore specific capabilities in [Agent mode](/agent).

### Context

Context is the foundation that powers all of Cursor's AI features. Here's how it works:

* When you open a codebase, we automatically [index your code](/context/codebase-indexing) to make it available as context
* Use [@-symbols](/context/@-symbols/basic) to precisely control what context you provide:
  * [@files](/context/@-symbols/@-files) and [@folders](/context/@-symbols/@-folders) for specific paths
  * [@web](/context/@-symbols/@-web) for external documentation
  * [@git](/context/@-symbols/@-git) for version control context
* Configure [rules for AI](/context/rules-for-ai) to customize behavior
* Set up [MCP](/context/model-context-protocol) for external context providers

## Models

You can see all the models we support and their pricing on the [models page](/settings/models). Configure your [API keys](/settings/api-keys) and [preferences](/settings/preferences) in Settings.

## Usage

It's highly recommended to read about [usage](/account/usage) and [plans](/account/plans) to understand how Cursor pricing works. Check out our [pricing page](/account/pricing) for more details about plans and features.

Need help? Visit our [troubleshooting guide](/troubleshooting/troubleshooting-guide) or join our [community forum](/resources/forum).


# Welcome to Cursor
Source: https://docs.cursor.com/get-started/welcome

AI-powered IDE with Chat, Tab, and Agent for intelligent code development

Cursor is a new, intelligent IDE, empowered by seamless integrations with AI.
Built upon VSCode, Cursor is quick to learn, but can make you extraordinarily productive.

## Get Started

If you're new to Cursor, you can get started using the guides below.

<CardGroup cols={1}>
  <Card horizontal title="Introduction" icon="book-open" href="/get-started/introduction">
    <div className="text-sm">
      Learn about Cursor's core features and concepts.
    </div>
  </Card>

  <Card horizontal title="Installation" icon="download" href="/get-started/installation">
    <div className="text-sm">
      Get started with Cursor in minutes, by downloading and installing for your
      platform.
    </div>
  </Card>
</CardGroup>

## The Editor

Cursor has a number of core features that will seamlessly integrate with your workflow. <br />
Use the links below to learn more about what Cursor can do.

<CardGroup cols={2}>
  <Card title="Tab" icon="arrow-right" href="/tab/overview">
    <div className="text-sm">
      Smart code completion that learns from you! Make multi-line edits, fix
      errors you might have missed, and predict your next action.
    </div>
  </Card>

  <Card title="Agent" icon="pen-to-square" href="/chat/agent">
    <div className="text-sm">
      Your AI pair programmer for complex code changes. Make large-scale edits
      with precise context control and automatic fixes.
    </div>
  </Card>

  <Card title="Cmd-K" icon="code" href="/cmdk/overview">
    <div className="text-sm">
      Quick inline code editing and generation. Perfect for making precise
      changes without breaking your flow.
    </div>
  </Card>

  <Card title="Chat" icon="message" href="/chat/overview">
    <div className="text-sm">
      Context-aware AI assistant that understands your codebase. Get answers and
      apply code changes directly in your editor.
    </div>
  </Card>
</CardGroup>

## Where did Cursor come from?

Code is fundamentally text, and our tools for writing it have evolved from simple text editors into increasingly intelligent development environments.

Initially, we had features like syntax highlighting, to make code more readable. Then, we had features like autocomplete, to make code more efficient.

These have been the standard for a long time, but with Cursor, we're re-inventing how you work with code.

## How does it work?

Cursor provides the user with a few fundamental features that are only made possible by the development of LLMs (Large Language Models).

## How do I get started?

You can download Cursor from the [Cursor website](https://www.cursor.com) for your platform of choice. Being based on VS Code, it's extremely easy to get started, and all the AI features are opt-in.

You can also have Cursor import all your VS Code extensions and settings in one-click. To help you try Cursor, we have a 14-day free trial our of Pro plan, with no credit card required!

<CardGroup cols={2}>
  <Card title="Get Started with Installation" icon="download" href="/get-started/installation" />

  <Card title="Setup Your Business" icon="users" href="/account/teams/setup" />
</CardGroup>

## Community and Resources

To help you make the most of Cursor, we have a community of users and resources that you can use to get help and share your own experiences.

<CardGroup cols={2}>
  <Card title="Forum" icon="message" href="https://forum.cursor.com">
    For **technical queries**, and to share your own experiences, please visit our dedicated forum, to talk to **members of the team** and **other Cursor users**.
  </Card>

  <Card title="Support" icon="headset" href="mailto:hi@cursor.com">
    For other queries, including accounts, billing, and sales, please email our support team. **Due to high demand, response times may be slower than the forum.**
  </Card>
</CardGroup>


# Java
Source: https://docs.cursor.com/guides/languages/java

Migrate from JetBrains IDEs to Cursor in minutes

This guide will help you configure Cursor for Java development, including setting up the JDK, installing necessary extensions, debugging, running Java applications, and integrating build tools like Maven and Gradle. It also covers workflow features similar to IntelliJ or VS Code.

<Note>
  Before starting, ensure you have Cursor installed and updated to the latest version.
</Note>

## Setting up Java for Cursor

### Java Installation

Before setting up Cursor itself, you will need Java installed on your machine.

<Warning>
  Cursor does not ship with a Java compiler, so you need to install a JDK if you haven't already.
</Warning>

<CardGroup cols={1}>
  <Card title="Windows Installation" icon="windows">
    Download and install a JDK (e.g., OpenJDK, Oracle JDK, Microsoft Build of OpenJDK).<br />
    Set JAVA\_HOME and add JAVA\_HOME\bin to your PATH.
  </Card>

  <Card title="macOS Installation" icon="apple">
    Install via Homebrew (`brew install openjdk`) or download an installer.<br />
    Ensure JAVA\_HOME points to the installed JDK.
  </Card>

  <Card title="Linux Installation" icon="linux">
    Use your package manager (`sudo apt install openjdk-17-jdk` or equivalent) or install via SDKMAN.
  </Card>
</CardGroup>

To check installation, run:

```bash
java -version
javac -version
```

<Info>
  If Cursor does not detect your JDK, configure it manually in settings.json:
</Info>

```json
{
  "java.jdt.ls.java.home": "/path/to/jdk",
  "java.configuration.runtimes": [
    {
      "name": "JavaSE-17",
      "path": "/path/to/jdk-17",
      "default": true
    }
  ]
}
```

<Warning>
  Restart Cursor to apply changes.
</Warning>

### Cursor Setup

<Info>
  Cursor supports VS Code extensions. Install the following manually:
</Info>

<CardGroup cols={2}>
  <Card title="Extension Pack for Java" icon="java" href="https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack">
    Includes Java language support, debugger, test runner, Maven support, and project manager
  </Card>

  <Card title="Gradle for Java" icon="gears" href="https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-gradle">
    Essential for working with Gradle build system
  </Card>

  <Card title="Spring Boot Extension Pack" icon="leaf" href="https://marketplace.visualstudio.com/items?itemName=Pivotal.vscode-boot-dev-pack">
    Required for Spring Boot development
  </Card>

  <Card title="JavaFX Support" icon="window" href="https://marketplace.visualstudio.com/items?itemName=dlsc-oss.vscode-javafx">
    Necessary for JavaFX application development
  </Card>
</CardGroup>

### Configure Build Tools

#### Maven

Ensure Maven is installed (`mvn -version`). Install from [maven.apache.org](https://maven.apache.org/download.cgi) if needed:

1. Download the binary archive
2. Extract to desired location
3. Set MAVEN\_HOME environment variable to the extracted folder
4. Add %MAVEN\_HOME%\bin (Windows) or \$MAVEN\_HOME/bin (Unix) to PATH

#### Gradle

Ensure Gradle is installed (`gradle -version`). Install from [gradle.org](https://gradle.org/install/) if needed:

1. Download the binary distribution
2. Extract to desired location
3. Set GRADLE\_HOME environment variable to the extracted folder
4. Add %GRADLE\_HOME%\bin (Windows) or \$GRADLE\_HOME/bin (Unix) to PATH

Alternatively, use the Gradle Wrapper which will automatically download and use the correct Gradle version:

## Running and Debugging

Now you are all set up, it's time to run and debug your Java code.
Depending on your needs, you can use the following methods:

<CardGroup cols={2}>
  <Card title="Run" icon="play">
    Click the "Run" link that appears above any main method to quickly execute your program
  </Card>

  <Card title="Debug" icon="bug">
    Open the Run and Debug sidebar panel and use the Run button to start your application
  </Card>
</CardGroup>

<CardGroup cols={1}>
  <Card title="Terminal" icon="terminal">
    Execute from command line using Maven or Gradlecommands
  </Card>

  <Card title="Spring Boot" icon="leaf">
    Launch Spring Boot applications directly from the Spring Boot Dashboard extension
  </Card>
</CardGroup>

## Java x Cursor Workflow

Cursor's AI-powered features can significantly enhance your Java development workflow. Here are some ways to leverage Cursor's capabilities specifically for Java:

<CardGroup cols={2}>
  <Card title="Tab Completion" icon="arrow-right">
    <div className="text-sm">
      Smart completions for methods, signatures, and Java boilerplate like getters/setters.
    </div>
  </Card>

  <Card title="Agent Mode" icon="pen-to-square">
    <div className="text-sm">
      Implement design patterns, refactor code, or generate classes with proper inheritance.
    </div>
  </Card>

  <Card title="Cmd-K" icon="code">
    <div className="text-sm">
      Quick inline edits to methods, fix errors, or generate unit tests without breaking flow.
    </div>
  </Card>

  <Card title="Chat" icon="message">
    <div className="text-sm">
      Get help with Java concepts, debug exceptions, or understand framework features.
    </div>
  </Card>
</CardGroup>

### Example Workflows

1. **Generate Java Boilerplate**\
   Use [Tab completion](/tab/overview) to quickly generate constructors, getters/setters, equals/hashCode methods, and other repetitive Java patterns.

2. **Debug Complex Java Exceptions**\
   When facing a cryptic Java stack trace, highlight it and use [Ask](/chat/overview) to explain the root cause and suggest potential fixes.

3. **Refactor Legacy Java Code**\
   Use [Agent mode](/agent) to modernize older Java code - convert anonymous classes to lambdas, upgrade to newer Java language features, or implement design patterns.

4. **Frameworks Development**\
   Add your documentation to Cursor's context with @docs, and generate framework-specific code throughout Cursor.


# JavaScript & TypeScript
Source: https://docs.cursor.com/guides/languages/javascript

Learn how to setup Cursor for JavaScript & TypeScript

Welcome to JavaScript and TypeScript development in Cursor! The editor provides exceptional support for JS/TS development through its extension ecosystem. Here's what you need to know to get the most out of Cursor.

## Essential Extensions

While Cursor works great with any extensions you prefer, we recommend these for those just getting started:

* **ESLint** - Required for Cursor's AI-powered lint fixing capabilities
* **JavaScript and TypeScript Language Features** - Enhanced language support and IntelliSense
* **Path Intellisense** - Intelligent path completion for file paths

## Cursor Features

Cursor enhances your existing JavaScript/TypeScript workflow with:

* **Tab Completions**: Context-aware code completions that understand your project structure
* **Automatic Imports**: Tab can automatically import libraries as soon as you use them
* **Inline Editing**: Use `CMD+K` on any line to edit with perfect syntax
* **Composer Guidance**: Plan and edit your code across multiple files with the Composer

### Framework Intelligence with @Docs

Cursor's @Docs feature lets you supercharge your JavaScript development by adding custom documentation sources that the AI can reference. Add documentation from MDN, Node.js, or your favorite framework to get more accurate and contextual code suggestions.

<Card title="Learn more about @Docs" icon="book" href="/context/@-symbols/@-docs">
  Discover how to add and manage custom documentation sources in Cursor.
</Card>

### Automatic Linting Resolution

One of Cursor's standout features is its seamless integration with Linter extensions.
Ensure you have a linter, like ESLint, setup, and enable the 'Iterate on Lints' setting.

Then, when using the Agent mode in Composer, once the AI has attempted to answer your query, and has made any code changes, it will automatically read the output of the linter and will attempt to fix any lint errors it might not have known about.

## Framework Support

Cursor works seamlessly with all major JavaScript frameworks and libraries, such as:

### React & Next.js

* Full JSX/TSX support with intelligent component suggestions
* Server component and API route intelligence for Next.js
* Recommended: [**React Developer Tools**](https://marketplace.visualstudio.com/items?itemName=msjsdiag.vscode-react-native) extension

### Vue.js

* Template syntax support with Volar integration
* Component auto-completion and type checking
* Recommended: [**Vue Language Features**](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

### Angular

* Template validation and TypeScript decorator support
* Component and service generation
* Recommended: [**Angular Language Service**](https://marketplace.visualstudio.com/items?itemName=Angular.ng-template)

### Svelte

* Component syntax highlighting and intelligent completions
* Reactive statement and store suggestions
* Recommended: [**Svelte for VS Code**](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode)

### Backend Frameworks (Express/NestJS)

* Route and middleware intelligence
* TypeScript decorator support for NestJS
* API testing tools integration

Remember, Cursor's AI features work well with all these frameworks, understanding their patterns and best practices to provide relevant suggestions. The AI can help with everything from component creation to complex refactoring tasks, while respecting your project's existing patterns.


# Python
Source: https://docs.cursor.com/guides/languages/python

A comprehensive guide to setting up the perfect Python development environment in Cursor

<Note>This guide was heavily inspired by [Jack Fields](https://x.com/OrdinaryInds) and his [article](https://medium.com/ordinaryindustries/the-ultimate-vs-code-setup-for-python-538026b34d94) about setting up VS Code for Python development. Please check his article for more details.</Note>

## Prerequisites

Before we begin, ensure you have:

* [Python](https://python.org) installed (3.8 or higher recommended)
* [Git](https://git-scm.com/) for version control
* Cursor installed and updated to the latest version

## Essential Extensions

### Core Python Support

The following extensions setup Cursor to be fully featured for Python development. These provide you with syntax highlighting, linting, debugging and unit testing.

<CardGroup cols={2}>
  <Card title="Python" icon="python" href="https://marketplace.visualstudio.com/items?itemName=ms-python.python">
    Core language support from Microsoft
  </Card>

  <Card title="Pylance" icon="bolt" href="https://marketplace.visualstudio.com/items?itemName=ms-python.vscode-pylance">
    Fast Python language server
  </Card>

  <Card title="Python Debugger" icon="bug" href="https://marketplace.visualstudio.com/items?itemName=ms-python.debugpy">
    Enhanced debugging capabilities
  </Card>

  <Card title="Python Test Explorer" icon="vial" href="https://marketplace.visualstudio.com/items?itemName=LittleFoxTeam.vscode-python-test-adapter">
    Visual testing interface
  </Card>
</CardGroup>

### Code Quality Tools

<CardGroup cols={2}>
  <Card title="Python Docstring Generator" icon="file-lines" href="https://marketplace.visualstudio.com/items?itemName=njpwerner.autodocstring">
    Automatic documentation generation
  </Card>

  <Card title="Python Path" icon="folder-tree" href="https://marketplace.visualstudio.com/items?itemName=mgesbert.python-path">
    Manage Python paths
  </Card>

  <Card title="Python Environment Manager" icon="gears" href="https://marketplace.visualstudio.com/items?itemName=ms-python.vscode-python-envs">
    Virtual environment management
  </Card>

  <Card title="Python Snippets" icon="code" href="https://marketplace.visualstudio.com/items?itemName=EricSia.pythonsnippets3">
    Code snippets for Python
  </Card>
</CardGroup>

### Advanced Python Tooling

While the above extensions have previously been the most popular extensions for Python development in Cursor, we've also added some additional extensions that can help you get the most out of your Python development.

#### `uv` - Python Environment Manager

[uv](https://github.com/astral-sh/uv) is a modern Python package manager that can be used to create and manage virtual environments, in addition to replacing pip as the default package manager.

To install uv, run the following command in your terminal:

```bash
pip install uv
```

#### `ruff` - Python Linter and Formatter

[Ruff](https://docs.astral.sh/ruff/) is a modern Python linter and formatter that can be used to check for programming errors, helps enforce coding standards, and can suggest refactoring. It can be used alongside Black for code formatting.

To install Ruff, run the following command in your terminal:

```bash
pip install ruff
```

## Cursor Configuration

### 1. Python Interpreter

Configure your Python interpreter in Cursor:

1. Open Command Palette (Cmd/Ctrl + Shift + P)
2. Search for "Python: Select Interpreter"
3. Choose your Python interpreter (or virtual environment if you're using one)

### 2. Code Formatting

Set up automatic code formatting with Black:

<Note>Black is a code formatter that automatically formats your code to follow a consistent style. It requires zero configuration and is widely adopted in the Python community.</Note>

To install Black, run the following command in your terminal:

```bash
pip install black
```

Then, configure Cursor to use Black for code formatting, by adding the following to your `settings.json` file:

```json
{
    "python.formatting.provider": "black",
    "editor.formatOnSave": true,
    "python.formatting.blackArgs": [
        "--line-length",
        "88"
    ]
}
```

### 3. Linting

We can use PyLint to check for programming errors, helps enforce coding standards, and can suggest refactoring.

To install PyLint, run the following command in your terminal:

```bash
pip install pylint
```

```json
{
    "python.linting.enabled": true,
    "python.linting.pylintEnabled": true,
    "python.linting.lintOnSave": true
}
```

### 4. Type Checking

In addition to linting, we can use MyPy to check for type errors.

To install MyPy, run the following command in your terminal:

```bash
pip install mypy
```

```json
{
    "python.linting.mypyEnabled": true
}
```

## Debugging

Cursor provides powerful debugging capabilities for Python:

1. Set breakpoints by clicking the gutter
2. Use the Debug panel (Cmd/Ctrl + Shift + D)
3. Configure `launch.json` for custom debug configurations

## Recommended Features

<CardGroup cols={3}>
  <Card title="Tab Completion" icon="wand-magic-sparkles" href="/tab/overview">
    Intelligent code suggestions that understand your actions
  </Card>

  <Card title="Chat" icon="comments" href="/chat/overview">
    Explore and understand code through natural conversations
  </Card>

  <Card title="Agent" icon="robot" href="/agent">
    Handle complex development tasks with AI assistance
  </Card>

  <Card title="Context" icon="network-wired" href="/context/model-context-protocol">
    Pull in context from 3rd party systems
  </Card>

  <Card title="Auto-Imports" icon="file-import" href="/tab/auto-import">
    Automatically import modules as you code
  </Card>

  <Card title="AI Review" icon="check-double" href="/tab/overview#quality">
    Cursor constantly reviews your code with AI
  </Card>
</CardGroup>

## Framework Support

Cursor works seamlessly with popular Python frameworks:

* **Web Frameworks**: Django, Flask, FastAPI
* **Data Science**: Jupyter, NumPy, Pandas
* **Machine Learning**: TensorFlow, PyTorch, scikit-learn
* **Testing**: pytest, unittest
* **API**: requests, aiohttp
* **Database**: SQLAlchemy, psycopg2


# iOS & macOS (Swift)
Source: https://docs.cursor.com/guides/languages/swift

Learn how to setup Cursor for Swift

Welcome to Swift development in Cursor! Whether you're building iOS apps, macOS applications, or server-side Swift projects, we've got you covered. This guide will help you set up your Swift environment in Cursor, starting with the basics and moving on to more advanced features.

## Basic Workflow

The simplest way to use Cursor with Swift is to treat it as your primary code editor while still relying on Xcode for building and running your apps. You'll get great features like:

* Smart code completion
* AI-powered coding assistance (try [CMD+K](/cmdk/overview) on any line)
* Quick access to documentation with [@Docs](/context/@-symbols/@-docs)
* Syntax highlighting
* Basic code navigation

When you need to build or run your app, simply switch to Xcode. This workflow is perfect for developers who want to leverage Cursor's AI capabilities while sticking to familiar Xcode tools for debugging and deployment.

### Hot Reloading

When using Xcode workspaces or projects (instead of opening a folder directly in Xcode), Xcode can often ignore changes to your files that were made in Cursor, or outside of Xcode in general.

While you can open the folder in Xcode to resolve this, you may need to use a project for your Swift development workflow.

A great solution to this is to use [Inject](https://github.com/krzysztofzablocki/Inject), a hot reloading library for Swift that allows your app to "hot reload" and update as soon as changes are made in real time. This does not suffer from the side effects of the Xcode workspace/project issue, and allows you to make changes in Cursor and have them reflected in your app immediately.

<CardGroup cols={1}>
  <Card title="Inject - Hot Reloading for Swift" horizontal icon="fire" href="https://github.com/krzysztofzablocki/Inject">
    Learn more about Inject and how to use it in your Swift projects.
  </Card>
</CardGroup>

## Advanced Swift Development

<Note>This section of the guide was heavily inspired by [Thomas Ricouard](https://x.com/Dimillian) and his [article](https://dimillian.medium.com/how-to-use-cursor-for-ios-development-54b912c23941) about using Cursor for iOS development. Please check his article for more details and drop him a follow for more Swift content.</Note>

If you are looking to only need one editor open at a time, and want to avoid the need to switch between Xcode and Cursor, you can use an extension like [Sweetpad](https://sweetpad.hyzyla.dev/) to integrate Cursor directly with Xcode's underlying build system.

Sweetpad is a powerful extension that allows you to build, run and debug your Swift projects directly in Cursor, without compromising on Xcode's features.

To get started with Sweetpad, you'll still need to have Xcode installed on your Mac - it's the foundation of Swift development. You can download Xcode from the [Mac App Store](https://apps.apple.com/us/app/xcode/id497799835). Once you have Xcode set up, let's enhance your development experience in Cursor with a few essential tools.

Open your terminal and run:

```bash
# Builds your projects without needing Xcode open
brew install xcode-build-server

# Pretty print's the `xcodebuild` command output into Cursor's terminal
brew install xcbeautify

# Allows for advanced formating and language features
brew install swiftformat
```

Next, install the [Swift Language Support](https://marketplace.visualstudio.com/items?itemName=sswg.swift-lang) extension in Cursor. This will give you syntax highlighting and basic language features right out of the box.

Then, we can install the [Sweetpad](https://sweetpad.hyzyla.dev/) extension to integrate Cursor with Xcode. Sweetpad wraps a bunch of shortcuts around the `xcodebuild` CLI (and much more), and allows you to scan your targets, select the destination, build, and run your app just like Xcode. On top of that, it’ll set up your project for Xcode Build Server so you get all the features mentioned above.

### Sweetpad Usage

Once Sweetpad is installed, and you have a Swift project open in Cursor, you should first run the `Sweetpad: Generate Build Server Config` command. This will generate a `buildServer.json` file in the root of your project that allows the Xcode Build Server to work with your project.

Then, from either the Command Palette or the Sweetpad sidebar, you can select the target you want to build and run.

<Note> You need to build your project once to enable auto-completion, jump to definition, and other language features. </Note>

You can also now hit F5 to build and run your project with a debugger - you might need to create a launch configuration first, but just select Sweetpad from the list when prompted!

As with many extensions in Cursor, you can bind many of the Sweetpad commands to keyboard shortcuts, to make your workflow even more efficient.

To learn more about Sweetpad, check out these resources:

<CardGroup>
  <Card title="Sweetpad Website" horizontal icon="globe" href="https://sweetpad.hyzyla.dev/">
    Official Sweetpad website with features and installation instructions
  </Card>

  <Card title="Sweetpad Guide" horizontal icon="book" href="https://sweetpad.hyzyla.dev/docs/intro">
    Comprehensive guide covering configuration, usage and advanced features
  </Card>
</CardGroup>


# Migrate from JetBrains IDEs
Source: https://docs.cursor.com/guides/migration/jetbrains

Learn how to customize Cursor to replicate your JetBrains IDE experience

Cursor offers a modern, AI-powered coding experience that can replace your JetBrains IDEs. While the transition might feel different at first, Cursor's VS Code-based foundation provides powerful features and extensive customization options.

## Editor Components

### Extensions

JetBrains IDEs are great tools, as they come already pre-configured for the languages and frameworks they are intended for.

Cursor is different - being a blank canvas out of the box, you can customize it to your liking, not being limited by the languages and frameworks the IDE was intended for.

Cursor has access to a vast ecosystem of extensions, and almost all of the functionality (and more!) that JetBrains IDEs offer can be recreated through these extensions.

Take a look at some of these popular extensions below:

<CardGroup cols={4}>
  <Card title="Remote Development" icon="network-wired" href="https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.vscode-remote-extensionpack">
    SSH, WSL, and Containers
  </Card>

  <Card title="Project Manager" icon="folder-tree" href="https://marketplace.visualstudio.com/items?itemName=alefragnani.project-manager">
    Manage multiple projects
  </Card>

  <Card title="GitLens" icon="git" href="https://marketplace.cursorapi.com/items?itemName=maattdd.gitless">
    Enhanced Git integration
  </Card>

  <Card title="Local History" icon="clock-rotate-left" href="https://marketplace.visualstudio.com/items?itemName=xyz.local-history">
    Track local file changes
  </Card>

  <Card title="Error Lens" icon="bug" href="https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens">
    Inline error highlighting
  </Card>

  <Card title="ESLint" icon="code-compare" href="https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint">
    Code linting
  </Card>

  <Card title="Prettier" icon="wand-magic-sparkles" href="https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode">
    Code formatting
  </Card>

  <Card title="Todo Tree" icon="folder-tree" href="https://marketplace.visualstudio.com/items?itemName=Gruntfuggly.todo-tree">
    Track TODOs and FIXMEs
  </Card>
</CardGroup>

### Keyboard Shortcuts

Cursor has a built-in keyboard shortcut manager that allows you to map your favorite keyboard shortcuts to actions.

With this extension, you can bring almost all of the JetBrains IDEs shortcuts directly to Cursor!
Be sure to read the extension's documentation to learn how to configure it to your liking:

<Card title="IntelliJ IDEA Keybindings" icon="keyboard" href="https://marketplace.visualstudio.com/items?itemName=k--kato.intellij-idea-keybindings">
  Install this extension to bring JetBrains IDEs keyboard shortcuts to Cursor.
</Card>

<Note>
  Common shortcuts that differ:

  * Find Action: ⌘/Ctrl+Shift+P  (vs. ⌘/Ctrl+Shift+A)
  * Quick Fix: ⌘/Ctrl+.  (vs. Alt+Enter)
  * Go to File: ⌘/Ctrl+P  (vs. ⌘/Ctrl+Shift+N)
</Note>

### Themes

Recreate the look and feel of your favorite JetBrains IDEs in Cursor with these community themes.

Choose from the standard Darcula Theme, or pick a theme to match the syntax highlighting of your JetBrains tools.

<CardGroup cols={1}>
  <Card title="JetBrains - Darcula Theme" icon="moon" horizontal href="https://marketplace.visualstudio.com/items?itemName=rokoroku.vscode-theme-darcula">
    Experience the classic JetBrains Darcula dark theme
  </Card>
</CardGroup>

<CardGroup cols={2}>
  <Card title="JetBrains PyCharm" icon="python" horizontal href="https://marketplace.visualstudio.com/items?itemName=nicohlr.pycharm" />

  <Card title="JetBrains IntelliJ" icon="java" horizontal href="https://marketplace.visualstudio.com/items?itemName=AnandaBibekRay.intellij-idea-new-ui-theme" />

  <Card title="JetBrains Fleet" icon="code" horizontal href="https://marketplace.visualstudio.com/items?itemName=MichaelZhou.fleet-theme" />

  <Card title="JetBrains Rider" icon="hashtag" horizontal href="https://marketplace.visualstudio.com/items?itemName=digimezzo.jetbrains-rider-new-ui-theme" />
</CardGroup>

<CardGroup cols={1}>
  <Card title="JetBrains Icons" icon="icons" horizontal href="https://marketplace.visualstudio.com/items?itemName=chadalen.vscode-jetbrains-icon-theme">
    Get the familiar JetBrains file and folder icons
  </Card>
</CardGroup>

### Font

To complete your JetBrains-like experience, you can use the official JetBrains Mono font:

1. Download and install JetBrains Mono font onto your system:

<CardGroup cols={1}>
  <Card title="Download JetBrains Mono" icon="link" horizontal href="https://www.jetbrains.com/lp/mono/" />
</CardGroup>

2. Restart Cursor after installing the font
3. Open Settings in Cursor (⌘/Ctrl + ,)
4. Search for "Font Family"
5. Set the font family to `'JetBrains Mono'`

<Note>
  For the best experience, you can also enable font ligatures by setting `"editor.fontLigatures": true` in your settings.
</Note>

## IDE-Specific Migration

Many users loved the JetBrains IDEs for their out-the-box support for the languages and frameworks they were intended for. Cursor is different - being a blank canvas out of the box, you can customize it to your liking, not being limited by the languages and frameworks the IDE was intended for.

Cursor already has access to the extension ecosystem of VS Code, and almost all of the functionality (and more!) that JetBrains IDEs offer can be recreated through these extensions.

Take a look at the following suggested extensions for each JetBrains IDE below.

### IntelliJ IDEA (Java)

<CardGroup cols={2}>
  <Card title="Language Support for Java" icon="java" href="https://marketplace.visualstudio.com/items?itemName=redhat.java">
    Core Java language features
  </Card>

  <Card title="Debugger for Java" icon="bug" href="https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-debug">
    Java debugging support
  </Card>

  <Card title="Test Runner for Java" icon="vial" href="https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-test">
    Run and debug Java tests
  </Card>

  <Card title="Maven for Java" icon="box" href="https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-maven">
    Maven support
  </Card>
</CardGroup>

<CardGroup cols={1}>
  <Card title="Project Manager for Java" icon="folder-tree" href="https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-dependency" horizontal>
    Project management tools
  </Card>
</CardGroup>

<Warning>
  Key differences:

  * Build/Run configurations are managed through launch.json
  * Spring Boot tools available through ["Spring Boot Tools"](https://marketplace.visualstudio.com/items?itemName=Pivotal.vscode-spring-boot) extension
  * Gradle support via ["Gradle for Java"](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-gradle) extension
</Warning>

### PyCharm (Python)

<CardGroup cols={2}>
  <Card title="Python" icon="python" href="https://marketplace.visualstudio.com/items?itemName=ms-python.python">
    Core Python support
  </Card>

  <Card title="Pylance" icon="bolt" href="https://marketplace.visualstudio.com/items?itemName=ms-python.vscode-pylance">
    Fast type checking
  </Card>

  <Card title="Jupyter" icon="notebook" href="https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter">
    Notebook support
  </Card>

  <Card title="Python Test Explorer" icon="vial-circle-check" href="https://marketplace.visualstudio.com/items?itemName=LittleFoxTeam.vscode-python-test-adapter">
    Test management
  </Card>
</CardGroup>

<Note>
  Key differences:

  * Virtual environments managed through command palette
  * Debug configurations in launch.json
  * Requirements management through requirements.txt or Poetry
</Note>

### WebStorm (JavaScript/TypeScript)

<CardGroup cols={2}>
  <Card title="JavaScript and TypeScript Nightly" icon="js" href="https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-typescript-next">
    Latest language features
  </Card>

  <Card title="ES7+ React/Redux Snippets" icon="react" href="https://marketplace.visualstudio.com/items?itemName=dsznajder.es7-react-js-snippets">
    React development
  </Card>

  <Card title="Vue Language Features" icon="vuejs" href="https://marketplace.visualstudio.com/items?itemName=Vue.volar">
    Vue.js support
  </Card>

  <Card title="Angular Language Service" icon="angular" href="https://marketplace.visualstudio.com/items?itemName=Angular.ng-template">
    Angular development
  </Card>
</CardGroup>

<Info>
  Most WebStorm features are built into Cursor/VS Code, including:

  * npm scripts view
  * Debugging
  * Git integration
  * TypeScript support
</Info>

### PhpStorm (PHP)

<CardGroup cols={2}>
  <Card title="PHP Intelephense" icon="php" href="https://marketplace.visualstudio.com/items?itemName=bmewburn.vscode-intelephense-client">
    PHP language server
  </Card>

  <Card title="PHP Debug" icon="bug" href="https://marketplace.visualstudio.com/items?itemName=xdebug.php-debug">
    Xdebug integration
  </Card>

  <Card title="PHP Intellisense" icon="brain" href="https://marketplace.visualstudio.com/items?itemName=felixfbecker.php-intellisense">
    Code intelligence
  </Card>

  <Card title="PHP DocBlocker" icon="comment-dots" href="https://marketplace.visualstudio.com/items?itemName=neilbrayfield.php-docblocker">
    Documentation tools
  </Card>
</CardGroup>

<Note>
  Key differences:

  * Xdebug configuration through launch.json
  * Composer integration via terminal
  * Database tools through ["SQLTools"](https://marketplace.visualstudio.com/items?itemName=mtxr.sqltools) extension
</Note>

### Rider (.NET)

<CardGroup cols={2}>
  <Card title="C#" icon="code" href="https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp">
    Core C# support
  </Card>

  <Card title="C# Dev Kit" icon="toolbox" href="https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csdevkit">
    Enhanced .NET tools
  </Card>

  <Card title="Unity" icon="unity" href="https://marketplace.visualstudio.com/items?itemName=visualstudiotoolsforunity.vstuc">
    Unity development
  </Card>

  <Card title=".NET Install Tool" icon="box-open" href="https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.vscode-dotnet-runtime">
    .NET SDK management
  </Card>
</CardGroup>

<Warning>
  Key differences:

  * Solution explorer through file explorer
  * NuGet package management through CLI or extensions
  * Test runner integration through test explorer
</Warning>

### GoLand (Go)

<CardGroup cols={2}>
  <Card title="Go" icon="golang" href="https://marketplace.visualstudio.com/items?itemName=golang.Go">
    Official Go extension
  </Card>

  <Card title="Go Test Explorer" icon="vial" href="https://marketplace.visualstudio.com/items?itemName=premparihar.gotestexplorer">
    Test management
  </Card>
</CardGroup>

<CardGroup cols={1}>
  <Card title="Go Doc" icon="book" href="https://marketplace.visualstudio.com/items?itemName=msyrus.go-doc" horizontal>
    Documentation tools
  </Card>
</CardGroup>

<Note>
  Key differences:

  * Go tools installation prompted automatically
  * Debugging through launch.json
  * Package management integrated with go.mod
</Note>

## Tips for a Smooth Transition

<Steps>
  <Step title="Use Command Palette">
    Press <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> to find commands
  </Step>

  <Step title="AI Features">
    Leverage Cursor's AI features for code completion and refactoring
  </Step>

  <Step title="Customize Settings">
    Fine-tune your settings.json for optimal workflow
  </Step>

  <Step title="Terminal Integration">
    Use the built-in terminal for command-line operations
  </Step>

  <Step title="Extensions">
    Browse the VS Code marketplace for additional tools
  </Step>
</Steps>

<Info>
  Remember that while some workflows might be different, Cursor offers powerful AI-assisted coding features that can enhance your productivity beyond traditional IDE capabilities.
</Info>


# Migrate from VS Code
Source: https://docs.cursor.com/guides/migration/vscode

Migrate from VS Code to Cursor in minutes

Cursor is based upon the VS Code codebase, allowing us to focus on making the best AI-powered coding experience while maintaining a familiar editing environment. This makes it easy to migrate your existing VS Code settings to Cursor.

## Profile Migration

### One-click Import

Here's how to get your entire VS Code setup in one click:

1. Open the Cursor Settings (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>J</kbd>)
2. Navigate to General > Account
3. Under "VS Code Import", click the Import button

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/get-started/vscode-import.png" />
</Frame>

This will transfer your:

* Extensions
* Themes
* Settings
* Keybindings

### Manual Profile Migration

If you are moving between machines, or want more control over your settings, you can manually migrate your profile.

#### Exporting a Profile

1. On your VS Code instance, open the Command Palette (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>)
2. Search for "Preferences: Open Profiles (UI)"
3. Find the profile you want to export on the left sidebar
4. Click the 3-dot menu and select "Export Profile"
5. Choose to export it either to your local machine or to a GitHub Gist

#### Importing a Profile

1. On your Cursor instance, open the Command Palette (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>)
2. Search for "Preferences: Open Profiles (UI)"
3. Click the dropdown menu next to 'New Profile' and click 'Import Profile'
4. Either paste in the URL of the GitHub Gist or choose 'Select File' to upload a local file
5. Click 'Import' at the bottom of the dialog to save the profile
6. Finally, in the sidebar, choose the new profile and click the tick icon to active it

## Settings and Interface

### Settings Menus

<CardGroup>
  <Card title="Cursor Settings" icon="gear">
    Access via Command Palette (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>), then type "Cursor Settings"
  </Card>

  <Card title="VS Code Settings" icon="code">
    Access via Command Palette (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>), then type "Preferences: Open Settings (UI)"
  </Card>
</CardGroup>

### Version Updates

<Card title="Version Updates" icon="code-merge">
  We regularly rebase Cursor onto the latest VS Code version to stay current with features and fixes. To ensure stability, Cursor often uses slightly older VS Code versions.
</Card>

### Activity Bar Orientation

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/get-started/activity-bar.png" />
</Frame>

We made it horizontal to optimize space for the AI chat interface. If you prefer vertical:

1. Open the Command Palette (<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>)
2. Search for "Preferences: Open Settings (UI)"
3. Search for `workbench.activityBar.orientation`
4. Set the value to `vertical`
5. Restart Cursor


# Keyboard Shortcuts
Source: https://docs.cursor.com/kbd

A comprehensive guide to Cursor keyboard shortcuts for Chat, Composer, Tab and Agent

A high level overview of the keyboard shortcuts and keybindings in Cursor. You can see all keyboard shortcuts by pressing `Cmd + R` then `Cmd + S`.

To learn more about Keyboard Shortcuts in Cursor, check out the [Key Bindings for VS Code](https://code.visualstudio.com/docs/getstarted/keybindings) as it serves as a good baseline for Cursor's keybindings.

All of Cursor's keybindings, including those for Cursor-specific features, can be remapped in the Keyboard Shortcuts settings page.

<Tip>All `Cmd` keys can be replaced with `Ctrl` on Windows.</Tip>

<div className="full-width-table">
  ## General

  | Shortcut                   | Action                 |
  | -------------------------- | ---------------------- |
  | <kbd>Cmd + I</kbd>         | Open Agent             |
  | <kbd>Cmd + L</kbd>         | Open Ask               |
  | <kbd>Cmd + .</kbd>         | Toggle Chat Modes      |
  | <kbd>Cmd + /</kbd>         | Loop between AI models |
  | <kbd>Cmd + Shift + J</kbd> | Open Cursor settings   |
  | <kbd>Cmd + ,</kbd>         | Open General settings  |
  | <kbd>Cmd + Shift + P</kbd> | Open command palette   |

  ## Chat - Agent, Edit & Ask

  These shortcuts work while focused on the chat input box.

  | Shortcut                                      | Action                       |
  | --------------------------------------------- | ---------------------------- |
  | <kbd>Enter</kbd>                              | Submit                       |
  | <kbd>Cmd + Backspace</kbd>                    | Cancel generation            |
  | <kbd>Cmd + L</kbd> with code selected         | Add selected code as context |
  | <kbd>Cmd + Shift + L</kbd> with code selected | Add selected code as context |
  | <kbd>Cmd + Enter</kbd>                        | Accept all changes           |
  | <kbd>Cmd + Backspace</kbd>                    | Reject all changes           |
  | <kbd>Tab</kbd>                                | Cycle to next message        |
  | <kbd>Shift + Tab</kbd>                        | Cycle to previous message    |
  | <kbd>Cmd + Alt + /</kbd>                      | Open model toggle            |
  | <kbd>Cmd + N</kbd> / <kbd>Cmd + R</kbd>       | Create new chat              |
  | <kbd>Cmd + Shift + K</kbd>                    | Open composer as bar         |
  | <kbd>Cmd + \[</kbd>                           | Open previous chat           |
  | <kbd>Cmd + ]</kbd>                            | Open next chat               |
  | <kbd>Cmd + W</kbd>                            | Close chat                   |
  | <kbd>Esc</kbd>                                | Unfocus the field            |

  ## Cmd+K

  | Shortcut                   | Action             |
  | -------------------------- | ------------------ |
  | <kbd>Cmd + K</kbd>         | Open               |
  | <kbd>Cmd + Shift + K</kbd> | Toggle input focus |
  | <kbd>Enter</kbd>           | Submit             |
  | <kbd>Cmd + Backspace</kbd> | Cancel             |
  | <kbd>Option + Enter</kbd>  | Ask quick question |

  ## Code Selection & Context

  | Shortcut                                         | Action                               |
  | ------------------------------------------------ | ------------------------------------ |
  | <kbd>@</kbd>                                     | [@-symbols](/context/@-symbols/)     |
  | <kbd>#</kbd>                                     | Files                                |
  | <kbd>/</kbd>                                     | Shortcut Commands                    |
  | <kbd>Cmd + Shift + L</kbd>                       | Add selection to Chat                |
  | <kbd>Cmd + Shift + K</kbd>                       | Add selection to Edit                |
  | <kbd>Cmd + L</kbd>                               | Add selection to new chat            |
  | <kbd>Cmd + M</kbd>                               | Toggle file reading strategies       |
  | <kbd>Cmd + →</kbd>                               | Accept next word of suggestion       |
  | <kbd>Cmd + Enter</kbd>                           | Search codebase in chat              |
  | <kbd>Select code, Cmd + C, Cmd + V</kbd>         | Add copied reference code as context |
  | <kbd>Select code, Cmd + C, Cmd + Shift + V</kbd> | Add copied code as text context      |

  ## Tab

  | Shortcut           | Action            |
  | ------------------ | ----------------- |
  | <kbd>Tab</kbd>     | Accept suggestion |
  | <kbd>Cmd + →</kbd> | Accept next word  |

  ## Terminal

  | Shortcut               | Action                   |
  | ---------------------- | ------------------------ |
  | <kbd>Cmd + K</kbd>     | Open terminal prompt bar |
  | <kbd>Cmd + Enter</kbd> | Run generated command    |
  | <kbd>Esc</kbd>         | Accept command           |
</div>


# AI Commit Message
Source: https://docs.cursor.com/more/ai-commit-message

Learn how to generate Git commit messages automatically in Cursor using the sparkle icon or shortcuts

Cursor can help you generate meaningful commit messages for your changes with just a click. Here's how to use this feature:

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/features/generate-commit-message.png" />
</Frame>

1. Stage the files you want to commit
2. Open the Git tab in the sidebar
3. Look for the sparkle (✨) icon next to the commit message input field
4. Click the sparkle icon to generate a commit message based on your staged changes

The generated commit message will be based on the changes in your staged files and your repository's git history. This means Cursor will analyze both your current changes and previous commit messages to generate a contextually appropriate message. Cursor learns from your commit history, which means if you use conventions like [Conventional Commits](https://www.conventionalcommits.org/), the generated messages will follow the same pattern.

## Shortcut

You can bind the generate commit message feature to a keyboard shortcut.

1. Go to Keyboard Shortcuts `⌘R ⌘S` or `⌘⇧P` and search for "Open Keyboard Shortcuts (JSON)"
2. Add the following to the file to bind to `⌘M`:
   ```json
   {
     "key": "cmd+m",
     "command": "cursor.generateGitCommitMessage"
   }
   ```
3. Save the file and you're done!

<Info>
  Currently, there isn't a way to customize or provide specific instructions for
  how commit messages should be generated. Cursor will automatically adapt to
  your existing commit message style.
</Info>


# Custom API Keys
Source: https://docs.cursor.com/settings/api-keys

Learn how to use your own API keys in Cursor for OpenAI, Anthropic, Google, and Azure LLM providers

Cursor lets you input your own API keys for various LLM providers to send as many AI messages as you want at your own cost. When a Customer API key is used, we will use that when calling the LLM providers.

To use your own API key, go to `Cursor Settings` > `Models` and enter your API keys. Then, click on the "Verify" button. Once your key is validated, your API key will be enabled.

<Warning>
  Some Cursor features like Tab Completion
  require specialized models and won't work with custom API keys. Custom API
  keys only work for features that use standard models from providers like
  OpenAI, Anthropic, and Google.
</Warning>

## OpenAI API Keys

You can get your own API key from the [OpenAI platform](https://platform.openai.com/account/api-keys).

<Warning>
  OpenAI's reasoning models (o1, o1-mini, o3-mini) require special configuration and are not currently supported with custom API keys.
</Warning>

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/misc/openai-api.png" />
</Frame>

## Anthropic API Keys

Similar to OpenAI, you can also set your own Anthropic API key so that you will be using claude-based models at your own cost.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/misc/anthropic-api.png" />
</Frame>

## Google API Keys

For Google API keys, you can set your own API key so that you will be using Google models such as `gemini-1.5-flash-500k` at your own cost.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/misc/google-api.png" />
</Frame>

## Azure Integration

Finally, you can also set your own Azure API key so that you will be using Azure OpenAI models at your own cost.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/misc/azure-api.png" />
</Frame>

## FAQ

### Will my API key be stored or leave my device?

Your API key will not be stored, but it will be sent up to our server with every request. All requests are routed through our backend where we do the final prompt building.

### What custom LLM providers are supported?

Cursor only supports API providers that are compatible with the OpenAI API format (like OpenRouter). We do not provide support for custom local LLM setups or other API formats. If you're having issues with a custom API setup that isn't from our supported providers, we unfortunately cannot provide technical support.


# Early Access Program
Source: https://docs.cursor.com/settings/beta

Access experimental features and early releases in Cursor

Cursor offers an early access program that gives you early access to new and experimental features. While these features can be exciting, they may be less stable than our standard features.

<Warning>
  Beta features are experimental and may contain bugs or unexpected behavior. We recommend staying on standard settings if you need a stable development environment.
</Warning>

## Joining the Early Access Program

To join the early access program and receive pre-release updates:

<Steps>
  <Step title="Open Cursor Settings">
    Access the settings menu from the Cursor application with `CMD+Shift+J` on macOS or `Ctrl+Shift+J` on Windows and Linux.
  </Step>

  <Step title="Navigate to the Beta menu">
    Find and select the Beta menu in settings sidebar.
  </Step>

  <Step title="Choose the 'Early Access' option">
    Find the 'Update frequency' dropdown and select 'Early Access' to opt in.

    <Frame>
      <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/betaSetting.png" />
    </Frame>
  </Step>

  <Step title="Await the next update">
    Wait for the next early access update to be available, and you will recieve it automatically.
  </Step>
</Steps>

## Leaving the Early Access Program

If you decide you no longer want to be part of the early access program, you can opt out by toggling the 'Update frequency' dropdown to 'Standard' in the settings menu.

Then, either wait for the next update to take effect, or redownload Cursor's latest stable release from [cursor.com](https://cursor.com).

## ⚠️ Warnings

* Beta features are experimental and may contain bugs or unexpected behavior.
* We may be unable to provide support for users on the Early Access version.
* Beta features may change or be removed without notice as we gather feedback and make improvements.

## 💡 Feedback

We value your feedback on beta features. If you encounter any issues or have suggestions, please report bugs through our [Forum](https://forum.cursor.com), making sure to specify that you are on an early access version.


# Models
Source: https://docs.cursor.com/settings/models

Switch between AI models in Cursor using Chat, Composer, Tab, or Agent with different pricing tiers

With Composer, ⌘ K, and Terminal Ctrl/⌘ K, you can easily switch between different models of your choice.

## Model usage

Cursor has two types of models:

<CardGroup cols={2}>
  <Card title="Premium models" icon="crown">
    These models are usually **more intelligent** and count against your monthly request usage.
  </Card>

  <Card title="Free models" icon="bolt">
    These models are usually **faster** to respond, and have **unlimited usage** on all our paid plans.
  </Card>
</CardGroup>

If you exceed your monthly premium model quota, you can enable usage based pricing to continue using these models.

For more information on model usage and quotas, see [Account Usage](/account/usage).

## Available models

Cursor has a wide range of models from a variety of providers.
See the table below for a complete list of available models.

<Tip>
  By default, the most popular models are enabled. You can add enable any of these models under `Cursor Settings` > `Models`.
</Tip>

<div className="full-width-table">
  | Model                                                                                                 | Provider  | Premium | Agent | Pricing |
  | :---------------------------------------------------------------------------------------------------- | :-------- | :-----: | :---: | :------ |
  | [`claude-3.7-sonnet`](https://www.anthropic.com/claude/sonnet)                                        | Anthropic |    ✓    |   ✓   | \$0.04  |
  | [`claude-3.7-sonnet`](https://www.anthropic.com/claude/sonnet) <i>MAX mode</i> <sup>1-4</sup>         | Anthropic |         |   ✓   | \$0.05  |
  | [`claude-3.5-sonnet`](https://www.anthropic.com/claude/sonnet)                                        | Anthropic |    ✓    |   ✓   | \$0.04  |
  | [`claude-3.5-haiku`](https://www.anthropic.com/claude/haiku) <sup>5</sup>                             | Anthropic |    ✓    |       | \$0.01  |
  | [`claude-3-opus`](https://www.anthropic.com/news/claude-3-family) <sup>6</sup>                        | Anthropic |    ✓    |       | \$0.10  |
  | `cursor-small`                                                                                        | Cursor    |         |       | Free    |
  | [`deepseek-v3`](https://www.deepseek.com/)                                                            | Fireworks |         |  Soon | Free    |
  | [`deepseek-r1`](https://www.deepseek.com/)                                                            | Fireworks |    ✓    |  Soon | \$0.04  |
  | [`gpt-4o`](https://openai.com/index/hello-gpt-4o/)                                                    | OpenAI    |    ✓    |   ✓   | \$0.04  |
  | [`gpt-4o-mini`](https://openai.com/gpt-4o-mini) <sup>7</sup>                                          | OpenAI    |    ✓    |       |         |
  | [`gpt-4.5-preview`](https://openai.com/index/introducing-gpt-4-5/)                                    | OpenAI    |         |       | \$2.00  |
  | [`o1`](https://openai.com/index/learning-to-reason-with-llms/)                                        | OpenAI    |         |       | \$0.40  |
  | [`o1-mini`](https://openai.com/index/openai-o1-mini-advancing-cost-efficient-reasoning/) <sup>6</sup> | OpenAI    |         |       | \$0.10  |
  | [`o3-mini`](https://openai.com/index/openai-o3-mini/) <sup>5, 8</sup>                                 | OpenAI    |    ✓    |   ✓   | \$0.02  |
  | [`grok-2`](https://x.ai/blog/grok-1212)                                                               | xAI       |    ✓    |       | \$0.04  |
</div>

<p className="text-sm opacity-50">
  <sup>1</sup> Each tool call charged like a request<br />
  <sup>2</sup> Read file tool calls process up to 750 lines per call<br />
  <sup>3</sup> No Agent tool call limit<br />
  <sup>4</sup> 200k max context window<br />
  <sup>5</sup> Counts as 1/3 fast request<br />
  <sup>6</sup> 10 requests/day included on **paid** plan<br />
  <sup>7</sup> Free plan gets 500 requests/day<br />
  <sup>8</sup> Set to the `high` reasoning effort<br />
</p>

### MAX mode

Models offered in MAX mode have enhanced capabilities with larger context windows and expanded reasoning.

Currently offered as an option for Claude 3.7 Sonnet, MAX mode provides a 200k token context window, unlimited Agent tool calls, and the ability to process up to 750 lines per file read operation.

When operated as an Agent, each tool call in MAX mode is charged as a separate request in addition to the initial prompt request.

### Model hosting

Models are hosted on US-based infrastructure by the model's provider, a trusted partner or Cursor.

When **Privacy Mode** is enabled from Settings, Cursor nor the model providers will store your data with all data deleted after each request is processed. For further details see our [Privacy](/account/privacy), [Privacy Policy](https://cursor.com/privacy), and [Security](https://cursor.com/security) pages.

## Model dropdown

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/advanced/model-menu-auto-select.png" />
</Frame>

Underneath the AI input box in both the [Chat](/agent) and [CMD+K](/cmd-k/overview) modes, you will see a dropdown that allows you to select the model you want to use.

For any models not visible in the dropdown, you can enable and disable them in your Cursor Settings.

### Auto-select

Enabling the Auto-select switch in the model dropdown allows Cursor to proactively select the best model for your needs at that moment.

Cursor will select the **premium model** with the highest reliability based on current demand and best fit for the current task.

While this works best for keeping you in flow, you can also manually select a different model by disabling this option.

### Thinking

Enabling the Thinking switch in the model dropdown limits the list to models that engage in more deliberate reasoning when producing responses.

Thinking models work through problems step-by-step and have deeper capacity to examine their own reasoning and correct errors.

These models often perform better on complex reasoning tasks, though they may require more time to generate their responses.

## Context windows

The 'context window' is the amount of tokens that we provide the model with, for it to use in the conversation.

To optimize the AI performance, Cursor curates the context provided to the model to ensure the best experience.

In the [Agent](/agent), the context windows is 60,000 tokens by default. For Claude 3.7 specifically, the window is up to 120,000 tokens, due to it's better performance with longer context windows.

For [Cmd-K](/cmd-k/overview), we limit to around 10,000 tokens to balance speed and quality.

For longer conversations, we automatically summarize the context to preserve token space. Note that these threshold are changed from time to time to optimize the experience.


# Advanced Features
Source: https://docs.cursor.com/tab/advanced-features

Learn to navigate code efficiently using Tab in peek views, prediction, and partial accepts

## Tab in Peek

You can also use Cursor Tab in the "Go to Definition" or "Go to Type Definition" peek views. This is useful, for example, when adding a new argument to a function call.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cpp/cpp-in-peek.png" />
</Frame>

We especially enjoy using this in vim in conjunction with `gd` to, for example, modify a function definition, then fix all of its usages in one go.

## <div className="flex items-center" style={{ gap: '6px' }}> <span className="cursor-pointer my-0">Cursor Prediction</span></div>

Cursor can also predict where you will go to after an accepted edit.
If available, you will be able to press tab to go to the next location, allowing you to tab-tab-tab through edits.

<Frame caption="Cursor predicted the next location, and suggested an edit there.">
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cpp/cp.png" />
</Frame>

## <div className="flex items-center" style={{ gap: '6px' }}> <span className="cursor-pointer my-0">Partial Accepts</span></div>

You can accept the next word of a suggestion by pressing `Ctrl/⌘` and the right arrow (or by setting `editor.action.inlineSuggest.acceptNextWord` to your preferred keybinding).

To enable partial accepts, navigate to `Cursor Settings` > `Features` > `Cursor Tab`.


# Auto-import
Source: https://docs.cursor.com/tab/auto-import

Auto-import feature in Tab helps add module imports automatically in TypeScript and Python projects

## Overview

In TypeScript and Python (beta) project, Tab can automatically import modules and functions from elsewhere in your project, without you having to manually type the import statement.

Just start using the method you want from an existing file, and Tab will automatically suggest the import statement for you. If you accept, the import statement will be added to your file without pulling you away from the code you are writing.

## Troubleshooting

If you are having issues with auto-import, please confirm you have the necessary extensions (e.g. a language server) for your project language, as this is required for auto-import to work.

You can confirm if this is working, by moving your cursor to a function or method that is not yet imported, and hit <kbd>⌘</kbd> + <kbd>.</kbd> or <kbd>Ctrl</kbd> + <kbd>.</kbd> to see if the import is suggested in the Quick Fix suggestions - if not, then the language server is not working.


# Tab vs GitHub Copilot
Source: https://docs.cursor.com/tab/from-gh-copilot

Learn how Cursor's code editing capabilities surpass GitHub Copilot with multi-character & instructional edits

## Tab Improvements

The biggest difference is the way Cursor and GitHub Copilot complete code.

GitHub Copilot can insert text at your cursor position. It cannot edit the code around your cursor or remove text.

Cursor can insert text at your cursor, and much more:

* Multi-character edits
  <Frame>
    <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cpp/multi-edit.png" />
  </Frame>
* Instruction-based edits
  <Frame>
    <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cpp/instruct.png" />
  </Frame>

Further, Cursor has a history of your recent changes in the context window, so it knows what you are trying to do next.

## Migrate from GitHub Copilot

Since Cursor comes by default with GitHub Copilot, you might have GitHub Copilot and Cursor installed at the same time. We recommend turning off GitHub Copilot when you want to use Cursor.

By default, Cursor takes precedence over GitHub Copilot. If you want to use GitHub Copilot, you can [disable Cursor](/tab/overview#copilot-settings) in the settings.


# Overview
Source: https://docs.cursor.com/tab/overview

AI-powered code autocomplete that suggests edits and multi-line changes based on your recent work

Cursor Tab is our native autocomplete feature. It's a more powerful Copilot that suggests entire diffs with especially good memory.

<Frame>
  <video src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cpp/cpp-full-video.mp4" autoPlay loop muted playsInline />
</Frame>

Powered by a custom model, Cursor Tab can:

* Suggest edits around your cursor, not just insertions of additional code.
* Modify multiple lines at once.
* Make suggestions based on your recent changes and linter errors.

Free users receive 2000 suggestions at no cost. Pro and Business plans receive unlimited suggestions.

## UI

When Cursor is only adding additional text, completions will appear as grey text. If a suggestion modifies existing code,
it will appear as a diff popup to the right of your current line.

<Frame className="flex items-stretch justify-center">
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cpp/ghost-text-example.png" className="h-full object-cover" />

  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/cpp/preview-box-example.png" className="h-full object-cover" />
</Frame>

You can accept a suggestion by pressing `Tab`, or reject it by pressing `Esc`. To partially accept a suggestion word-by-word, press `Ctrl/⌘ →`.
To reject a suggestion, just keep typing, or use `Escape` to cancel/hide the suggestion.

Every keystroke or cursor movement, Cursor will attempt to make a suggestion based on your recent changes. However, Cursor will not always show a suggestion; sometimes the model has predicted that there's no change to be made.

Cursor can make changes from one line above to two lines below your current line.

## Toggling

To turn the feature on or off, hover over "Cursor Tab" icon on the status bar in the bottom right of the application.

## Keyboard Shortcut

Bind Cursor Tab to a custom keyboard shortcut by selecting Settings > Keyboard Shortcuts from the Cursor menu and searching for `Accept Cursor Tab Suggestions`.

## FAQ

### Tab gets in the way when writing comments, what can I do?

You can disable Cursor Tab for comments by going to `Cursor Settings` > `Tab Completion` and unchecking "Trigger in comments".


# Common Issues
Source: https://docs.cursor.com/troubleshooting/common-issues

Guide for troubleshooting common Cursor app issues including updates, login, and connectivity problems

While we strive to make Cursor as stable as possible, sometimes issues can arise. Below are some common issues and how to resolve them.

### Networking Issues (HTTP/2)

Cursor relies on the HTTP/2 protocol for many of it's AI features, due to it's ability to handle streamed responses. If HTTP/2 is not supported by your network, this can cause issues such as failure to index your code, and the inability to use Cursor's AI features.

This can be the case when on corpoorate networks, using VPNs, or using a proxy like Zscaler.

To resolve this, Cursor now comes with a HTTP/1.1 fallback, which is slower, but will allow you to use Cursor's AI features. You can enable this yourself in the app settings (not the Cursor settings), by pressing `CMD/CTRL + ,` and then searching for `HTTP/2`.

You should then enable the `Disable HTTP/2` option, which will force Cursor to use HTTP/1.1, and should resolve the issue.

We hope to add automatic detection and fallback in the future!

### Resource Issues (CPU, RAM, etc.)

Some users see high CPU or RAM usage in Cursor, which can cause their machine to slow down, or to show warnings about high RAM usage.

While Cursor can use a lot of resources when working on large codebases, this is usually not the case for most users, and is more likely to be an issue with Cursor's extensions or settings.

<Note>
  If you are seeing a low RAM warning on **MacOS**, please note that there is a bug for some users that can show wildly incorrect values. If you are seeing this, please open the Activity Monitor and look at the "Memory" tab to see the correct memory usage.
</Note>

If you're experiencing high CPU or RAM usage in Cursor, here are steps to diagnose and resolve the issue:

<AccordionGroup>
  <Accordion title="Check Your Extensions">
    While many extensions can be useful, some can significantly impact performance!

    To test this, you can try to run `cursor --disable-extensions` from the command line to launch Cursor without any extensions enabled. If the performance improves, gradually re-enable extensions one by one to identify the problematic ones.

    You can also try to use the Extension Bisect feature, which will help you identify which extension is causing the issue. You can read more about it [here](https://code.visualstudio.com/blogs/2021/02/16/extension-bisect#_welcome-extension-bisect), but note that this may only be useful if the issues are immediate and obvious, and not an issue that worsens over time.
  </Accordion>

  <Accordion title="Use the Process Explorer">
    The **Process Explorer** is a built in tool in Cursor that allows you to see which processes are consuming resources.

    To open it, open the Command Palette (`Cmd/Ctrl + Shift + P`) and run the `Developer: Open Process Explorer` command.

    This should open a new window, with a list of all the processes Cursor is running, both as part of it's own executation, as well as any processes needed to run extensions and any terminals you may have running. This should immediately identify any processes that are consuming a lot of resources.

    If the process is listed under the **`extensionHost`** dropdown, this suggests an extension is causing the issue, and you should try to find and disable the problematic extension.

    If the process is listended under the **`ptyHost`** dropdown, this suggests a terminal is consuming a lot of resources. The Process Explorer will show you each terminal that is running, and what command is running within it, so that you can try to kill it, or diagnose it's high resource usage.

    If the usage is from another process, please let us know in the [forum](https://forum.cursor.com/) and we'll be happy to help diagnose the issue.
  </Accordion>

  <Accordion title="Monitor System Resources">
    Depending on your operating system, you can use a number of different tools to monitor your system's resources.

    This will help you identify if the issue is Cursor-specific, or if it's a system-wide issue.
  </Accordion>

  <Accordion title="Testing a Minimal Installation">
    While the above steps should help the majority of users, if you are still experiencing issues, you can try testing a minimal installation of Cursor to see if the issue persists.
  </Accordion>
</AccordionGroup>

## General FAQs

<AccordionGroup>
  <Accordion title="I see an update on the changelog but Cursor won't update">
    If the update is very new, it might not have rolled out to you yet. We do staged rollouts, which means we release new updates to a few randomly selected users first before releasing them to everyone. Expect to get the update in a couple days!
  </Accordion>

  <Accordion title="I have issues with my GitHub login in Cursor / How do I log out of GitHub in Cursor?">
    You can try using the `Sign Out of GitHub` command from the command palette `Ctrl/⌘ + Shift + P`.
  </Accordion>

  <Accordion title="I can't use GitHub Codespaces">
    Unfortunately, we don't support GitHub Codespaces yet.
  </Accordion>

  <Accordion title="I have errors connecting to Remote SSH">
    Currently, we don't support SSHing into Mac or Windows machines. If you're not using a Mac or Windows machine, please report your issue to us in the [forum](https://forum.cursor.com/). It would be helpful to include some logs for better assistance.
  </Accordion>

  <Accordion title="SSH Connection Problems on Windows">
    If you encounter the error "SSH is only supported in Microsoft versions of VS Code", follow these steps:

    1. Uninstall the current Remote-SSH extension:
       * Open the Extensions view (`Ctrl + Shift + X`)
       * Search for "Remote-SSH"
       * Click on the gear icon and select "Uninstall"

    2. Install version 0.113 of Remote-SSH:
       * Go to the Cursor marketplace
       * Search for "Remote-SSH"
       * Find version 0.113 and install it

    3. After installation:
       * Close all VS Code instances that have active SSH connections
       * Restart Cursor completely
       * Try connecting via SSH again

    If you still experience issues, make sure your SSH configuration is correct and that you have the necessary SSH keys set up properly.
  </Accordion>

  <Accordion title="Cursor Tab and Cmd K do not work behind my corporate proxy">
    Cursor Tab and Cmd K use HTTP/2 by default, which allows us to use less resources with lower latency. Some corporate proxies (e.g. Zscaler in certain configurations) block HTTP/2. To fix this, you can set `"cursor.general.disableHttp2": true` in the settings (`Cmd/Ctrl + ,` and then search for `http2`).
  </Accordion>

  <Accordion title="I just subscribed to Pro but I'm still on the free plan in the app">
    Try logging out and logging back in from the Cursor Settings
  </Accordion>

  <Accordion title="When will my usage reset again?">
    If you're subscribed to Pro you can click on `Manage Subscription` from the [Dashboard](https://cursor.com/settings) and your plan renewal date will be displayed at the top.

    If you're a free user you can check when you got the first email from us in your inbox. Your usage will reset every month from that date.
  </Accordion>

  <Accordion title="My Chat/Composer history disappeared after an update">
    If you notice that your Chat or Composer history has been cleared following an update, this is likely due to low disk space on your system. Cursor may need to clear historical data during updates when disk space is limited. To prevent this from happening:

    1. Ensure you have sufficient free disk space before updating
    2. Regularly clean up unnecessary files on your system
    3. Consider backing up important conversations before updating
  </Accordion>

  <Accordion title="How do I uninstall Cursor?">
    You can follow [this guide](https://code.visualstudio.com/docs/setup/uninstall) to uninstall Cursor. Replace every occurrence of "VS Code" or "Code" with "Cursor", and ".vscode" with ".cursor".
  </Accordion>

  <Accordion title="How do I delete my account?">
    You can delete your account by clicking on the `Delete Account` button in the [Dashboard](https://cursor.com/settings). Note that this will delete your account and all data associated with it.
  </Accordion>

  <Accordion title="How do I open Cursor from the command line?">
    You can open Cursor from the command line by running `cursor` in your terminal. If you're missing the `cursor` command, you can

    1. Open the command palette `⌘⇧P`
    2. Type `install command`
    3. Select `Install 'cursor' command` (and optionally the `code` command too which will override VS Code's `code` command)
  </Accordion>

  <Accordion title="Unable to Sign In to Cursor">
    If you click Sign In on the General tab of Cursor's Settings tab but are redirected to cursor.com and then return to Cursor still seeing the Sign In button, try disabling your firewall or antivirus software, which may be blocking the sign-in process.
  </Accordion>
</AccordionGroup>


# Getting a Request ID
Source: https://docs.cursor.com/troubleshooting/request-reporting

Learn how to find and share request IDs in Cursor for better technical support and issue reporting

When the Cursor team are investigating a technical issue, sometimes, we may ask you to provide us with a "request ID".

## What is a request ID?

A request ID is a unique identifier that is generated when you submit a request to Cursor. It is a string of characters that is used to identify the request in our internal systems.

It usually follows a randomized format, such as: `8f2a5b91-4d3e-47c6-9f12-5e8d94ca7d23`.

## How do I find a request ID?

<Warning>
  Request IDs are highly limited when Privacy Mode is enabled, so we recommend disabling Privacy Mode when reporting an issue.

  As a reminder, users on a business plan have Privacy Mode enabled by default, by their organization's admin.
</Warning>

### Getting your current request ID

If you are wanting to report an issue with your current or very recent conversation, you can do this in just a few clicks.

With the relevant conversation open in the Chat sidebar, you can use the context menu in the top right to see a few options - one of these options is the `Copy Request ID` option.

<Frame>
  <img src="https://mintlify.s3.us-west-1.amazonaws.com/cursor/images/requestIDpopup.png" />
</Frame>

After copying the request ID, you can send it back to us to look into, either via the forum, or by email if requested by our support team.

### Getting a request ID from a previous action

You can retrieve a historical request ID from within Cursor by running the `Report AI Action` command.

You you can do this by:

1. Opening the command palette `⌘⇧P`
2. Typing `Report AI Action`
3. Selecting the `Report AI Action` option

This will open a new popup, listing your most recent AI actions across Chat, CMD+K and Apply.

<Frame>
  src="/images/requestIDlist.png"
  />
</Frame>

Select the action you want to report, by matching the time and feature the action was used in. Once you select the action, you have the option to copy the request ID to your clipboard. With it copied, you can send it back to us to look into!


# Troubleshooting Guide
Source: https://docs.cursor.com/troubleshooting/troubleshooting-guide

Technical guide for gathering logs, errors and system info when reporting Cursor issues

Sometimes, Cursor may unexpectantly have some issues. This can be due to a number of reasons, including extensions, app data, or your system. While we work hard to ensure Cursor is as stable out of the box as possible, if these issues happen, you can try the following steps to resolve them.

<CardGroup cols={3}>
  <Card horizontal title="Extension Data" icon="puzzle-piece" href="#1-extension-data" />

  <Card horizontal title="Application Data" icon="trash" href="#2-clearing-app-data" />

  <Card horizontal title="Uninstalling" icon="circle-minus" href="#3-uninstalling-cursor" />
</CardGroup>

<CardGroup cols={1}>
  <Card horizontal title="Reporting an Issue" icon="bug" href="#reporting-an-issue">
    Steps to report an issue to the Cursor team
  </Card>
</CardGroup>

## Troubleshooting

### 1. Extension Data

If you are experiencing issues with individual extensions, you can try uninstalling and reinstalling them to reset any data they may have stored. Also check your settings to see if you have any configuration for the extensions that would remain after uninstalling and reinstalling them.

### 2. Clearing App Data

<Warning>
  WARNING:<br />This will delete your app data, including your extensions, themes, snippets and any other data related to your installation. Consider exporting your profile to ensure this data is not lost.
</Warning>

To allow your installation to be restored between updates, and between reinstallation, Cursor keeps your app data outside of the app itself. This means that if you uninstall Cursor, you can reinstall it and it will restore your app data from the previous installation.

If you would like to clear your app data, you can do so by following these steps:

**Windows:** Run the following commands in Command Prompt:

```txt
rd /s /q %USERPROFILE%\AppData\Local\Programs\cursor*
rd /s /q %USERPROFILE%\AppData\Local\Cursor*
rd /s /q %USERPROFILE%\AppData\Roaming\Cursor*
rd /s /q %USERPROFILE%\cursor*
```

**MacOS:** Run `sudo rm -rf ~/Library/Application\ Support/Cursor` and `rm -f ~/.cursor.json` in Terminal.

**Linux:** Run `rm -rf ~/.cursor ~/.config/Cursor/` in Terminal.

### 3. Uninstalling Cursor

While we never want you to have to reinstall Cursor, if you are experiencing issues, this can sometimes help.

To uninstall the Cursor app, you can do the following:

<CardGroup cols={1}>
  <Card horizontal title="Windows" icon="windows">
    Search for `Add or Remove Programs` Start Menu, find "Cursor" list, and click "Uninstall".
  </Card>

  <Card horizontal title="MacOS" icon="apple">
    Open the Applications folder, find "Cursor" in the list, and right click and select "Move to Trash".
  </Card>

  <Card horizontal title="Linux" icon="linux">
    Open the Applications folder, find "Cursor" in the list, and right click and select "Move to Trash".
  </Card>
</CardGroup>

### 4. Reinstalling Cursor

If you have uninstalled Cursor, you can reinstall it by going to the [Downloads page](https://www.cursor.com/download) and downloading the latest version. If you have not cleared your app data, this should restore your app to the state it was in when you uninstalled it. Otherwise, you will have an entirely fresh install of Cursor.

## Reporting an Issue

If the above steps don't help, please let us know in the [forum](https://forum.cursor.com/) and we'll be happy to help diagnose the issue.

<Card horizontal title="Cursor Forum" icon="message" href="https://forum.cursor.com/">
  Report an bug or issue on the Cursor forum
</Card>

For the best chance at a quick resolution, please provide as much of the following information as you can, to help the team resolve the issue for you and othersß∂:

<CardGroup cols={2}>
  <Card title="Screenshot of Issue" icon="image">
    Capture a screenshot of the issue, making sure to redact any sensitive information.
  </Card>

  <Card title="Steps to Reproduce" icon="list-check">
    Document the exact steps needed to reproduce the issue.
  </Card>

  <Card title="System Information" icon="computer">
    Retrieve system information from:<br />`Cursor` > `Help` > `About`
  </Card>

  <Card title="Request IDs" icon="shield-halved" href="/troubleshooting/request-reporting">
    Click to view our guide on gathering request IDs
  </Card>

  <Card title="Console Errors" icon="bug">
    Check developer tools console errors, by running this in the command palette: <br />`Developer: Toggle Developer Tools`
  </Card>

  <Card title="Logs" icon="file-lines">
    Access Cursor's logs by running this in the command palette: <br />`Developer: Open Logs Folder`
  </Card>
</CardGroup>

`;
    
    // Generate each section with reference to the full example
    const [
      companySection,
      productsSection,
      developerSection,
      educationalSection,
      legalSection,
      supportSection
    ] = await Promise.all([
      generateCompanySection(advancedModel, pagesByCategory.about, companyName, companyDescription, exampleLlmsFullTxt),
      generateProductsSection(advancedModel, pagesByCategory.products, companyName, exampleLlmsFullTxt),
      generateDeveloperSection(advancedModel, pagesByCategory.documentation, companyName, exampleLlmsFullTxt),
      generateEducationalSection(standardModel, pagesByCategory.educational, companyName, exampleLlmsFullTxt),
      generateLegalSection(standardModel, pagesByCategory.legal, companyName, exampleLlmsFullTxt),
      generateSupportSection(standardModel, pagesByCategory.support, companyName, exampleLlmsFullTxt)
    ]);
    
    // Combine all sections
    const fullContent = [
      companySection,
      productsSection,
      developerSection,
      educationalSection,
      legalSection,
      supportSection
    ].join('\n\n');
    
    // No need to clean markdown formatting as each section already handles that
    await logActivity('info', 'Completed sectional generation for LLMS-full.txt', {
      sectionLengths: {
        companySection: companySection.length,
        productsSection: productsSection.length,
        developerSection: developerSection.length,
        educationalSection: educationalSection.length,
        legalSection: legalSection.length,
        supportSection: supportSection.length,
        totalLength: fullContent.length
      }
    });
    
    return fullContent;
  } catch (error) {
    console.error('Error generating LLMS-full content:', error);
    throw new Error(`Failed to generate LLMS-full content: ${error.message}`);
  }
}

/**
 * Categorize pages into different sections for targeted content generation
 * @param {Array} pages - Array of page data
 * @returns {Object} - Object with pages sorted by category
 */
function categorizePages(pages) {
  // Initialize categories
  const categories = {
    about: [],
    products: [],
    documentation: [],
    educational: [],
    legal: [],
    support: [],
    other: []
  };
  
  // Sort pages into categories
  for (const page of pages) {
    const url = page.url.toLowerCase();
    const title = page.title.toLowerCase();
    const content = page.content ? page.content.toLowerCase() : '';
    
    // Try to categorize based on URL, title, and content
    if (
      url.includes('/about') || 
      url.includes('/company') || 
      title.includes('about') || 
      title.includes('mission') ||
      title.includes('company')
    ) {
      categories.about.push(page);
    }
    else if (
      url.includes('/product') || 
      url.includes('/service') || 
      url.includes('/feature') ||
      url.includes('/pricing') ||
      url.includes('/plan') ||
      title.includes('product') || 
      title.includes('service') || 
      title.includes('feature') ||
      title.includes('pricing') ||
      title.includes('plan')
    ) {
      categories.products.push(page);
    }
    else if (
      url.includes('/doc') || 
      url.includes('/api') || 
      url.includes('/developer') ||
      url.includes('/reference') ||
      url.includes('/sdk') ||
      title.includes('documentation') ||
      title.includes('api') ||
      title.includes('developer') ||
      title.includes('reference') ||
      title.includes('sdk') ||
      page.isDocumentation === true
    ) {
      categories.documentation.push(page);
    }
    else if (
      url.includes('/guide') || 
      url.includes('/tutorial') || 
      url.includes('/learn') ||
      url.includes('/knowledge') ||
      url.includes('/faq') ||
      url.includes('/article') ||
      url.includes('/blog') ||
      title.includes('guide') ||
      title.includes('tutorial') ||
      title.includes('learn') ||
      title.includes('how to') ||
      title.includes('faq')
    ) {
      categories.educational.push(page);
    }
    else if (
      url.includes('/legal') || 
      url.includes('/privacy') || 
      url.includes('/term') ||
      url.includes('/license') ||
      url.includes('/security') ||
      url.includes('/compliance') ||
      url.includes('/cookie') ||
      url.includes('/gdpr') ||
      title.includes('privacy') ||
      title.includes('terms') ||
      title.includes('legal') ||
      title.includes('security')
    ) {
      categories.legal.push(page);
    }
    else if (
      url.includes('/support') || 
      url.includes('/help') || 
      url.includes('/contact') ||
      url.includes('/community') ||
      url.includes('/forum') ||
      url.includes('/status') ||
      title.includes('support') ||
      title.includes('help') ||
      title.includes('contact') ||
      title.includes('community')
    ) {
      categories.support.push(page);
    }
    else {
      categories.other.push(page);
    }
  }
  
  // For categories with few pages, supplement with others
  for (const category in categories) {
    if (categories[category].length < 2 && categories.other.length > 0) {
      // Add some general pages to sparse categories
      categories[category] = [...categories[category], ...categories.other.slice(0, 3)];
    }
  }
  
  // Log category statistics
  const stats = {};
  for (const category in categories) {
    stats[category] = categories[category].length;
  }
  
  logActivity('info', 'Categorized pages for sectional content generation', { categoryCounts: stats });
  
  return categories;
}

/**
 * Generate company overview section
 * @param {Object} model - Gemini model
 * @param {Array} pages - Pages about the company
 * @param {String} companyName - Company name
 * @param {String} companyDescription - Company description
 * @param {String} exampleLlmsFullTxt - Example LLMS-full.txt to learn from
 * @returns {Promise<String>} - Generated section
 */
async function generateCompanySection(model, pages, companyName, companyDescription, exampleLlmsFullTxt) {
  try {
    await logActivity('info', 'Generating company overview section', { pagesCount: pages.length });
    
    // Extract example company section from the full example
    const exampleCompanySection = extractSectionFromExample(exampleLlmsFullTxt, 'company');
    
    // Prepare data for the model
    const data = {
      companyName,
      companyDescription,
      pages: pages.map(page => ({
        title: page.title,
        description: page.metaDescription || '',
        headings: page.headings || [],
        url: page.url,
        content: page.content || ''
      }))
    };
    
    // Create detailed prompt for this section
    const prompt = `
Generate the header and company overview section for an LLMS-full.txt file for ${companyName}. This section should include the company name as a header, a blockquote with the company mission, and a detailed overview.

EXAMPLE OF A WELL-FORMATTED COMPANY SECTION:
${exampleCompanySection}

COMPANY DATA:
${JSON.stringify(data, null, 2)}

Generate ONLY the company section that follows this format exactly:

# ${companyName}

> [One-line mission statement or company description]

[2-3 detailed paragraphs about the company, including its history, purpose, market position, and core values. Be comprehensive but factual.]

Do not include any other sections. Focus only on creating a detailed, comprehensive, and accurate company overview based on the provided information. Use markdown formatting (#, >) exactly as shown. The content should be substantive, detailed, and accurately represent the company.
`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // We want to keep the markdown formatting for this section
    return text.trim();
  } catch (error) {
    console.error('Error generating company section:', error);
    // Provide a fallback in case of error
    return `# ${companyName}\n\n> ${companyDescription || 'A leading technology company'}\n\nInformation about the company could not be generated due to an error.`;
  }
}

/**
 * Generate products and services section with example reference
 * @param {Object} model - Gemini model
 * @param {Array} pages - Pages about products and services
 * @param {String} companyName - Company name
 * @param {String} exampleLlmsFullTxt - Example LLMS-full.txt to learn from
 * @returns {Promise<String>} - Generated section
 */
async function generateProductsSection(model, pages, companyName, exampleLlmsFullTxt) {
  try {
    await logActivity('info', 'Generating products & services section', { pagesCount: pages.length });
    
    // Extract example products section from the full example
    const exampleProductsSection = extractSectionFromExample(exampleLlmsFullTxt, 'products');
    
    // Prepare data for the model
    const data = {
      companyName,
      pages: pages.map(page => ({
        title: page.title,
        description: page.metaDescription || '',
        headings: page.headings || [],
        url: page.url,
        content: page.content || ''
      }))
    };
    
    // Create detailed prompt for this section
    const prompt = `
Generate the Products & Services section for an LLMS-full.txt file for ${companyName}. This section should be comprehensive and detailed, covering all major products and services offered by the company.

EXAMPLE OF A WELL-FORMATTED PRODUCTS & SERVICES SECTION:
${exampleProductsSection}

PRODUCTS & SERVICES DATA:
${JSON.stringify(data, null, 2)}

Generate ONLY the Products & Services section that follows this format exactly:

## Products & Services

- [Product/Service Name](URL): Detailed description including key features, target users, and value proposition
- [Product/Service Name](URL): Detailed description including key features, target users, and value proposition
...and so on for each product or service

Focus on creating a detailed, accurate, and comprehensive list of products and services. For each product or service:
1. Use the actual product name and its URL from the website
2. Provide a detailed description (at least 2-3 sentences) that explains what the product does
3. Include key features, benefits, and target audience if available
4. Make sure all major products and services are included

Follow the markdown formatting exactly. Use bullet points with the link format [Name](URL): Description.
`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // We want to keep the markdown formatting for this section
    return text.trim();
  } catch (error) {
    console.error('Error generating products section:', error);
    // Provide a fallback in case of error
    return `## Products & Services\n\nInformation about products and services could not be generated due to an error.`;
  }
}

/**
 * Generate developer resources section with example reference
 * @param {Object} model - Gemini model
 * @param {Array} pages - Pages about developer resources
 * @param {String} companyName - Company name
 * @param {String} exampleLlmsFullTxt - Example LLMS-full.txt to learn from
 * @returns {Promise<String>} - Generated section
 */
async function generateDeveloperSection(model, pages, companyName, exampleLlmsFullTxt) {
  try {
    await logActivity('info', 'Generating developer resources section', { pagesCount: pages.length });
    
    // Extract example developer section from the full example
    const exampleDeveloperSection = extractSectionFromExample(exampleLlmsFullTxt, 'developer');
    
    // Prepare data for the model
    const data = {
      companyName,
      pages: pages.map(page => ({
        title: page.title,
        description: page.metaDescription || '',
        headings: page.headings || [],
        url: page.url,
        content: page.content || ''
      }))
    };
    
    // Create detailed prompt for this section
    const prompt = `
Generate the Developer Resources section for an LLMS-full.txt file for ${companyName}. This section should comprehensively cover all technical documentation, APIs, SDKs, and developer tools offered by the company.

EXAMPLE OF A WELL-FORMATTED DEVELOPER RESOURCES SECTION:
${exampleDeveloperSection}

DEVELOPER RESOURCES DATA:
${JSON.stringify(data, null, 2)}

Generate ONLY the Developer Resources section that follows this format exactly:

## Developer Resources

- [Resource Name](URL): Detailed description of the resource including what it contains and how developers can use it
- [Resource Name](URL): Detailed description of the resource including what it contains and how developers can use it
...and so on for each developer resource

If there are APIs available, include information about them, such as:
- Authentication methods
- Available endpoints or functionality
- Documentation or reference links

If there are SDKs or libraries available, list them with:
- Supported programming languages
- Key features and functions
- Installation or getting started information

Focus on creating a comprehensive technical resource section. If the company doesn't have developer resources, provide alternatives like technical documentation or contact information for technical support.

Follow the markdown formatting exactly. Use bullet points with the link format [Name](URL): Description.
`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // We want to keep the markdown formatting for this section
    return text.trim();
  } catch (error) {
    console.error('Error generating developer section:', error);
    // Provide a fallback in case of error
    return `## Developer Resources\n\nInformation about developer resources could not be generated due to an error.`;
  }
}

/**
 * Generate educational resources section with example reference
 * @param {Object} model - Gemini model
 * @param {Array} pages - Pages about educational resources
 * @param {String} companyName - Company name
 * @param {String} exampleLlmsFullTxt - Example LLMS-full.txt to learn from
 * @returns {Promise<String>} - Generated section
 */
async function generateEducationalSection(model, pages, companyName, exampleLlmsFullTxt) {
  try {
    await logActivity('info', 'Generating educational resources section', { pagesCount: pages.length });
    
    // Extract example educational section from the full example
    const exampleEducationalSection = extractSectionFromExample(exampleLlmsFullTxt, 'educational');
    
    // Prepare data for the model
    const data = {
      companyName,
      pages: pages.map(page => ({
        title: page.title,
        description: page.metaDescription || '',
        headings: page.headings || [],
        url: page.url,
        content: page.content || ''
      }))
    };
    
    // Create detailed prompt for this section
    const prompt = `
Generate the Educational Resources section for an LLMS-full.txt file for ${companyName}. This section should cover tutorials, guides, blog posts, and other educational content provided by the company.

EXAMPLE OF A WELL-FORMATTED EDUCATIONAL RESOURCES SECTION:
${exampleEducationalSection}

EDUCATIONAL RESOURCES DATA:
${JSON.stringify(data, null, 2)}

Generate ONLY the Educational Resources section that follows this format exactly:

## Educational Resources

- [Resource Name](URL): Description of what the resource teaches or explains
- [Resource Name](URL): Description of what the resource teaches or explains
...and so on for each educational resource

Include resources such as:
- Tutorials and getting started guides
- Knowledge base articles
- Blog posts with educational content
- FAQs and troubleshooting guides
- Video tutorials or webinars
- Whitepapers or research

Focus on creating a comprehensive list of resources that would help users learn about the company's products or services. For each resource, explain what topics it covers and what the user will learn.

Follow the markdown formatting exactly. Use bullet points with the link format [Name](URL): Description.
`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // We want to keep the markdown formatting for this section
    return text.trim();
  } catch (error) {
    console.error('Error generating educational section:', error);
    // Provide a fallback in case of error
    return `## Educational Resources\n\nInformation about educational resources could not be generated due to an error.`;
  }
}

/**
 * Generate legal and compliance section with example reference
 * @param {Object} model - Gemini model
 * @param {Array} pages - Pages about legal and compliance
 * @param {String} companyName - Company name
 * @param {String} exampleLlmsFullTxt - Example LLMS-full.txt to learn from
 * @returns {Promise<String>} - Generated section
 */
async function generateLegalSection(model, pages, companyName, exampleLlmsFullTxt) {
  try {
    await logActivity('info', 'Generating legal & compliance section', { pagesCount: pages.length });
    
    // Extract example legal section from the full example
    const exampleLegalSection = extractSectionFromExample(exampleLlmsFullTxt, 'legal');
    
    // Prepare data for the model
    const data = {
      companyName,
      pages: pages.map(page => ({
        title: page.title,
        description: page.metaDescription || '',
        headings: page.headings || [],
        url: page.url,
        content: page.content || ''
      }))
    };
    
    // Create detailed prompt for this section
    const prompt = `
Generate the Legal & Compliance section for an LLMS-full.txt file for ${companyName}. This section should cover all legal policies, terms of service, privacy policies, and compliance information.

EXAMPLE OF A WELL-FORMATTED LEGAL & COMPLIANCE SECTION:
${exampleLegalSection}

LEGAL & COMPLIANCE DATA:
${JSON.stringify(data, null, 2)}

Generate ONLY the Legal & Compliance section that follows this format exactly:

## Legal & Compliance

- [Privacy Policy](URL): Brief description of what the privacy policy covers (if relevant)
- [Terms of Service](URL): Brief description of what the terms cover (if relevant)
- [Security Information](URL): Information about the company's security practices and compliance standards
- [Additional Policy Name](URL): Description of any other relevant legal policies

Ensure all official legal documents are included with their correct titles and URLs. For each document, provide a brief description of what it covers if that information is available. For privacy policies and terms of service, descriptions are optional.

If there is information about security practices, compliance certifications (like SOC 2, GDPR, HIPAA, etc.), or data handling policies, be sure to include these.

Follow the markdown formatting exactly. Use bullet points with the link format [Name](URL): Description.
`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // We want to keep the markdown formatting for this section
    return text.trim();
  } catch (error) {
    console.error('Error generating legal section:', error);
    // Provide a fallback in case of error
    return `## Legal & Compliance\n\nInformation about legal policies could not be generated due to an error.`;
  }
}

/**
 * Generate support and community section with example reference
 * @param {Object} model - Gemini model
 * @param {Array} pages - Pages about support and community
 * @param {String} companyName - Company name
 * @param {String} exampleLlmsFullTxt - Example LLMS-full.txt to learn from
 * @returns {Promise<String>} - Generated section
 */
async function generateSupportSection(model, pages, companyName, exampleLlmsFullTxt) {
  try {
    await logActivity('info', 'Generating support & community section', { pagesCount: pages.length });
    
    // Extract example support section from the full example
    const exampleSupportSection = extractSectionFromExample(exampleLlmsFullTxt, 'support');
    
    // Prepare data for the model
    const data = {
      companyName,
      pages: pages.map(page => ({
        title: page.title,
        description: page.metaDescription || '',
        headings: page.headings || [],
        url: page.url,
        content: page.content || ''
      }))
    };
    
    // Create detailed prompt for this section
    const prompt = `
Generate the Support & Community section for an LLMS-full.txt file for ${companyName}. This section should cover all support channels, community resources, and ways to connect with the company and other users.

EXAMPLE OF A WELL-FORMATTED SUPPORT & COMMUNITY SECTION:
${exampleSupportSection}

SUPPORT & COMMUNITY DATA:
${JSON.stringify(data, null, 2)}

Generate ONLY the Support & Community section that follows this format exactly:

## Support & Community

- [Support Channel Name](URL): Description of the support channel and what kind of help users can get there
- [Community Resource Name](URL): Description of the community resource and what users can find there
...and so on for each support channel or community resource

Include resources such as:
- Customer support portals or contact forms
- Knowledge bases and help centers
- Community forums or discussion groups
- Social media channels
- Status pages for service monitoring
- User groups or meetups
- GitHub repositories or open source projects
- Bug reporting systems
- Feedback mechanisms

For each resource, explain what kind of assistance users can get, typical response times (if mentioned), and any limitations of the service.

Follow the markdown formatting exactly. Use bullet points with the link format [Name](URL): Description.
`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // We want to keep the markdown formatting for this section
    return text.trim();
  } catch (error) {
    console.error('Error generating support section:', error);
    // Provide a fallback in case of error
    return `## Support & Community\n\nInformation about support resources could not be generated due to an error.`;
  }
}

/**
 * Extract a specific section from the example LLMS-full.txt file
 * @param {string} exampleText - The full example text
 * @param {string} sectionType - The type of section to extract (company, products, developer, etc.)
 * @returns {string} - The extracted section text
 */
function extractSectionFromExample(exampleText, sectionType) {
  // Default section patterns to look for
  const sectionPatterns = {
    company: /^#.*?(?=\n## )/s,
    products: /^## Products.*?(?=\n## )/s,
    developer: /^## Developer.*?(?=\n## )/s,
    educational: /^## Educational.*?(?=\n## )/s,
    legal: /^## Legal.*?(?=\n## )/s,
    support: /^## Support.*?(?=\n##|$)/s
  };
  
  // Try to extract the section
  const pattern = sectionPatterns[sectionType];
  if (!pattern) {
    return "Section not found in example.";
  }
  
  const match = exampleText.match(pattern);
  return match ? match[0].trim() : "Section not found in example.";
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