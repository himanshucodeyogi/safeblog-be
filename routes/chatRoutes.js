const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticateToken, requireMode } = require('../middleware/auth');

// All chat routes strictly require authentication AND SECRET mode
router.use(authenticateToken);
router.use(requireMode('SECRET'));

// SSE Real-Time Stream (Supports ?token= in query string or Bearer token)
router.get('/stream', chatController.streamChatSSE);

// Ghost Notification Background Polling
router.get('/poll', chatController.pollGhostNotifications);

// User Discovery in Secret App
router.get('/users/search', chatController.searchUsers);

// Conversations
router.get('/conversations', chatController.getConversations);
router.post('/conversations', chatController.getOrCreateConversation);
router.get('/conversations/:chatId/messages', chatController.getMessages);

// Messages
router.post('/messages', chatController.sendMessage);
router.patch('/messages/read', chatController.markAsRead);
router.post('/messages/:messageId/react', chatController.addReaction);

module.exports = router;
