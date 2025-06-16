const Redis = require('ioredis');
let instance = null;

class RedisChatClient {
  constructor() {
    if (instance) {
      return instance;
    }

    this.client = new Redis({
      // Kubernetes/Helm configuration
      host: process.env.REDIS_HOST || 'redis-master.default.svc.cluster.local',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      
      // Docker Compose configuration (commented out)
      // Uncomment below and comment above for Docker Compose usage
      // host: process.env.REDIS_HOST || 'redis',
      // port: process.env.REDIS_PORT || 6379,
      // password: undefined, // No password for Docker Compose Redis
    });

    // Handle connection events
    this.client.on('error', (err) => console.error('Redis Chat error:', err));
    this.client.on('connect', () => console.log('Chat service connected to Redis'));

    instance = this;
  }

  async connect() {
    // ioredis connects automatically, no need for explicit connect
    return this.client;
  }

  async disconnect() {
    await this.client.quit();
  }

  // Chat-specific Redis operations
  async storeChatMessage(roomCode, message) {
    const key = `chat:room:${roomCode}:messages`;
    await this.client.lpush(key, JSON.stringify(message));
    await this.client.ltrim(key, 0, 99); // Keep last 100 messages
  }

  async getChatHistory(roomCode) {
    const key = `chat:room:${roomCode}:messages`;
    const chatHistory = await this.client.lrange(key, 0, -1);
    return chatHistory.map(msg => JSON.parse(msg)).reverse();
  }

  async addUserToRoom(roomCode, userId, userData) {
    const key = `chat:room:${roomCode}:users`;
    await this.client.hset(key, userId, JSON.stringify(userData));
  }

  async removeUserFromRoom(roomCode, userId) {
    const key = `chat:room:${roomCode}:users`;
    await this.client.hdel(key, userId);
  }

  async getRoomUsers(roomCode) {
    const key = `chat:room:${roomCode}:users`;
    const users = await this.client.hgetall(key);
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