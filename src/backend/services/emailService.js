const nodemailer = require('nodemailer');

/**
 * Email service for sending LLMS-full.txt files
 */

// Create reusable transporter object using environment variables
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Send an email with the LLMS-full.txt content
 * @param {string} recipientEmail - Email address to send to
 * @param {string} companyName - Name of the company
 * @param {string} llmsFullContent - Generated LLMS-full.txt content
 * @returns {Promise<Object>} - Nodemailer send mail response
 */
exports.sendLLMSFullEmail = async (recipientEmail, companyName, llmsFullContent) => {
  try {
    // Create email options
    const mailOptions = {
      from: `"LLMS.txt Generator" <${process.env.EMAIL_USER}>`,
      to: recipientEmail,
      subject: `Your LLMS-full.txt file for ${companyName}`,
      text: `
Hello,

Thank you for using our LLMS.txt Generator. Attached is your comprehensive LLMS-full.txt file for ${companyName}.

You can save this file to your website's root directory as /llms-full.txt to make it accessible to AI systems.

For reference, here's the content of your LLMS-full.txt file:

${llmsFullContent}

Best regards,
The LLMS.txt Generator Team
      `,
      attachments: [
        {
          filename: 'llms-full.txt',
          content: llmsFullContent
        }
      ]
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email: ' + error.message);
  }
};

/**
 * Verify email configuration
 * @returns {Promise<boolean>} - True if email configuration is valid
 */
exports.verifyEmailConfig = async () => {
  try {
    await transporter.verify();
    return true;
  } catch (error) {
    console.error('Email configuration error:', error);
    return false;
  }
}; 