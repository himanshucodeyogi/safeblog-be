const { DecoyBlog, User } = require('../models');

// Daily prompt master repository (Matches Screenshots 1 & 5)
const DAILY_PROMPTS = [
  "What's one thing you've been keeping to yourself lately?",
  "What is a small win from this week you haven't celebrated yet?",
  "Write about a conversation that changed your perspective.",
  "What are you most grateful for at this exact moment?",
  "Describe a place where you feel completely at ease.",
];

/**
 * Get Today Tab Data (Screenshots 1 & 5)
 * GET /api/blogs/today
 */
exports.getTodayData = async (req, res) => {
  try {
    const userId = req.user?.userId;

    // Deterministic daily prompt based on day of the year
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const promptText = DAILY_PROMPTS[dayOfYear % DAILY_PROMPTS.length];

    // Calculate last 7 days activity streak
    const last7Days = [];
    const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    let userStreak = 1;
    let todayEntries = [];

    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        userStreak = user.streakCount || 1;
      }

      // Check entries created in the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentEntries = await DecoyBlog.find({
        userId,
        createdAt: { $gte: sevenDaysAgo },
      }).select('createdAt');

      const entryDates = new Set(
        recentEntries.map((e) => new Date(e.createdAt).toISOString().split('T')[0])
      );

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        last7Days.push({
          day: dayNames[d.getDay()],
          date: dateStr,
          hasEntry: entryDates.has(dateStr),
          isToday: i === 0,
        });
      }

      // Fetch today's entries for user
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      todayEntries = await DecoyBlog.find({
        userId,
        createdAt: { $gte: startOfToday },
      }).sort({ createdAt: -1 });
    } else {
      // Default structure for unauthenticated/mock preview
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days.push({
          day: dayNames[d.getDay()],
          date: d.toISOString().split('T')[0],
          hasEntry: i === 0,
          isToday: i === 0,
        });
      }
    }

    res.status(200).json({
      success: true,
      today: {
        dateHeader: now.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        }).toUpperCase(),
        dailyPrompt: {
          text: promptText,
          activeWritersCount: 51,
        },
        writingHabitNudge: {
          title: 'Build a daily writing habit',
          subtitle: 'Gentle nudge every evening',
          enabled: true,
        },
        streak: {
          streakDays: userStreak,
          label: 'Keep the momentum going!',
          days: last7Days,
        },
        entries: todayEntries,
      },
    });
  } catch (error) {
    console.error('[BlogController.getTodayData] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Explore Feed (Screenshots 2 & 6)
 * GET /api/blogs/explore
 */
exports.getExploreFeed = async (req, res) => {
  try {
    const { mood, tab = 'for_you', sort = 'most_liked', page = 1, limit = 10 } = req.query;

    const filter = { isPublic: true, isDraft: false };

    if (mood && mood !== 'All') {
      filter.mood = mood;
    }

    // Following tab filter
    if (tab === 'following' && req.user?.userId) {
      const currentUser = await User.findById(req.user.userId);
      if (currentUser && currentUser.following && currentUser.following.length > 0) {
        filter.userId = { $in: currentUser.following };
      } else {
        return res.status(200).json({ success: true, count: 0, data: [], message: 'No stories from followed users yet' });
      }
    }

    // Sort order
    let sortQuery = { createdAt: -1 };
    if (sort === 'most_liked') {
      sortQuery = { likesCount: -1, createdAt: -1 };
    }

    const blogs = await DecoyBlog.find(filter)
      .populate('userId', 'username displayName avatarUrl')
      .sort(sortQuery)
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await DecoyBlog.countDocuments(filter);

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit) || 1,
      data: blogs,
    });
  } catch (error) {
    console.error('[BlogController.getExploreFeed] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Calendar Review & Entries (Screenshots 3 & 8)
 * GET /api/blogs/calendar
 */
exports.getCalendarData = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { month, year, selectedDate } = req.query;
    const now = new Date();
    const queryYear = year ? parseInt(year, 10) : now.getFullYear();
    const queryMonth = month ? parseInt(month, 10) - 1 : now.getMonth(); // 0-indexed

    const startOfMonth = new Date(queryYear, queryMonth, 1);
    const endOfMonth = new Date(queryYear, queryMonth + 1, 0, 23, 59, 59, 999);

    const monthEntries = await DecoyBlog.find({
      userId,
      createdAt: { $gte: startOfMonth, $lte: endOfMonth },
    }).sort({ createdAt: -1 });

    const activeDatesSet = new Set(
      monthEntries.map((e) => new Date(e.createdAt).toISOString().split('T')[0])
    );

    const user = await User.findById(userId);

    // Selected day entries
    const targetDateStr = selectedDate || now.toISOString().split('T')[0];
    const selectedDayEntries = monthEntries.filter(
      (e) => new Date(e.createdAt).toISOString().split('T')[0] === targetDateStr
    );

    res.status(200).json({
      success: true,
      calendar: {
        month: queryMonth + 1,
        year: queryYear,
        monthName: startOfMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        monthReview: {
          dayStreak: user?.streakCount || 1,
          daysActive: activeDatesSet.size,
          entriesCount: monthEntries.length,
        },
        activeDates: Array.from(activeDatesSet),
        selectedDateEntries: selectedDayEntries,
      },
    });
  } catch (error) {
    console.error('[BlogController.getCalendarData] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Create Blog Entry or Draft (Screenshots 3 & 7)
 * POST /api/blogs
 */
exports.createEntry = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      title,
      content,
      mood = 'Reflective',
      isPublic = false,
      isDraft = false,
      dailyPromptText,
      isPromptResponse = false,
      tags = [],
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    if (content.length > 30000) {
      return res.status(400).json({ error: 'Content exceeds 30,000 character limit' });
    }

    const newBlog = await DecoyBlog.create({
      userId,
      title,
      content,
      mood,
      isPublic: Boolean(isPublic),
      isDraft: Boolean(isDraft),
      dailyPrompt: {
        promptText: dailyPromptText || null,
        isPromptResponse: Boolean(isPromptResponse),
      },
      tags,
    });

    // Update streak if published (not a draft)
    if (!isDraft) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const user = await User.findById(userId);
      if (user) {
        const lastActive = user.lastActiveDate ? new Date(user.lastActiveDate) : null;
        if (!lastActive || lastActive < today) {
          user.streakCount = (user.streakCount || 0) + 1;
          user.lastActiveDate = new Date();
          await user.save();
        }
      }
    }

    res.status(201).json({
      success: true,
      message: isDraft ? 'Draft saved successfully' : 'Entry published successfully',
      entry: newBlog,
    });
  } catch (error) {
    console.error('[BlogController.createEntry] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get Single Blog Entry
 * GET /api/blogs/:id
 */
exports.getEntryById = async (req, res) => {
  try {
    const blog = await DecoyBlog.findById(req.params.id).populate(
      'userId',
      'username displayName avatarUrl bio'
    );

    if (!blog) {
      return res.status(404).json({ error: 'Blog entry not found' });
    }

    // If private entry, check ownership
    if (!blog.isPublic && (!req.user || req.user.userId.toString() !== blog.userId._id.toString())) {
      return res.status(403).json({ error: 'This entry is private' });
    }

    res.status(200).json({ success: true, blog });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update Blog Entry or Draft
 * PUT /api/blogs/:id
 */
exports.updateEntry = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const blog = await DecoyBlog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ error: 'Blog entry not found' });
    }

    if (blog.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Not authorized to edit this entry' });
    }

    const { title, content, mood, isPublic, isDraft, tags } = req.body;
    if (title) blog.title = title;
    if (content) blog.content = content;
    if (mood) blog.mood = mood;
    if (typeof isPublic === 'boolean') blog.isPublic = isPublic;
    if (typeof isDraft === 'boolean') blog.isDraft = isDraft;
    if (Array.isArray(tags)) blog.tags = tags;

    await blog.save();

    res.status(200).json({ success: true, blog });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Delete Blog Entry
 * DELETE /api/blogs/:id
 */
exports.deleteEntry = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const blog = await DecoyBlog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ error: 'Blog entry not found' });
    }

    if (blog.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this entry' });
    }

    await DecoyBlog.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: 'Blog entry deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Toggle Like on Public Story
 * POST /api/blogs/:id/like
 */
exports.toggleLike = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const blog = await DecoyBlog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ error: 'Blog entry not found' });
    }

    const alreadyLikedIndex = blog.likes.indexOf(userId);
    let liked = false;

    if (alreadyLikedIndex > -1) {
      blog.likes.splice(alreadyLikedIndex, 1);
    } else {
      blog.likes.push(userId);
      liked = true;
    }

    blog.likesCount = blog.likes.length;
    await blog.save();

    res.status(200).json({ success: true, liked, likesCount: blog.likesCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Toggle Bookmark on Public Story
 * POST /api/blogs/:id/bookmark
 */
exports.toggleBookmark = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const blog = await DecoyBlog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ error: 'Blog entry not found' });
    }

    const bookmarkIndex = blog.bookmarks.indexOf(userId);
    let bookmarked = false;

    if (bookmarkIndex > -1) {
      blog.bookmarks.splice(bookmarkIndex, 1);
    } else {
      blog.bookmarks.push(userId);
      bookmarked = true;
    }

    await blog.save();

    res.status(200).json({ success: true, bookmarked });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get Profile Tab Data (Screenshots 4 & 9)
 * GET /api/blogs/user/profile
 */
exports.getUserProfile = async (req, res) => {
  try {
    const targetUserId = req.query.userId || req.user?.userId;
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isOwner = req.user && req.user.userId.toString() === targetUserId.toString();

    // Published posts
    const posts = await DecoyBlog.find({
      userId: targetUserId,
      isPublic: true,
      isDraft: false,
    }).sort({ createdAt: -1 });

    // Drafts (Owner only)
    let drafts = [];
    if (isOwner) {
      drafts = await DecoyBlog.find({
        userId: targetUserId,
        isDraft: true,
      }).sort({ updatedAt: -1 });
    }

    // Saved / Bookmarks (Owner only)
    let saved = [];
    if (isOwner) {
      saved = await DecoyBlog.find({
        bookmarks: targetUserId,
      })
        .populate('userId', 'username displayName avatarUrl')
        .sort({ createdAt: -1 });
    }

    res.status(200).json({
      success: true,
      profile: {
        id: user._id,
        username: user.username,
        displayName: user.displayName || user.username,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        initials: (user.displayName || user.username).substring(0, 2).toUpperCase(),
        followersCount: user.followersCount || 0,
        followingCount: user.followingCount || 0,
        shareUrl: `https://blogspace.app/u/${user.username}`,
        counts: {
          posts: posts.length,
          saved: saved.length,
          drafts: drafts.length,
        },
        posts,
        saved,
        drafts,
      },
    });
  } catch (error) {
    console.error('[BlogController.getUserProfile] Error:', error);
    res.status(500).json({ error: error.message });
  }
};
