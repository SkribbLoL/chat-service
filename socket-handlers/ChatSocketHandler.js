const redisClient = require('../RedisSingleton');
const messageBus = require('../MessageBus');
const socketSingleton = require('../SocketSingleton');

class ChatSocketHandler {
  constructor() {
    this.io = null;
  }

  initialize() {
    this.io = socketSingleton.getIO();
    this.setupSocketEvents();
  }

  setupSocketEvents() {
    this.io.on('connection', (socket) => {
      console.log(`🎯 Chat user connected: ${socket.id}`);
      console.log(`🔍 Chat socket handshake:`, socket.handshake);

      // Join chat room
      socket.on('join-chat-room', async (data) => {
        await this.handleJoinChatRoom(socket, data);
      });

      // Handle chat messages
      socket.on('chat-message', async (data) => {
        await this.handleChatMessage(socket, data);
      });

      // Handle leaving chat room
      socket.on('leave-chat-room', async () => {
        await this.handleLeaveChatRoom(socket);
      });

      // Handle disconnect
      socket.on('disconnect', async (reason) => {
        console.log(`🔌 Chat user disconnected: ${socket.id}, reason: ${reason}`);
        await this.handleDisconnect(socket);
      });

      // Handle connection errors
      socket.on('error', (error) => {
        console.error(`💥 Chat socket error for ${socket.id}:`, error);
      });
    });

    // Handle Socket.IO server errors
    this.io.on('error', (error) => {
      console.error('💥 Chat Socket.IO server error:', error);
    });
  }

  async handleJoinChatRoom(socket, data) {
    try {
      const { roomCode, userId, username } = data;
      
      if (!roomCode || !userId) {
        return socket.emit('error', { message: 'Room code and user ID required' });
      }

      // Store socket information
      socket.roomCode = roomCode;
      socket.userId = userId;
      socket.username = username;
      socket.join(roomCode);

      // Store user in Redis
      await redisClient.addUserToRoom(roomCode, userId, {
        username,
        socketId: socket.id,
        joinedAt: Date.now()
      });

      // Get and send chat history
      const messages = await redisClient.getChatHistory(roomCode);
      socket.emit('chat-history', { messages });

      // Notify other users
      socket.to(roomCode).emit('user-joined-chat', { userId, username });

      console.log(`${username} joined chat room ${roomCode}`);
    } catch (error) {
      console.error('Error handling join chat room:', error);
      socket.emit('error', { message: 'Failed to join chat room' });
    }
  }

  async handleChatMessage(socket, data) {
    try {
      const { message } = data;
      const { roomCode, userId, username } = socket;

      if (!roomCode || !message) {
        return;
      }

      // Fast check: Get game state directly from Redis instead of using slow message bus
      let isGameActive = false;
      let isCorrect = false;
      let currentWord = null;

      try {
        // Get room data directly from Redis (much faster than RabbitMQ)
        const roomData = await redisClient.getRoomData(roomCode);
        if (roomData) {
          const room = JSON.parse(roomData);
          isGameActive = room.gameStarted && room.gamePhase === 'drawing';
          
          if (isGameActive && room.currentDrawer !== userId && room.currentWord) {
            // Check if guess is correct
            isCorrect = message.toLowerCase().trim() === room.currentWord.toLowerCase();
            currentWord = room.currentWord;
          }
        }
      } catch (error) {
        console.log('Could not check game state, treating as regular message:', error.message);
      }

      if (isCorrect && currentWord) {
        // Immediately broadcast celebration message to all users
        const celebrationMessage = {
          id: `correct-${Date.now()}-${userId}`,
          userId: 'system',
          username: 'System',
          message: `🎉 ${username} got it! The word was "${currentWord}" (+points incoming)`,
          timestamp: Date.now(),
          type: 'correct-guess'
        };

        // Store celebration message in Redis
        await redisClient.storeChatMessage(roomCode, celebrationMessage);

        // Broadcast celebration to all users immediately
        this.io.to(roomCode).emit('chat-message', celebrationMessage);

        // Notify game service about the correct guess (async, don't wait)
        if (messageBus) {
          messageBus.askGameService('check-guess', {
            roomCode,
            userId,
            guess: message.trim()
          }).catch(err => console.log('Game service notification failed:', err.message));
        }

        // Don't send the original guess message
        return;
      }

      const chatMessage = {
        id: `${Date.now()}-${userId}`,
        userId,
        username,
        message,
        timestamp: Date.now(),
        type: isGameActive ? 'guess' : 'message'
      };

      // Store message in Redis
      await redisClient.storeChatMessage(roomCode, chatMessage);

      // Broadcast to all users in room
      this.io.to(roomCode).emit('chat-message', chatMessage);
    } catch (error) {
      console.error('Error handling chat message:', error);
    }
  }

  async handleLeaveChatRoom(socket) {
    try {
      const { roomCode, userId, username } = socket;
      if (!roomCode) return;

      await redisClient.removeUserFromRoom(roomCode, userId);
      socket.to(roomCode).emit('user-left-chat', { userId, username });
      socket.leave(roomCode);

      console.log(`${username} left chat room ${roomCode}`);
    } catch (error) {
      console.error('Error handling leave chat room:', error);
    }
  }

  async handleDisconnect(socket) {
    try {
      const { roomCode, userId, username } = socket;
      if (roomCode && userId) {
        await redisClient.removeUserFromRoom(roomCode, userId);
        socket.to(roomCode).emit('user-left-chat', { userId, username });
      }
      console.log(`Chat user disconnected: ${socket.id}`);
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  }

  /**
   * Get the Socket.IO instance
   * @returns {Object} Socket.IO instance
   */
  getIO() {
    return this.io;
  }
}

module.exports = new ChatSocketHandler(); 