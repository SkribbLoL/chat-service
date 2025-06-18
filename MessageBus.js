const amqp = require('amqplib');
const socketSingleton = require('./SocketSingleton');

let instance = null;

class ChatMessageBus {
  constructor() {
    if (instance) {
      return instance;
    }

    this.connection = null;
    this.channel = null;
    this.exchanges = {
      gameEvents: 'game.events',
      gameRequests: 'game.requests',
      gameResponses: 'game.responses',
    };
    this.queues = {
      chatGameEvents: 'chat.game.events',
    };

    instance = this;
  }

  async initialize() {
    await this.connectWithRetry();
  }

  async connectWithRetry(maxRetries = 5, retryDelay = 5000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
        console.log(`Attempting RabbitMQ connection (attempt ${attempt}/${maxRetries})...`);
        
      // Connect to RabbitMQ
      const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
      this.connection = await amqp.connect(rabbitmqUrl);
      this.channel = await this.connection.createChannel();

      // Declare exchanges
      await this.channel.assertExchange(this.exchanges.gameEvents, 'topic', { durable: true });
      await this.channel.assertExchange(this.exchanges.gameRequests, 'direct', { durable: true });
      await this.channel.assertExchange(this.exchanges.gameResponses, 'direct', { durable: true });

      // Create queue for game events
      const gameEventsQueue = await this.channel.assertQueue(this.queues.chatGameEvents, { durable: true });
      await this.channel.bindQueue(gameEventsQueue.queue, this.exchanges.gameEvents, 'game.event.*');

      // Listen for game events
      await this.channel.consume(gameEventsQueue.queue, (msg) => {
        if (msg) {
          this.handleGameEvent(msg);
          this.channel.ack(msg);
        }
      }, { noAck: false });

      // Handle connection errors
      this.connection.on('error', (err) => {
        console.error('Chat RabbitMQ connection error:', err);
      });

      this.connection.on('close', () => {
        console.log('Chat RabbitMQ connection closed');
      });

      console.log('Chat service message bus initialized with RabbitMQ');
        return; // Success, exit retry loop
        
    } catch (error) {
        console.error(`Chat RabbitMQ connection attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxRetries) {
          console.error('Failed to initialize Chat RabbitMQ message bus after all retries');
      throw error;
        }
        
        console.log(`Retrying in ${retryDelay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  handleGameEvent(msg) {
    try {
      const event = JSON.parse(msg.content.toString());
      const { type, roomCode, data } = event;
      
      const io = socketSingleton.getIO();
      
      switch (type) {
        case 'game-started':
          io.to(roomCode).emit('game-mode-changed', { 
            isGameStarted: true, 
            message: 'Game started! Your messages will be treated as guesses.' 
          });
          break;
        case 'game-ended':
          io.to(roomCode).emit('game-mode-changed', { 
            isGameStarted: false, 
            message: 'Game ended! Back to chat mode.' 
          });
          break;
        case 'correct-guess':
          // Send detailed points information as a chat message
          if (data.message) {
            const pointsMessage = {
              id: `points-${Date.now()}-${data.userId}`,
              userId: 'system',
              username: 'System',
              message: data.message,
              timestamp: Date.now(),
              type: 'system'
            };
            
            io.to(roomCode).emit('chat-message', pointsMessage);
          }
          break;
        case 'new-round':
          // Clear chat and send new round notification
          io.to(roomCode).emit('new-round', {
            round: data.round,
            message: 'New round started! Chat cleared.'
          });
          break;
        case 'game-restarted':
          // Clear chat and send game restarted notification
          io.to(roomCode).emit('game-restarted', {
            message: 'Game restarted! Chat cleared.'
          });
          break;
        default:
          console.log(`Unhandled game event type: ${type}`);
      }
    } catch (error) {
      console.error('Error parsing game event:', error);
    }
  }

  /**
   * Ask game service for information via RabbitMQ request/response
   * @param {string} action - Action to perform
   * @param {Object} data - Data to send
   * @returns {Promise<Object>} Response from game service
   */
  async askGameService(action, data) {
    const requestId = `${Date.now()}-${Math.random()}`;
    const replyQueue = `chat.response.${requestId}`;
    
    try {
      // Create temporary queue for response
      await this.channel.assertQueue(replyQueue, { exclusive: true, autoDelete: true });
      
      const request = {
        id: requestId,
        action,
        data,
        replyTo: replyQueue,
        timestamp: Date.now()
      };

      // Send request to game service
      await this.channel.publish(
        this.exchanges.gameRequests,
        'game.request',
        Buffer.from(JSON.stringify(request)),
        { persistent: true }
      );

      // Wait for response (with timeout)
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ isGameActive: false, isCorrect: false });
        }, 1000); // 1 second timeout

        this.channel.consume(replyQueue, (msg) => {
          if (msg) {
            try {
              const response = JSON.parse(msg.content.toString());
              if (response.requestId === requestId) {
                clearTimeout(timeout);
                this.channel.ack(msg);
                resolve(response.data);
              }
            } catch (error) {
              console.error('Error parsing game response:', error);
              this.channel.nack(msg, false, false);
            }
          }
        }, { noAck: false });
      });
    } catch (error) {
      console.error('Error communicating with game service:', error);
      return { isGameActive: false, isCorrect: false };
    }
  }

  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (error) {
      console.error('Error closing Chat RabbitMQ connection:', error);
    }
  }
}

module.exports = new ChatMessageBus(); 