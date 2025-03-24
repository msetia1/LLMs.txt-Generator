const llmsService = require('../services/llmsService');
const emailService = require('../services/emailService');
const validator = require('validator');
const supabase = require('../utils/supabaseClient');
const axios = require('axios'); // Make sure to install axios if not already present

/**
 * Verify reCAPTCHA token with Google's API
 * @param {string} token - reCAPTCHA token from the client
 * @returns {Promise<boolean>} - Whether the token is valid
 */
async function verifyRecaptcha(token) {
  try {
    const response = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: token
        }
      }
    );
    
    return response.data.success;
  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    return false;
  }
}

/**
 * Generate LLMS.txt or LLMS-full.txt based on request parameters
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.generateLLMS = async (req, res, next) => {
  // Initialize generationId at the beginning of the function
  let generationId = null;
  
  try {
    const { companyName, companyDescription, websiteUrl, email, fullVersion, recaptchaToken } = req.body;
    
    // Validate required fields
    if (!companyName || !websiteUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Company name and website URL are required.'
      });
    }
    
    // Validate website URL format
    if (!validator.isURL(websiteUrl, { require_protocol: true })) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL',
        message: 'Please provide a valid website URL including http:// or https://'
      });
    }
    
    // If fullVersion is true, check for email and reCAPTCHA
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
      
      // Validate reCAPTCHA token
      if (!recaptchaToken) {
        return res.status(400).json({
          success: false,
          error: 'reCAPTCHA verification failed',
          message: 'Please complete the reCAPTCHA verification.'
        });
      }
      
      // Verify the reCAPTCHA token
      const isValidRecaptcha = await verifyRecaptcha(recaptchaToken);
      if (!isValidRecaptcha) {
        return res.status(400).json({
          success: false,
          error: 'reCAPTCHA verification failed',
          message: 'reCAPTCHA verification failed. Please try again.'
        });
      }
      
      console.log(`Starting enhanced deep crawl for ${websiteUrl} to generate LLMS-full.txt`);
    } else {
      
      console.log(`Starting standard crawl for ${websiteUrl} to generate LLMS.txt`);
    }
    
    // Insert a record into the database for this generation attempt
    const { data: generationData, error: insertError } = await supabase
      .from('llms_generations')
      .insert({
        company_name: companyName,
        company_description: companyDescription,
        website_url: websiteUrl,
        email: email || null,
        full_version: fullVersion === true
      })
      .select();
    
    if (insertError) {
      console.error('Error inserting into database:', insertError);
      throw new Error(`Database error: ${insertError.message}`);
    }
    
    // Set the generationId variable so it's available in the catch block
    generationId = generationData[0].id;
    
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
      
      // Check if Mailgun is configured
      if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
        return res.status(500).json({
          success: false,
          error: 'Email service not configured',
          message: 'Email service not configured. Please set MAILGUN_API_KEY and MAILGUN_DOMAIN in .env file.'
        });
      }
      
      // Start the generation process (this will be async and take longer)
      llmsService.generateLLMSFullTxt(companyName, companyDescription, websiteUrl, email)
        .then(async (llmsFullContent) => {
          // Update the record with the full content
          await supabase
            .from('llms_generations')
            .update({ 
              llms_full_content: llmsFullContent
            })
            .eq('id', generationId);
            
          // Send email with the generated content
          await emailService.sendLLMSFullEmail(email, companyName, llmsFullContent);
          
          // Update email_sent status
          await supabase
            .from('llms_generations')
            .update({ email_sent: true })
            .eq('id', generationId);
        })
        .catch(async (error) => {
          console.error('Error in background LLMS-full.txt generation:', error);
          // Update the record with the error
          await supabase
            .from('llms_generations')
            .update({ 
              error_message: error.message 
            })
            .eq('id', generationId);
        });
      
      // Return immediate success response
      return res.status(202).json({
        success: true,
        message: `Your comprehensive LLMS-full.txt file is being generated and will be sent to ${email} when ready.`
      });
    }
    
    // Generate regular LLMS.txt content
    const llmsContent = await llmsService.generateLLMSTxt(companyName, companyDescription, websiteUrl);
    
    // Update the record with the generated content
    const { error: updateError } = await supabase
      .from('llms_generations')
      .update({ llms_content: llmsContent })
      .eq('id', generationId);
    
    if (updateError) {
      console.error('Error updating database:', updateError);
    }
    
    // Return the generated content
    res.status(200).json({
      success: true,
      data: {
        content: llmsContent
      }
    });
  } catch (error) {
    console.error('Error generating LLMS.txt content:', error);
    
    // Check if we already have a database record for this attempt
    if (generationId) {
      try {
        // Update the record with the error message
        await supabase
          .from('llms_generations')
          .update({ 
            error_message: error.message,
            status: 'failed'
          })
          .eq('id', generationId);
      } catch (dbError) {
        console.error('Failed to update error in database:', dbError);
      }
    }
    
    // Send a well-formatted error response to the frontend
    res.status(500).json({
      success: false,
      error: error.message || 'An unknown error occurred',
      errorType: error.name || 'GeneralError',
      message: 'Failed to generate LLMS.txt content. Please check your inputs and try again.'
    });
  }
}; 