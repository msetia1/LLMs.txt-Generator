const express = require('express');
const router = express.Router();
const llmsController = require('../controllers/llmsController');

/**
 * @route POST /api/generate
 * @desc Generate LLMS.txt or LLMS-full.txt based on request parameters
 * @access Public
 */
router.post('/generate', llmsController.generateLLMS);

module.exports = router; 