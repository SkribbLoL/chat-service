const express = require('express');
const cors = require('cors');
const http = require('http');

// Import singletons
const redisClient = require('./RedisSingleton');
const socketSingleton = require('./SocketSingleton');
const messageBus = require('./MessageBus');
const chatSocketHandler = require('./socket-handlers/ChatSocketHandler');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 5002;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    service: 'chat-service',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint with prefix
app.get('/chat/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    service: 'chat-service',
    timestamp: new Date().toISOString()
  });
});

// Initialize all services
async function initializeServices() {
  try {
    console.log('🚀 Initializing Chat Service...');

    // 1. Connect to Redis
    console.log('📦 Connecting to Redis...');
    await redisClient.connect();
    console.log('✅ Redis connected');

    // 2. Initialize RabbitMQ Message Bus
    console.log('🐰 Initializing RabbitMQ Message Bus...');
    await messageBus.initialize();
    console.log('✅ RabbitMQ Message Bus initialized');

    // 3. Setup Socket.IO
    console.log('🔌 Setting up Socket.IO...');
    socketSingleton.setup(server);
    console.log('✅ Socket.IO setup complete');

    // 4. Initialize Chat Socket Handler
    console.log('💬 Initializing Chat Socket Handler...');
    chatSocketHandler.initialize();
    console.log('✅ Chat Socket Handler initialized');

    console.log('🎉 Chat Service fully initialized and ready!');
  } catch (error) {
    console.error('❌ Failed to initialize Chat Service:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown() {
  console.log('🛑 Shutting down Chat Service...');
  
  try {
    // Close RabbitMQ connection
    await messageBus.close();
    console.log('✅ RabbitMQ connection closed');

    // Close Redis connection
    await redisClient.disconnect();
    console.log('✅ Redis connection closed');

    // Close HTTP server
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the server
server.listen(port, async () => {
  console.log(`🎯 Chat Service running on port ${port}`);
  await initializeServices();
});

// Export for testing
module.exports = { app, server };
