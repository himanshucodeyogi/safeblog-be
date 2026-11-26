const { EventEmitter } = require('events');

class SSEService extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(200);
    // Map of userId -> Set of response objects (supports multiple devices/tabs per user)
    this.clients = new Map();
  }

  /**
   * Register a new SSE connection for a user
   */
  addClient(userId, res, chatId = null) {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }

    const clientObj = { res, chatId };
    this.clients.get(userId).add(clientObj);

    // Initial handshake
    this.sendEventToClient(res, 'connected', {
      status: 'connected',
      userId,
      chatId: chatId || 'all',
      timestamp: new Date().toISOString(),
    });

    // Heartbeat every 20s to keep connection alive on Vercel
    const heartbeat = setInterval(() => {
      this.sendEventToClient(res, 'ping', { time: Date.now() });
    }, 20000);

    return () => {
      clearInterval(heartbeat);
      if (this.clients.has(userId)) {
        this.clients.get(userId).delete(clientObj);
        if (this.clients.get(userId).size === 0) {
          this.clients.delete(userId);
        }
      }
    };
  }

  /**
   * Format and send an event to a single HTTP response stream
   */
  sendEventToClient(res, eventName, data) {
    try {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      console.error('[SSEService] Error writing event to client:', err.message);
    }
  }

  /**
   * Broadcast a new message to participants
   */
  broadcastNewMessage(message, participantIds = []) {
    this.emit('new_message', message);

    participantIds.forEach((participantId) => {
      const pidStr = participantId.toString();
      if (this.clients.has(pidStr)) {
        const clientSet = this.clients.get(pidStr);
        for (const client of clientSet) {
          // If client is filtering for a specific chat, deliver only if matched
          if (!client.chatId || client.chatId === message.chatId.toString()) {
            this.sendEventToClient(client.res, 'new_message', message);
          }
        }
      }
    });
  }

  /**
   * Broadcast a message read receipt
   */
  broadcastReadReceipt(readReceipt, participantIds = []) {
    this.emit('message_read', readReceipt);

    participantIds.forEach((participantId) => {
      const pidStr = participantId.toString();
      if (this.clients.has(pidStr)) {
        const clientSet = this.clients.get(pidStr);
        for (const client of clientSet) {
          if (!client.chatId || client.chatId === readReceipt.chatId.toString()) {
            this.sendEventToClient(client.res, 'message_read', readReceipt);
          }
        }
      }
    });
  }

  /**
   * Broadcast an emoji reaction update
   */
  broadcastReaction(reactionData, participantIds = []) {
    this.emit('message_reaction', reactionData);

    participantIds.forEach((participantId) => {
      const pidStr = participantId.toString();
      if (this.clients.has(pidStr)) {
        const clientSet = this.clients.get(pidStr);
        for (const client of clientSet) {
          if (!client.chatId || client.chatId === reactionData.chatId.toString()) {
            this.sendEventToClient(client.res, 'message_reaction', reactionData);
          }
        }
      }
    });
  }
}

const sseService = new SSEService();
module.exports = sseService;
