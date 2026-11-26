const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

// Public or optionally authenticated routes
router.get('/today', optionalAuth, blogController.getTodayData);
router.get('/explore', optionalAuth, blogController.getExploreFeed);
router.get('/profile', optionalAuth, blogController.getUserProfile);
router.get('/calendar/review', authenticateToken, blogController.getCalendarData);

// Specific ID route (must come after specific path routes)
router.get('/:id', optionalAuth, blogController.getEntryById);

// Authenticated Decoy Blog mutating routes
router.use(authenticateToken);

router.post('/', blogController.createEntry);
router.put('/:id', blogController.updateEntry);
router.delete('/:id', blogController.deleteEntry);
router.post('/:id/like', blogController.toggleLike);
router.post('/:id/bookmark', blogController.toggleBookmark);

module.exports = router;
