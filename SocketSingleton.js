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
        methods: ['GET', 'POST'],
      },
    });

    console.log('Chat Socket.io initialized');
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