const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requireMode } = require('../middleware/auth');

// Public Auth Endpoints
router.post('/register', authController.register);
router.post('/verify-pin', authController.verifyPin);
router.post('/google', authController.googleAuth);

// Authenticated Endpoints
router.get('/me', authenticateToken, authController.getMe);
router.put('/pins', authenticateToken, requireMode('SECRET'), authController.updatePins);

module.exports = router;
