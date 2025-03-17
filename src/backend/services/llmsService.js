const { GoogleGenerativeAI } = require('@google/generative-ai');
const cheerio = require('cheerio');
const axios = require('axios');
const playwright = require('playwright');
const urlUtils = require('../utils/urlUtils');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Generate LLMS.txt content based on company info and website
 * @param {string} companyName - Name of the company
 * @param {string} companyDescription - Description of the company
 * @param {string} websiteUrl - URL of the company website
 * @returns {Promise<string>} - Generated LLMS.txt content
 */
exports.generateLLMSTxt = async (companyName, companyDescription, websiteUrl) => {
  try {
    // Crawl the website to get important pages
    const pages = await crawlWebsite(websiteUrl);
    
    // Generate LLMS.txt content using Gemini AI
    const llmsContent = await generateLLMSContent(companyName, companyDescription, websiteUrl, pages);
    
    return llmsContent;
  } catch (error) {
    console.error('Error in LLMS.txt generation service:', error);
    throw new Error('Failed to generate LLMS.txt content: ' + error.message);
  }
};

/**
 * Generate comprehensive LLMS-full.txt content
 * @param {string} companyName - Name of the company
 * @param {string} companyDescription - Description of the company
 * @param {string} websiteUrl - URL of the company website
 * @returns {Promise<string>} - Generated LLMS-full.txt content
 */
exports.generateLLMSFullTxt = async (companyName, companyDescription, websiteUrl) => {
  try {
    // Perform a deeper crawl of the website
    const pages = await crawlWebsiteDeep(websiteUrl);
    
    // Generate comprehensive LLMS-full.txt content
    const llmsFullContent = await generateLLMSFullContent(companyName, companyDescription, websiteUrl, pages);
    
    return llmsFullContent;
  } catch (error) {
    console.error('Error in LLMS-full.txt generation service:', error);
    throw new Error('Failed to generate LLMS-full.txt content: ' + error.message);
  }
};

/**
 * Crawl website to extract important pages
 * @param {string} websiteUrl - URL of the website to crawl
 * @returns {Promise<Array>} - Array of page objects with title, url, and content
 */
async function crawlWebsite(websiteUrl) {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto(websiteUrl, { waitUntil: 'domcontentloaded' });
    
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
    
    // Filter and prioritize important pages
    const importantLinks = prioritizeLinks(links, websiteUrl);
    
    // Limit to top 10 most important pages to keep processing time reasonable
    const pagesToVisit = importantLinks.slice(0, 10);
    
    // Visit each page and extract content
    const pages = [];
    for (const linkObj of pagesToVisit) {
      try {
        await page.goto(linkObj.url, { waitUntil: 'domcontentloaded' });
        
        // Extract page title and main content
        const pageData = await page.evaluate(() => {
          // Get page title
          const title = document.title;
          
          // Get main content (prioritize main, article, or content divs)
          let content = '';
          const mainElement = document.querySelector('main') || 
                             document.querySelector('article') || 
                             document.querySelector('#content') ||
                             document.querySelector('.content');
          
          if (mainElement) {
            content = mainElement.textContent;
          } else {
            // Fallback to body content, excluding scripts, styles, etc.
            const bodyText = document.body.innerText;
            content = bodyText.substring(0, 5000); // Limit content length
          }
          
          return { title, content };
        });
        
        pages.push({
          title: pageData.title,
          url: linkObj.url,
          content: pageData.content.substring(0, 1000) // Limit content for basic version
        });
      } catch (error) {
        console.error(`Error visiting page ${linkObj.url}:`, error);
        // Continue with other pages
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
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto(websiteUrl, { waitUntil: 'networkidle' });
    
    // Extract all links from the main page
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors
        .map(a => ({ 
          url: a.href, 
          text: a.textContent.trim() 
        }))
        .filter(link => link.url && link.url.startsWith(window.location.origin));
    });
    
    // Get all unique links
    const uniqueLinks = [...new Map(links.map(link => [link.url, link])).values()];
    
    // Prioritize and take more links for the full version
    const pagesToVisit = prioritizeLinks(uniqueLinks, websiteUrl).slice(0, 25);
    
    // Visit each page and extract detailed content
    const pages = [];
    for (const linkObj of pagesToVisit) {
      try {
        await page.goto(linkObj.url, { waitUntil: 'networkidle' });
        
        // Extract page title, headings, and main content
        const pageData = await page.evaluate(() => {
          // Get page title
          const title = document.title;
          
          // Get headings
          const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
            .map(h => h.textContent.trim())
            .filter(h => h.length > 0);
          
          // Get main content with more detail
          let content = '';
          const mainElement = document.querySelector('main') || 
                             document.querySelector('article') || 
                             document.querySelector('#content') ||
                             document.querySelector('.content');
          
          if (mainElement) {
            content = mainElement.innerText;
          } else {
            // Fallback to body content, excluding scripts, styles, etc.
            content = document.body.innerText;
          }
          
          return { title, headings, content };
        });
        
        pages.push({
          title: pageData.title,
          url: linkObj.url,
          headings: pageData.headings,
          content: pageData.content.substring(0, 3000) // More content for full version
        });
      } catch (error) {
        console.error(`Error visiting page ${linkObj.url}:`, error);
        // Continue with other pages
      }
    }
    
    return pages;
  } finally {
    await browser.close();
  }
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
 * Generate LLMS.txt content using Gemini AI
 * @param {string} companyName - Name of the company
 * @param {string} companyDescription - Description of the company
 * @param {string} websiteUrl - URL of the company website
 * @param {Array} pages - Array of page objects with title, url, and content
 * @returns {Promise<string>} - Generated LLMS.txt content
 */
async function generateLLMSContent(companyName, companyDescription, websiteUrl, pages) {
  try {
    // Prepare data for Gemini AI
    const pagesSummary = pages.map(page => 
      `- Title: ${page.title}\n  URL: ${page.url}\n  Summary: ${page.content.substring(0, 200)}...`
    ).join('\n\n');
    
    // Create prompt for Gemini AI
    const prompt = `
Generate a valid LLMS.txt file for an AI startup with the following information:

Company Name: ${companyName}
Company Description: ${companyDescription}
Website URL: ${websiteUrl}

Important pages from the website:
${pagesSummary}

The LLMS.txt file should follow this format:
1. Start with an H1 header with the company name
2. Include a blockquote with a concise summary of what the company does
3. Add additional context about the company if relevant
4. Include sections with H2 headers for different categories of links
5. Under each section, include markdown links to important pages with brief descriptions

Make sure the output is valid markdown and follows the LLMS.txt specification. Do not include any hallucinations or fake pages. Only include real pages from the provided list. The output should be ready to use as an LLMS.txt file without any additional formatting or explanation.
`;

    // Generate content with Gemini AI
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const response = result.response;
    const llmsContent = response.text();
    
    return llmsContent;
  } catch (error) {
    console.error('Error generating LLMS content with Gemini AI:', error);
    throw new Error('Failed to generate LLMS.txt content with AI: ' + error.message);
  }
}

/**
 * Generate comprehensive LLMS-full.txt content
 * @param {string} companyName - Name of the company
 * @param {string} companyDescription - Description of the company
 * @param {string} websiteUrl - URL of the company website
 * @param {Array} pages - Array of page objects with title, url, and content
 * @returns {Promise<string>} - Generated LLMS-full.txt content
 */
async function generateLLMSFullContent(companyName, companyDescription, websiteUrl, pages) {
  try {
    // Prepare more detailed data for Gemini AI
    const pagesDetailed = pages.map(page => {
      const headings = page.headings ? `\n  Headings: ${page.headings.join(' | ')}` : '';
      return `- Title: ${page.title}\n  URL: ${page.url}${headings}\n  Content: ${page.content.substring(0, 500)}...`;
    }).join('\n\n');
    
    // Create more detailed prompt for Gemini AI
    const prompt = `
Generate a comprehensive LLMS-full.txt file for an AI startup with the following information:

Company Name: ${companyName}
Company Description: ${companyDescription}
Website URL: ${websiteUrl}

Detailed pages from the website:
${pagesDetailed}

The LLMS-full.txt file should be more comprehensive than a standard LLMS.txt file and should:
1. Start with an H1 header with the company name
2. Include a detailed blockquote with a thorough summary of what the company does
3. Add extensive context about the company, its products, services, and value proposition
4. Include sections with H2 headers for different categories of content
5. Under each section, include markdown links to important pages with detailed descriptions
6. Include content summaries where appropriate
7. Organize information in a way that would be most useful for AI systems

Make sure the output is valid markdown and follows the LLMS.txt specification but with more comprehensive content. Do not include any hallucinations or fake pages. Only include real pages from the provided list. The output should be ready to use as an LLMS-full.txt file without any additional formatting or explanation.
`;

    // Generate content with Gemini AI
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const response = result.response;
    const llmsFullContent = response.text();
    
    return llmsFullContent;
  } catch (error) {
    console.error('Error generating LLMS-full content with Gemini AI:', error);
    throw new Error('Failed to generate LLMS-full.txt content with AI: ' + error.message);
  }
} 