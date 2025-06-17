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
      // Allow both websocket and polling for better compatibility
      transports: ['websocket', 'polling'],
      upgrade: true, // Allow upgrade to websocket
      cors: {
        origin: "*", // Configure appropriately for production
        methods: ["GET", "POST"]
      },
      // Configure path for ingress routing - this is the key fix!
      path: '/chat/socket.io/',
      // Add connection timeout
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // Create namespace for chat
    this.io = this.io.of("/chat");

    console.log('Chat Socket.io initialized with namespace /chat');
    
    // Add connection logging for debugging
    this.io.on('connection', (socket) => {
      console.log(`🔌 New chat socket connected: ${socket.id}`);
      
      socket.on('disconnect', (reason) => {
        console.log(`❌ Chat socket disconnected: ${socket.id}, reason: ${reason}`);
      });
      
      socket.on('error', (error) => {
        console.error(`🔥 Chat socket error: ${socket.id}`, error);
      });

      // Add a test event for debugging
      socket.emit('welcome', { message: 'Connected to chat namespace' });
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