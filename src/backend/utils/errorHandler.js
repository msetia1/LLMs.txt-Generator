/**
 * Custom error handler for the application
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Check if headers are already sent
  if (res.headersSent) {
    return next(err);
  }

  // Handle Supabase errors
  if (err.message && err.message.startsWith('Database error:')) {
    return res.status(500).json({
      success: false,
      error: 'Database Error',
      message: 'An error occurred while accessing the database. Please try again later.'
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: err.message
    });
  }

  // Handle website crawling errors
  if (err.message && (
    err.message.includes('Unable to access the website') ||
    err.message.includes('Could not extract any content') ||
    err.message.includes('Connection to') ||
    err.message.includes('Error crawling website')
  )) {
    return res.status(400).json({
      success: false,
      error: 'Website Crawling Error',
      message: err.message,
      suggestion: 'Please check that the website URL is correct and the site is accessible.'
    });
  }

  // Handle AI generation errors
  if (err.message && err.message.includes('Error generating content with AI')) {
    return res.status(500).json({
      success: false,
      error: 'Content Generation Error',
      message: 'We encountered an issue generating your LLMS.txt content.',
      technicalMessage: err.message,
      suggestion: 'Please try again later or contact support if the issue persists.'
    });
  }

  // Default error response
  res.status(500).json({
    success: false,
    error: 'Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred. Please try again later.' 
      : err.message,
    suggestion: 'Please try again or contact support if the issue persists.'
  });
};

module.exports = errorHandler; 