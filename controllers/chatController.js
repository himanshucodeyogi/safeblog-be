const mongoose = require('mongoose');
const { PrivateChat, Message, User } = require('../models');
const sseService = require('../services/sseService');

/**
 * User Discovery in Secret Interface (PRD Section 2)
 * Searches for users by exact or prefix username / email
 * GET /api/chat/users/search
 */
exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    const currentUserId = req.user.userId;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const cleanQuery = q.trim().toLowerCase();

    // Find users by username or email, excluding current user
    const users = await User.find({
      _id: { $ne: currentUserId },
      $or: [
        { username: cleanQuery },
        { email: cleanQuery },
        { username: { $regex: '^' + cleanQuery, $options: 'i' } },
      ],
    })
      .select('_id username displayName avatarUrl')
      .limit(20);

    res.status(200).json({ success: true, count: users.length, users });
  } catch (error) {
    console.error('[ChatController.searchUsers] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get Telegram-Style Conversations List (Screenshots 11 & 13)
 * GET /api/chat/conversations
 */
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { folder, archived } = req.query;

    const query = {
      participants: userId,
    };

    if (archived === 'true') {
      query.archivedBy = userId;
    } else {
      query.archivedBy = { $ne: userId };
    }

    if (folder && folder !== 'all') {
      query.folder = folder;
    }

    const chats = await PrivateChat.find(query)
      .populate('participants', 'username displayName avatarUrl lastActiveDate')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 });

    // Format chat list for Telegram-style UI
    const formattedChats = chats.map((chat) => {
      const otherParticipant = chat.participants.find(
        (p) => p._id.toString() !== userId.toString()
      ) || chat.participants[0];

      const unreadCount =
        chat.unreadCounts && chat.unreadCounts.get
          ? chat.unreadCounts.get(userId.toString()) || 0
          : 0;

      const isMuted = chat.mutedBy && chat.mutedBy.includes(userId);

      return {
        id: chat._id,
        contact: {
          id: otherParticipant?._id,
          username: otherParticipant?.username || 'Unknown',
          displayName: otherParticipant?.displayName || otherParticipant?.username || 'Safe User',
          avatarUrl: otherParticipant?.avatarUrl || '',
          initials: (
            (otherParticipant?.displayName || otherParticipant?.username || 'SU')
              .substring(0, 2)
              .toUpperCase()
          ),
        },
        lastMessage: {
          preview: chat.lastMessagePreview || chat.lastMessage?.text || '',
          timestamp: chat.lastMessageAt,
          isOutgoing: chat.lastMessageSender?.toString() === userId.toString(),
          isRead: chat.lastMessage?.isRead || false,
        },
        unreadCount,
        isMuted,
        folder: chat.folder,
        updatedAt: chat.updatedAt,
      };
    });

    res.status(200).json({
      success: true,
      count: formattedChats.length,
      conversations: formattedChats,
    });
  } catch (error) {
    console.error('[ChatController.getConversations] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get or Create 1-on-1 Conversation
 * POST /api/chat/conversations
 */
exports.getOrCreateConversation = async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const { recipientId } = req.body;

    if (!recipientId) {
      return res.status(400).json({ error: 'recipientId is required' });
    }

    if (currentUserId.toString() === recipientId.toString()) {
      return res.status(400).json({ error: 'Cannot create a chat with yourself' });
    }

    // Verify recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient user not found' });
    }

    // Check if conversation already exists between these 2 users
    let chat = await PrivateChat.findOne({
      participants: { $all: [currentUserId, recipientId], $size: 2 },
    }).populate('participants', 'username displayName avatarUrl');

    if (!chat) {
      chat = await PrivateChat.create({
        participants: [currentUserId, recipientId],
        unreadCounts: new Map(),
      });
      chat = await chat.populate('participants', 'username displayName avatarUrl');
    }

    res.status(200).json({ success: true, conversation: chat });
  } catch (error) {
    console.error('[ChatController.getOrCreateConversation] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get Messages in Conversation (Screenshots 12 & 14)
 * GET /api/chat/conversations/:chatId/messages
 */
exports.getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.userId;
    const { limit = 50, before } = req.query;

    const chat = await PrivateChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Verify participant
    const isParticipant = chat.participants.some(
      (p) => p.toString() === userId.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    const messageQuery = { chatId };
    if (before) {
      messageQuery.timestamp = { $lt: new Date(before) };
    }

    const messages = await Message.find(messageQuery)
      .populate('replyTo', 'text senderId')
      .sort({ timestamp: -1 })
      .limit(Number(limit));

    // Reverse to chronological order (earliest to latest)
    const chronological = messages.reverse();

    // Mark unread messages received from the other user as read
    const unreadMessageIds = messages
      .filter((m) => m.senderId.toString() !== userId.toString() && !m.isRead)
      .map((m) => m._id);

    if (unreadMessageIds.length > 0) {
      await Message.updateMany(
        { _id: { $in: unreadMessageIds } },
        { $set: { isRead: true, readAt: new Date() } }
      );

      // Reset unread count for current user
      if (chat.unreadCounts) {
        chat.unreadCounts.set(userId.toString(), 0);
        await chat.save();
      }

      // Broadcast read receipt via SSE to other participant
      sseService.broadcastReadReceipt(
        {
          chatId,
          readBy: userId,
          messageIds: unreadMessageIds,
          timestamp: new Date().toISOString(),
        },
        chat.participants
      );
    }

    res.status(200).json({
      success: true,
      count: chronological.length,
      messages: chronological,
    });
  } catch (error) {
    console.error('[ChatController.getMessages] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Send Message & SSE Real-Time Broadcast (Screenshots 12 & 14)
 * POST /api/chat/messages
 */
exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user.userId;
    const { chatId, text, replyTo } = req.body;

    if (!chatId || !text) {
      return res.status(400).json({ error: 'chatId and text are required' });
    }

    const chat = await PrivateChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Verify sender is participant
    const isParticipant = chat.participants.some(
      (p) => p.toString() === senderId.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized in this conversation' });
    }

    const message = await Message.create({
      chatId,
      senderId,
      text,
      replyTo: mongoose.Types.ObjectId.isValid(replyTo) ? replyTo : null,
      isRead: false,
      timestamp: new Date(),
    });

    const populatedMessage = await message.populate('replyTo', 'text senderId');

    // Update conversation metadata
    const recipientId = chat.participants.find(
      (p) => p.toString() !== senderId.toString()
    );

    const recipientIdStr = recipientId ? recipientId.toString() : '';
    const currentUnread = chat.unreadCounts?.get(recipientIdStr) || 0;

    if (!chat.unreadCounts) {
      chat.unreadCounts = new Map();
    }
    chat.unreadCounts.set(recipientIdStr, currentUnread + 1);

    chat.lastMessage = message._id;
    chat.lastMessageAt = message.timestamp;
    chat.lastMessagePreview = text.length > 80 ? text.substring(0, 80) + '...' : text;
    chat.lastMessageSender = senderId;
    await chat.save();

    // Broadcast in real-time via SSE to participants
    sseService.broadcastNewMessage(populatedMessage, chat.participants);

    res.status(201).json({
      success: true,
      message: populatedMessage,
    });
  } catch (error) {
    console.error('[ChatController.sendMessage] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Mark Conversation Messages as Read
 * PATCH /api/chat/messages/read
 */
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chatId } = req.body;

    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }

    const chat = await PrivateChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Mark unread messages sent by others as read
    const result = await Message.updateMany(
      { chatId, senderId: { $ne: userId }, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    // Reset unread count for user
    if (chat.unreadCounts) {
      chat.unreadCounts.set(userId.toString(), 0);
      await chat.save();
    }

    // Broadcast read receipt to update double checkmarks in UI
    sseService.broadcastReadReceipt(
      {
        chatId,
        readBy: userId,
        readAt: new Date().toISOString(),
      },
      chat.participants
    );

    res.status(200).json({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Add Emoji Reaction to Message (Matches Screenshots 12 & 14)
 * POST /api/chat/messages/:messageId/react
 */
exports.addReaction = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { messageId } = req.params;
    const { emoji = '❤️' } = req.body;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user already reacted with this emoji
    const existingIndex = message.reactions.findIndex(
      (r) => r.user.toString() === userId.toString() && r.emoji === emoji
    );

    if (existingIndex > -1) {
      message.reactions.splice(existingIndex, 1); // Remove reaction if clicked again
    } else {
      message.reactions.push({ user: userId, emoji });
    }

    await message.save();

    // Broadcast reaction update via SSE
    const chat = await PrivateChat.findById(message.chatId).select('participants');
    if (chat) {
      sseService.broadcastReaction(
        {
          messageId: message._id,
          chatId: message.chatId,
          reactions: message.reactions,
        },
        chat.participants
      );
    }

    res.status(200).json({
      success: true,
      reactions: message.reactions,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Server-Sent Events (SSE) Stream Endpoint
 * GET /api/chat/stream
 */
exports.streamChatSSE = (req, res) => {
  const userId = req.user.userId;
  const { chatId } = req.query;

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  // Register client in SSE service
  const removeClient = sseService.addClient(userId, res, chatId);

  req.on('close', () => {
    removeClient();
    res.end();
  });
};

/**
 * Ghost Notification Polling Fallback (PRD Section 2)
 * For Flutter `workmanager` background task
 * GET /api/chat/poll
 */
exports.pollGhostNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { since } = req.query;

    const sinceDate = since ? new Date(since) : new Date(Date.now() - 3600000);

    const chats = await PrivateChat.find({ participants: userId }).select('_id');
    const chatIds = chats.map((c) => c._id);

    const unreadMessages = await Message.find({
      chatId: { $in: chatIds },
      senderId: { $ne: userId },
      isRead: false,
      timestamp: { $gt: sinceDate },
    }).sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      hasNewMessages: unreadMessages.length > 0,
      unreadCount: unreadMessages.length,
      // Disguised prompt to display on phone lock screen (Stealth engine)
      disguisedNotification: {
        title: 'Safe Blog Prompt',
        body: 'Daily Prompt: What are you grateful for today?',
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
