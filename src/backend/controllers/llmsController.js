const llmsService = require('../services/llmsService');
const emailService = require('../services/emailService');
const validator = require('validator');
const supabase = require('../utils/supabaseClient');

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
    
    // Create a record in the database
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
    
    const generationId = generationData[0].id;
    
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