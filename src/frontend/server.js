const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 8080;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

// Serve static files
app.use(express.static(path.join(__dirname)));

// Configure proxy with better error handling and timeouts
const proxyMiddleware = createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/api': '/api',
    },
    // Increase all timeouts to 10 minutes
    proxyTimeout: 600000,
    timeout: 600000,
    // Keep connections alive
    ws: true,
    // Error handling
    onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        if (!res.headersSent) {
            res.writeHead(500, {
                'Content-Type': 'application/json'
            });
            res.end(JSON.stringify({
                success: false,
                error: 'ProxyError',
                message: 'Lost connection to the server. Please try again.',
                suggestion: 'The server might be under heavy load. Try with a smaller website or wait a few minutes.'
            }));
        }
    },
    // Configure proxy options
    onProxyReq: (proxyReq, req, res) => {
        // Set timeout on the socket
        proxyReq.setTimeout(600000);
        // Keep the connection alive
        proxyReq.setHeader('Connection', 'keep-alive');
    },
    onProxyRes: (proxyRes, req, res) => {
        // Set timeout on the response
        res.setTimeout(600000);
        // Keep the connection alive
        proxyRes.headers['connection'] = 'keep-alive';
    }
});

// Apply proxy middleware
app.use('/api', proxyMiddleware);

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Configure server timeouts
const server = app.listen(PORT, () => {
    console.log(`Frontend server running on http://localhost:${PORT}`);
    console.log(`Proxying API requests to ${BACKEND_URL}`);
});

// Set server timeouts
server.timeout = 600000;
server.keepAliveTimeout = 600000;
server.headersTimeout = 600000; 