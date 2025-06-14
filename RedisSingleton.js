const redis = require('redis');
let instance = null;

class RedisChatClient {
  constructor() {
    if (instance) {
      return instance;
    }

    this.client = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    });

    // Handle connection events
    this.client.on('error', (err) => console.error('Redis Chat error:', err));
    this.client.on('connect', () => console.log('Chat service connected to Redis'));

    instance = this;
  }

  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
    return this.client;
  }

  async disconnect() {
    if (this.client.isOpen) {
      await this.client.disconnect();
    }
  }

  // Chat-specific Redis operations
  async storeChatMessage(roomCode, message) {
    const key = `chat:room:${roomCode}:messages`;
    await this.client.lPush(key, JSON.stringify(message));
    await this.client.lTrim(key, 0, 99); // Keep last 100 messages
  }

  async getChatHistory(roomCode) {
    const key = `chat:room:${roomCode}:messages`;
    const chatHistory = await this.client.lRange(key, 0, -1);
    return chatHistory.map(msg => JSON.parse(msg)).reverse();
  }

  async addUserToRoom(roomCode, userId, userData) {
    const key = `chat:room:${roomCode}:users`;
    await this.client.hSet(key, userId, JSON.stringify(userData));
  }

  async removeUserFromRoom(roomCode, userId) {
    const key = `chat:room:${roomCode}:users`;
    await this.client.hDel(key, userId);
  }

  async getRoomUsers(roomCode) {
    const key = `chat:room:${roomCode}:users`;
    const users = await this.client.hGetAll(key);
    const parsedUsers = {};
    for (const [userId, userData] of Object.entries(users)) {
      parsedUsers[userId] = JSON.parse(userData);
    }
    return parsedUsers;
  }

  // Generic Redis operations
  async get(key) {
    return this.client.get(key);
  }

  async set(key, value, options = {}) {
    return this.client.set(key, value, options);
  }

  async del(key) {
    return this.client.del(key);
  }

  async exists(key) {
    return this.client.exists(key);
  }
}

module.exports = new RedisChatClient(); 