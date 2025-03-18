const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');

/**
 * @route GET /api/admin/generations
 * @desc Get all LLMS generations (with pagination)
 * @access Private (should be protected in production)
 */
router.get('/generations', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;
    
    // Get total count for pagination
    const { count, error: countError } = await supabase
      .from('llms_generations')
      .select('*', { count: 'exact', head: true });
      
    if (countError) throw new Error(`Database error: ${countError.message}`);
    
    // Get paginated data
    const { data, error } = await supabase
      .from('llms_generations')
      .select('*')
      .order('created_at', { ascending: false })
      .range(startIndex, startIndex + limit - 1);
      
    if (error) throw new Error(`Database error: ${error.message}`);
    
    res.status(200).json({
      success: true,
      data,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/admin/generations/:id
 * @desc Get a specific LLMS generation by ID
 * @access Private (should be protected in production)
 */
router.get('/generations/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('llms_generations')
      .select('*')
      .eq('id', id)
      .single();
      
    if (error) throw new Error(`Database error: ${error.message}`);
    
    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Generation not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 