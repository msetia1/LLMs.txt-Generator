const express = require('express');
const router = express.Router();
const llmsController = require('../controllers/llmsController');

/**
 * @route POST /api/generate
 * @desc Generate LLMS.txt file based on website URL and company info
 * @access Public
 */
router.post('/generate', llmsController.generateLLMSTxt);

/**
 * @route POST /api/generate-full
 * @desc Generate comprehensive LLMS-full.txt file and send via email
 * @access Public
 */
router.post('/generate-full', llmsController.generateLLMSFullTxt);

module.exports = router; 