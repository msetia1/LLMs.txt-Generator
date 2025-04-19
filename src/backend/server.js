require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import routes
const llmsRoutes = require('./routes/llms');
const adminRoutes = require('./routes/admin');

// Import custom error handler
const errorHandler = require('./utils/errorHandler');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// Apply middleware
app.use(helmet()); // Security headers
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:8080',
    methods: ['GET', 'POST'],
    credentials: true
})); // Enable CORS
app.use(express.json({ limit: '1mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '1mb' })); // Parse URL-encoded bodies
app.use(morgan('dev')); // Logging

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.'
});

// Create a more lenient limiter for the LLMS generation endpoint
const llmsLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 requests per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many LLMS generation requests, please try again later.'
});

// Apply rate limiting to all requests
app.use(limiter);

// Apply the more lenient limiter specifically to the LLMS generation endpoint
app.use('/api/generate', llmsLimiter);

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../../src/frontend')));

// Configure server timeouts
app.use((req, res, next) => {
    // Set timeout for all requests to 10 minutes
    req.setTimeout(600000);
    res.setTimeout(600000);
    next();
});

app.get('/', (req, res) => {
    res.send('llms.txt generator api - visit /api for endpoints')
})

// Routes
app.use('/api', llmsRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Custom error handler
app.use(errorHandler);

// Start server with proper timeout configuration
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Configure server timeouts
server.timeout = 600000; // 10 minutes
server.keepAliveTimeout = 600000;
server.headersTimeout = 600000;

process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

module.exports = app; // For testing 