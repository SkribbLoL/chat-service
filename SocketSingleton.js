const socketIO = require('socket.io');
let instance = null;

/**
 * Socket.io Singleton for Chat Service
 */
class ChatSocketSingleton {
  constructor() {
    if (instance) {
      return instance;
    }

    this.io = null;
    instance = this;
  }

  /**
   * Initialize Socket.io with the HTTP server
   * @param {Object} server - HTTP server instance
   */
  setup(server) {
    if (this.io) {
      console.log('Chat Socket.io already initialized');
      return this.io;
    }

    this.io = socketIO(server, {
      cors: {
        origin: '*', // In production, restrict this to your frontend URL
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization'],
      },
      path: '/socket.io/', // Keep default path
      allowEIO3: true,
      transports: ['polling', 'websocket'], // Polling first for better compatibility
      allowUpgrades: true,
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e6,
      
      // Additional options for proxy/ingress compatibility
      cookie: false,
      serveClient: false,
      
      // Enhanced logging for debugging
      allowRequest: (req, callback) => {
        console.log('🔍 Incoming Socket.IO request:', {
          origin: req.headers.origin,
          userAgent: req.headers['user-agent'],
          transport: req._query?.transport,
          path: req.url
        });
        callback(null, true);
      }
    });

    console.log('Chat Socket.io initialized');
    
    // Enhanced connection logging
    this.io.on('connection', (socket) => {
      console.log(`🔌 New chat socket connected: ${socket.id}`);
      console.log(`🔍 Transport: ${socket.conn.transport.name}`);
      console.log(`🔍 Remote address: ${socket.conn.remoteAddress}`);
      
      // Log transport upgrades
      socket.conn.on('upgrade', () => {
        console.log(`⬆️ Socket ${socket.id} upgraded to: ${socket.conn.transport.name}`);
      });
      
      socket.on('disconnect', (reason) => {
        console.log(`❌ Chat socket disconnected: ${socket.id}, reason: ${reason}`);
      });
      
      socket.on('error', (error) => {
        console.error(`🔥 Chat socket error: ${socket.id}`, error);
      });
    });

    // Global error handling
    this.io.engine.on('connection_error', (error) => {
      console.error('🔥 Socket.IO engine connection error:', error);
    });
    
    return this.io;
  }

  /**
   * Get the Socket.io instance
   * @returns {Object} Socket.io instance
   */
  getIO() {
    if (!this.io) {
      throw new Error('Chat Socket.io not initialized. Call setup() first.');
    }
    return this.io;
  }

  /**
   * Emit to a specific room
   * @param {string} roomCode - Room code
   * @param {string} event - Event name
   * @param {Object} data - Data to emit
   */
  emitToRoom(roomCode, event, data) {
    if (this.io) {
      this.io.to(roomCode).emit(event, data);
    }
  }

  /**
   * Get all sockets in a room
   * @param {string} roomCode - Room code
   * @returns {Set} Set of socket IDs
   */
  async getSocketsInRoom(roomCode) {
    if (this.io) {
      return await this.io.in(roomCode).allSockets();
    }
    return new Set();
  }
}

module.exports = new ChatSocketSingleton();