const express = require('express');
const router = express.Router();
const llmsController = require('../controllers/llmsController');

/**
 * @route POST /api/generate
 * @desc Generate LLMS.txt or LLMS-full.txt based on request parameters
 * @access Public
 */
router.post('/generate', llmsController.queueLLMSGeneration);

/**
 * @route GET /api/job/:id
 * @desc Get job status by ID
 * @access Public
 */
router.get('/job/:id', llmsController.getJobStatus);

/**
 * @route GET /api/job/:id/result
 * @desc Get job result by ID
 * @access Public
 */
router.get('/job/:id/result', llmsController.getJobResult);


module.exports = router; 