const llmsService = require('../services/llmsService');
const emailService = require('../services/emailService');
const validator = require('validator');

/**
 * Generate LLMS.txt file based on website URL and company info
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.generateLLMSTxt = async (req, res, next) => {
  try {
    const { companyName, companyDescription, websiteUrl } = req.body;

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

    // Generate LLMS.txt content
    const llmsContent = await llmsService.generateLLMSTxt(companyName, companyDescription, websiteUrl);

    // Return the generated content
    res.status(200).json({
      success: true,
      data: {
        content: llmsContent
      }
    });
  } catch (error) {
    console.error('Error generating LLMS.txt:', error);
    next(error);
  }
};

/**
 * Generate comprehensive LLMS-full.txt file and send via email
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.generateLLMSFullTxt = async (req, res, next) => {
  try {
    const { companyName, companyDescription, websiteUrl, email } = req.body;

    // Validate required fields
    if (!companyName || !companyDescription || !websiteUrl || !email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Company name, description, website URL, and email are required'
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

    // Validate email
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

    // Return immediate success response (the email will be sent asynchronously)
    res.status(202).json({
      success: true,
      message: `Your comprehensive LLMS-full.txt file is being generated and will be sent to ${email} when ready.`
    });
  } catch (error) {
    console.error('Error initiating LLMS-full.txt generation:', error);
    next(error);
  }
}; 