const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectToDatabase = require('../config/db');
const authRoutes = require('../routes/authRoutes');
const blogRoutes = require('../routes/blogRoutes');
const chatRoutes = require('../routes/chatRoutes');

const app = express();

// Global Middleware
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With'],
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware to ensure DB connection before handling requests
app.use(async (req, res, next) => {
  try {
    if (process.env.MONGODB_URI) {
      await connectToDatabase();
    }
  } catch (err) {
    console.error('[SafeBlog DB Middleware] Connection error:', err.message);
  }
  next();
});

// Root / Info Route
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Safe Blog API',
    status: 'online',
    version: '2.0.0',
    description: 'Stealth dual-interface journaling & private encrypted chat backend',
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const isDbConnected = Boolean(global.mongoose && global.mongoose.conn);
  res.status(200).json({
    status: 'healthy',
    databaseConnected: isDbConnected,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Direct alias for backward-compatible Phase 1 daily prompt
app.get('/api/blogs/prompts/today', (req, res) => {
  res.status(200).json({
    prompt: "What's one thing you've been keeping to yourself lately?",
    date: new Date().toISOString().split('T')[0],
    activeWritersCount: 51,
  });
});

// Modular Routes
app.use('/api/auth', authRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/chat', chatRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[SafeBlog Server Error]', err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Listen locally if executed directly (Not in Vercel Serverless environment)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`[SafeBlog] Server running on http://localhost:${PORT}`);
    console.log(`[SafeBlog] SSE Stream ready at http://localhost:${PORT}/api/chat/stream`);
  });
}

// Export for Vercel serverless deployment
module.exports = app;
