const Mailgun = require('mailgun.js');
const formData = require('form-data');
const mailgun = new Mailgun(formData);
const mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY });

/**
 * Email service for sending LLMS-full.txt files
 */

/**
 * Send an email with the LLMS-full.txt content using Mailgun
 * @param {string} recipientEmail - Email address to send to
 * @param {string} companyName - Name of the company
 * @param {string} llmsFullContent - Generated LLMS-full.txt content
 * @returns {Promise<Object>} - Mailgun send response
 */
exports.sendLLMSFullEmail = async (recipientEmail, companyName, llmsFullContent) => {
  try {
    // Create email data
    const messageData = {
      from: `HawkenAI llms.txt Generator <john@hawkenio.com>`,
      to: recipientEmail,
      subject: `Your llms-full.txt file for ${companyName}`,
      text: `
Hello,

Thank you for using Hawken's llms.txt Generator. Attached is your comprehensive llms-full.txt file for ${companyName}.

You can save this file to your website's root directory as /llms-full.txt to make it accessible to AI systems.

Building an AI startup? If you're ready to accelerate your roadmap, outpace competitors, and get to market faster than ever, let's talk.
Reply to this email to get in touch with us.

Best regards,
The Hawken Team
      `,
      attachment: [
        {
          filename: 'llms-full.txt',
          data: Buffer.from(llmsFullContent)
        }
      ]
    };

    // Send email using Mailgun
    const result = await mg.messages.create(process.env.MAILGUN_DOMAIN, messageData);
    console.log('Email sent with Mailgun:', result.id);
    return result;
  } catch (error) {
    console.error('Error sending email with Mailgun:', error);
    throw new Error('Failed to send email: ' + error.message);
  }
};

/**
 * Verify email configuration
 * @returns {Promise<boolean>} - True if email configuration is valid
 */
exports.verifyEmailConfig = async () => {
  try {
    // Simple check to see if Mailgun API key and domain are configured
    if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
      return false;
    }
    
    // We can't easily verify Mailgun credentials without sending a test email
    // So we'll just check if the credentials exist
    return true;
  } catch (error) {
    console.error('Email configuration error:', error);
    return false;
  }
}; 