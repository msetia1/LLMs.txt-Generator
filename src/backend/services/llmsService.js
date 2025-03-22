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
    await logActivity('info', 'Beginning website crawl');
    await page.goto(websiteUrl, { 
      waitUntil: 'networkidle',
      timeout: 30000 // 30 seconds timeout for page load
    });
    
    // Wait a bit for any JavaScript to execute
    await page.waitForTimeout(2000);
    
    // Extract links from the main page
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors
        .map(a => ({ 
          url: a.href, 
          text: a.textContent.trim() 
        }))
        .filter(link => link.url && link.url.startsWith(window.location.origin));
    });
    
    if (links.length === 0) {
      console.log('No links found on the page. This might indicate an issue with the website structure or JavaScript rendering.');
    }
    
    // Filter and prioritize important pages
    const importantLinks = prioritizeLinks(links, websiteUrl);
    await logActivity('info', 'Website crawl completed', { 
      pagesCount: importantLinks.length 
    });
    
    // Limit to top 10 most important pages to keep processing time reasonable
    const pagesToVisit = importantLinks.slice(0, 10);
    
    // Visit each page and extract content
    const pages = [];
    for (const linkObj of pagesToVisit) {
      try {
        await page.goto(linkObj.url, { 
          waitUntil: 'networkidle',
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
        }
      } catch (error) {
        console.error(`Error visiting page ${linkObj.url}:`, error.message);
        // Continue with next page
        continue;
      }
    }
    
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
    timeout: 120000 // 2 minutes timeout for the entire operation
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();
  
  try {
    await logActivity('info', 'Beginning deep website crawl');
    await page.goto(websiteUrl, { 
      waitUntil: 'networkidle',
      timeout: 45000 // 45 seconds timeout for main page load
    });
    
    // Wait for dynamic content to load
    await page.waitForTimeout(3000);
    
    // First extract links from the main page
    console.log('Extracting links from main page');
    let links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors
        .map(a => ({ 
          url: a.href, 
          text: a.textContent.trim() 
        }))
        .filter(link => link.url && link.url.startsWith(window.location.origin));
    });
    
    // Get all unique links
    links = [...new Map(links.map(link => [link.url, link])).values()];
    
    // Now visit additional key pages if they aren't in the links yet
    const baseUrl = new URL(websiteUrl);
    const keyPaths = [
      '/about', '/about-us', '/company', 
      '/products', '/services', '/features',
      '/pricing', '/plans',
      '/docs', '/documentation', '/developers',
      '/api', '/developers/api',
      '/blog', '/news',
      '/contact', '/support'
    ];
    
    // Add potential key pages to our link list
    for (const path of keyPaths) {
      const potentialUrl = new URL(path, baseUrl).toString();
      if (!links.some(link => link.url === potentialUrl)) {
        links.push({ url: potentialUrl, text: path.replace('/', '') });
      }
    }
    
    // Check site navigation for more potential links
    try {
      const navLinks = await page.evaluate(() => {
        const navItems = Array.from(document.querySelectorAll('nav a, header a, .nav a, .navigation a, .menu a, .sidebar a, footer a'));
        return navItems
          .map(a => ({ 
            url: a.href, 
            text: a.textContent.trim() 
          }))
          .filter(link => link.url && link.url.startsWith(window.location.origin));
      });
      
      // Add new navigation links to our links array
      for (const navLink of navLinks) {
        if (!links.some(link => link.url === navLink.url)) {
          links.push(navLink);
        }
      }
    } catch (navError) {
      console.error('Error extracting navigation links:', navError);
    }
    
    // ENHANCED: Look for documentation pages specifically
    const docLinks = links.filter(link => {
      const url = link.url.toLowerCase();
      return url.includes('/docs') || 
             url.includes('/documentation') || 
             url.includes('/guide') || 
             url.includes('/developer') ||
             url.includes('/api');
    });
    
    // We will visit more pages and do a deeper crawl for documentation
    const allVisitedUrls = new Set();
    const pages = [];
    
    // First prioritize and visit main navigation links
    const mainPagesToVisit = prioritizeLinks(links, websiteUrl).slice(0, 60); // Increased from 40 to 60
    
    for (const linkObj of mainPagesToVisit) {
      if (allVisitedUrls.has(linkObj.url)) continue;
      
      try {
        await page.goto(linkObj.url, { 
          waitUntil: 'networkidle',
          timeout: 20000 // 20 seconds timeout for each subpage
        });
        
        // Mark as visited
        allVisitedUrls.add(linkObj.url);
        
        // Wait for dynamic content
        await page.waitForTimeout(1000);
        
        // Extract page data using the same method as before
        const pageData = await extractPageDetails(page);
        
        if (pageData.content && pageData.content.length > 150) {
          // Format headings for better usability
          const formattedHeadings = [];
          if (pageData.headings.h1 && pageData.headings.h1.length > 0) {
            formattedHeadings.push(...pageData.headings.h1);
          }
          if (pageData.headings.h2 && pageData.headings.h2.length > 0) {
            formattedHeadings.push(...pageData.headings.h2.slice(0, 10)); // Top 10 h2 headings (increased from 5)
          }
          
          pages.push({
            title: pageData.title,
            url: linkObj.url,
            metaDescription: pageData.metaDescription,
            headings: formattedHeadings,
            links: pageData.pageLinks,
            content: pageData.content.substring(0, 8000) // Increased from 5000 to 8000
          });
          
          // ENHANCED: For documentation pages, also collect their links for recursive crawling
          if (isDocumentationPage(linkObj.url)) {
            // Extract links from this documentation page to follow later
            const subLinks = await page.evaluate(() => {
              const anchors = Array.from(document.querySelectorAll('a'));
              return anchors
                .map(a => ({ 
                  url: a.href, 
                  text: a.textContent.trim() 
                }))
                .filter(link => link.url && link.url.startsWith(window.location.origin));
            });
            
            // Add unique sublinks to our collection
            for (const subLink of subLinks) {
              if (!links.some(link => link.url === subLink.url)) {
                links.push(subLink);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error visiting page ${linkObj.url}:`, error.message);
        // Continue with next page
      }
    }
    
    // ENHANCED: Now specifically target documentation pages with deeper crawling
    const docPagesToVisit = prioritizeLinks(docLinks, websiteUrl).slice(0, 150); // Added deeper crawl of up to 150 doc pages
    console.log(`Found ${docPagesToVisit.length} documentation pages to visit for deeper crawl`);
    
    for (const docLink of docPagesToVisit) {
      if (allVisitedUrls.has(docLink.url)) continue;
      
      try {
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
            content: pageData.content.substring(0, 8000),
            isDocumentation: true
          });
          
          // Also collect sub-documentation links
          const subDocLinks = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('.docs-nav a, .documentation-nav a, .sidebar a, aside a, .toc a, nav a'));
            return anchors
              .map(a => ({ 
                url: a.href, 
                text: a.textContent.trim() 
              }))
              .filter(link => link.url && link.url.startsWith(window.location.origin));
          });
          
          // Process important sub-documentation links immediately (depth-first approach)
          for (const subDocLink of subDocLinks.slice(0, 10)) { // Process top 10 sub-links from each doc page
            if (allVisitedUrls.has(subDocLink.url)) continue;
            
            try {
              await page.goto(subDocLink.url, { 
                waitUntil: 'networkidle',
                timeout: 15000 
              });
              
              // Mark as visited
              allVisitedUrls.add(subDocLink.url);
              
              // Extract page details
              const subPageData = await extractPageDetails(page);
              
              if (subPageData.content && subPageData.content.length > 150) {
                // Format headings for sub-documentation
                const subFormattedHeadings = [];
                if (subPageData.headings.h1 && subPageData.headings.h1.length > 0) {
                  subFormattedHeadings.push(...subPageData.headings.h1);
                }
                if (subPageData.headings.h2 && subPageData.headings.h2.length > 0) {
                  subFormattedHeadings.push(...subPageData.headings.h2);
                }
                
                pages.push({
                  title: subPageData.title,
                  url: subDocLink.url,
                  metaDescription: subPageData.metaDescription,
                  headings: subFormattedHeadings,
                  links: subPageData.pageLinks,
                  content: subPageData.content.substring(0, 5000),
                  isDocumentation: true,
                  parentDoc: docLink.url
                });
              }
            } catch (subError) {
              console.error(`Error visiting sub-documentation page ${subDocLink.url}:`, subError.message);
              // Continue with next page
            }
          }
        }
      } catch (error) {
        console.error(`Error visiting documentation page ${docLink.url}:`, error.message);
        // Continue with next page
      }
    }
    
    await logActivity('info', 'Deep website crawl completed', { 
      pagesCount: pages.length,
      uniqueUrlsVisited: allVisitedUrls.size
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
  return lowerUrl.includes('/docs') || 
         lowerUrl.includes('/documentation') || 
         lowerUrl.includes('/guide') || 
         lowerUrl.includes('/developer') ||
         lowerUrl.includes('/api') ||
         lowerUrl.includes('/reference') ||
         lowerUrl.includes('/getting-started') ||
         lowerUrl.includes('/tutorials');
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
    
    // Get meta description
    let metaDescription = '';
    const metaDescTag = document.querySelector('meta[name="description"]');
    if (metaDescTag) {
      metaDescription = metaDescTag.getAttribute('content');
    }
    
    // Get all headings with their text content
    const headings = {};
    ['h1', 'h2', 'h3'].forEach(tagName => {
      headings[tagName] = Array.from(document.querySelectorAll(tagName))
        .map(h => h.textContent.trim())
        .filter(h => h.length > 0);
    });
    
    // Get all link texts in the page
    const pageLinks = Array.from(document.querySelectorAll('a'))
      .map(a => ({
        text: a.textContent.trim(),
        url: a.href
      }))
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
    
    return { 
      title, 
      metaDescription, 
      headings, 
      pageLinks,
      content 
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
    if (lowerUrl.includes('/api') || lowerText.includes('api')) score += 9;
    if (lowerUrl.includes('/docs') || lowerText.includes('documentation')) score += 9;
    if (lowerUrl.includes('/pricing') || lowerText.includes('pricing')) score += 6;
    if (lowerUrl.includes('/contact') || lowerText.includes('contact')) score += 5;
    if (lowerUrl.includes('/blog') || lowerText.includes('blog')) score += 4;
    
    // Prioritize shorter URLs (likely main pages)
    const pathSegments = new URL(link.url).pathname.split('/').filter(Boolean);
    score -= pathSegments.length;
    
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
    // Prepare data for the model
    const data = {
      companyName,
      companyDescription,
      pages: pages.slice(0, 20).map(page => ({
        title: page.title,
        description: page.description ? page.description.substring(0, 300) : '',
        headings: page.headings ? page.headings.slice(0, 10) : [],
        url: page.url,
        content: page.content ? page.content.substring(0, 1000) : ''
      }))
    };

    // Create prompt for the model
    const prompt = `
I need you to generate a comprehensive LLMS.txt file for ${companyName} that follows the standard format used by companies like Cloudflare. This should be a plain text file (no HTML or markdown) summarizing the key information about the company, its services, policies, and important links.

Here's the data from their website:
${JSON.stringify(data, null, 2)}

Generate an LLMS.txt file with the following characteristics:
1. Start with the company name as a header
2. Include a short description/mission statement
3. List key products/services with brief descriptions
4. Include meaningful section headers to organize the content
5. Add important links with descriptive text (not just raw URLs)
6. Include policy information (privacy, terms, security) if available
7. Make it comprehensive but concise
8. Structure it in a clear, hierarchical format
9. DO NOT use any markdown formatting like #, *, >, or \`\`\`
10. Format should be plain text with clear sections and indentation
11. Keep the tone professional and informative

The format should follow this structure (but with real content):

${companyName}
===========

${companyName} provides [brief description of main service/product].

Products & Services:
-------------------
- Service 1: Description of service 1
- Service 2: Description of service 2

Documentation:
-------------
- API Reference: https://example.com/api
- Developer Guide: https://example.com/developers

Legal & Security:
---------------
- Privacy Policy: https://example.com/privacy
- Terms of Service: https://example.com/terms

The content should be 100% plain text with NO markdown formatting.
`;

    console.log('Generating LLMS.txt content using AI model...');
    const result = await genAI.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Clean up any markdown formatting that might still be in the text
    return cleanMarkdownFormatting(text);
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
    // Prepare more comprehensive data for the model
    const data = {
      companyName,
      companyDescription,
      pages: pages.slice(0, 100).map(page => ({
        title: page.title,
        description: page.description ? page.description.substring(0, 500) : '',
        headings: page.headings ? page.headings.slice(0, 30) : [],
        url: page.url,
        content: page.content ? page.content.substring(0, 1500) : ''
      }))
    };

    // Create detailed prompt for the model
    const prompt = `
I need you to generate a very detailed and comprehensive LLMS-full.txt file for ${companyName} that follows the format used by major companies like Cloudflare. The file should be a comprehensive plain text document (no HTML or markdown) that includes detailed information about the company, its products, services, documentation, and important links.

Here's the data from their website:
${JSON.stringify(data, null, 2)}

Generate an LLMS-full.txt file with the following characteristics:
1. Start with the company name as a prominent header
2. Include a detailed company description/mission statement
3. Provide comprehensive information about each product/service with detailed descriptions
4. Organize content with clear, hierarchical section headers
5. Include ALL important links with descriptive text explaining what each link is for
6. Add detailed policy information (privacy, terms of service, security, compliance)
7. Include information about API documentation, developer resources, and technical guides if available
8. Add contact information, support options, and community resources
9. Format should be plain text with clear sections, indentation, and spacing for readability
10. DO NOT use any markdown formatting like #, *, >, or \`\`\`
11. Make the content extremely detailed but well-organized
12. Keep the tone professional and informative

The format should follow this structure (but with real, comprehensive content):

${companyName}
===========================================================

${companyName} is [detailed company description including mission, background, and core offerings].

PRODUCTS & SERVICES
-------------------

1. [Product Name]
   Description: Detailed explanation of the product
   Features:
   - Feature 1: Explanation
   - Feature 2: Explanation
   Use cases:
   - Use case 1
   - Use case 2
   Documentation: https://example.com/product-docs

2. [Service Name]
   Description: Detailed explanation of the service
   ...

DEVELOPER RESOURCES
------------------

API Documentation:
- REST API: https://example.com/api
  The REST API provides programmatic access to [description]
- GraphQL API: https://example.com/graphql
  The GraphQL API allows developers to [description]

SDKs & Libraries:
- JavaScript SDK: https://example.com/js-sdk
- Python SDK: https://example.com/python-sdk
...

LEGAL INFORMATION
----------------

Privacy Policy: https://example.com/privacy
[Summary of key privacy policy points]

Terms of Service: https://example.com/terms
[Summary of key terms of service]

Security & Compliance:
- Security Program: https://example.com/security
- Compliance Certifications: https://example.com/compliance
...

SUPPORT & COMMUNITY
------------------

Help Center: https://example.com/help
Community Forum: https://example.com/community
Support Contact: support@example.com

The content should be 100% plain text with NO markdown formatting.
`;

    console.log('Generating comprehensive LLMS-full.txt content using AI model...');
    const result = await genAI.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Clean up any markdown formatting that might still be in the text
    return cleanMarkdownFormatting(text);
  } catch (error) {
    console.error('Error generating LLMS-full content:', error);
    throw new Error(`Failed to generate LLMS-full content: ${error.message}`);
  }
}

/**
 * Clean markdown formatting from text
 * @param {string} text - Text to clean
 * @returns {string} - Cleaned markdown text
 */
function cleanMarkdownFormatting(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Remove code block indicators
  let cleanedText = text.replace(/```[a-z]*\n|```/g, '');
  
  // Remove markdown headers (# Header)
  cleanedText = cleanedText.replace(/^#{1,6}\s+/gm, '');
  
  // Remove bold/italic markers (* and _)
  cleanedText = cleanedText.replace(/(\*\*|__)(.*?)\1/g, '$2'); // Bold
  cleanedText = cleanedText.replace(/(\*|_)(.*?)\1/g, '$2');    // Italic
  
  // Remove inline code (` `)
  cleanedText = cleanedText.replace(/`([^`]+)`/g, '$1');
  
  // Remove blockquotes (> text)
  cleanedText = cleanedText.replace(/^\s*>\s+/gm, '');
  
  // Remove link syntax but keep the URL
  cleanedText = cleanedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2');
  
  // Remove horizontal rules (---, ___, ***)
  cleanedText = cleanedText.replace(/^(\*{3,}|-{3,}|_{3,})$/gm, '');
  
  // Remove list markers (-, *, +)
  cleanedText = cleanedText.replace(/^\s*[-*+]\s+/gm, '- ');
  
  // Remove numbered list markers (1., 2., etc.)
  cleanedText = cleanedText.replace(/^\s*\d+\.\s+/gm, '');
  
  // Ensure proper spacing after cleaning
  cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');
  
  // Ensure the text starts with a proper header (usually the company name)
  // and doesn't have excess space at the beginning
  cleanedText = cleanedText.trim();
  
  return cleanedText;
} 