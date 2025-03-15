/**
 * URL utility functions
 */

/**
 * Normalize a URL by ensuring it has a protocol and removing trailing slashes
 * @param {string} url - URL to normalize
 * @returns {string} - Normalized URL
 */
exports.normalizeUrl = (url) => {
  // Add protocol if missing
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  // Remove trailing slash
  return url.replace(/\/$/, '');
};

/**
 * Get the base domain from a URL
 * @param {string} url - URL to extract domain from
 * @returns {string} - Base domain
 */
exports.getBaseDomain = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.error('Error parsing URL:', error);
    return url;
  }
};

/**
 * Check if a URL is internal to a base URL
 * @param {string} url - URL to check
 * @param {string} baseUrl - Base URL to compare against
 * @returns {boolean} - True if URL is internal
 */
exports.isInternalUrl = (url, baseUrl) => {
  try {
    const urlObj = new URL(url);
    const baseUrlObj = new URL(baseUrl);
    return urlObj.hostname === baseUrlObj.hostname;
  } catch (error) {
    console.error('Error checking internal URL:', error);
    return false;
  }
};

/**
 * Get a clean path from a URL (remove protocol, domain, query params, etc.)
 * @param {string} url - URL to clean
 * @returns {string} - Clean path
 */
exports.getCleanPath = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname;
  } catch (error) {
    console.error('Error getting clean path:', error);
    return url;
  }
};

/**
 * Check if a URL is likely a content page (not an image, CSS, JS, etc.)
 * @param {string} url - URL to check
 * @returns {boolean} - True if URL is likely a content page
 */
exports.isContentUrl = (url) => {
  const lowerUrl = url.toLowerCase();
  
  // Check for common non-content file extensions
  const nonContentExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
    '.css', '.js', '.json', '.xml',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.rar', '.tar', '.gz',
    '.mp3', '.mp4', '.avi', '.mov', '.wmv'
  ];
  
  for (const ext of nonContentExtensions) {
    if (lowerUrl.endsWith(ext)) {
      return false;
    }
  }
  
  return true;
}; 