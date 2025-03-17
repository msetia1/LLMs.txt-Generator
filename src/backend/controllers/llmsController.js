const llmsService = require('../services/llmsService');
const emailService = require('../services/emailService');
const validator = require('validator');

/**
 * Generate LLMS.txt or LLMS-full.txt based on request parameters
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.generateLLMS = async (req, res, next) => {
  try {
    const { companyName, companyDescription, websiteUrl, email, fullVersion } = req.body;
    
    // Validate required fields
    if (!companyName || !companyDescription || !websiteUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Company name, description, and website URL are required'
      });
    }

    // Validate URL
    if (!validator.isURL(websiteUrl, { require_protocol: true })) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL',
        message: 'Please provide a valid website URL (including http:// or https://)'
      });
    }
    
    // If fullVersion is true, validate email and generate LLMS-full.txt
    if (fullVersion === true) {
      // Validate email for full version
      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Missing email',
          message: 'Email is required for generating LLMS-full.txt'
        });
      }
      
      // Validate email format
      if (!validator.isEmail(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email',
          message: 'Please provide a valid email address'
        });
      }
      
      // Start the generation process (this will be async and take longer)
      llmsService.generateLLMSFullTxt(companyName, companyDescription, websiteUrl)
        .then(async (llmsFullContent) => {
          // Send email with the generated content
          await emailService.sendLLMSFullEmail(email, companyName, llmsFullContent);
        })
        .catch((error) => {
          console.error('Error in background LLMS-full.txt generation:', error);
          // We don't need to handle this error here as the response has already been sent
        });
      
      // Return immediate success response
      return res.status(202).json({
        success: true,
        message: `Your comprehensive LLMS-full.txt file is being generated and will be sent to ${email} when ready.`
      });
    }
    
    // Generate regular LLMS.txt content
    const llmsContent = await llmsService.generateLLMSTxt(companyName, companyDescription, websiteUrl);
    
    // Return the generated content
    res.status(200).json({
      success: true,
      data: {
        content: llmsContent
      }
    });
  } catch (error) {
    console.error('Error generating LLMS.txt content:', error);
    next(error);
  }
}; 