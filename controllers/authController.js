const { OAuth2Client } = require('google-auth-library');
const { User } = require('../models');
const { generateToken } = require('../middleware/auth');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Register a new user with Dual-PIN setup
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { email, username, displayName, bio, blogPin, safePin, avatarUrl } = req.body;

    if (!email || !username || !blogPin || !safePin) {
      return res.status(400).json({
        error: 'Email, username, blog PIN, and safe PIN are all required',
      });
    }

    if (blogPin === safePin) {
      return res.status(400).json({
        error: 'Blog PIN and Safe PIN must be different for stealth routing to function',
      });
    }

    // Check if email or username already exists
    const existing = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }],
    });

    if (existing) {
      const field = existing.email === email.toLowerCase() ? 'Email' : 'Username';
      return res.status(409).json({ error: `${field} is already registered` });
    }

    // Hash both PINs
    const blogPinHash = await User.hashPin(blogPin);
    const safePinHash = await User.hashPin(safePin);

    const user = await User.create({
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      displayName: displayName || username,
      avatarUrl: avatarUrl || '',
      bio: bio || '',
      blogPinHash,
      safePinHash,
    });

    // Default to Decoy mode token on registration
    const token = generateToken({
      userId: user._id,
      mode: 'DECOY',
      email: user.email,
      username: user.username,
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully with stealth Dual-PIN setup',
      token,
      mode: 'DECOY',
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
      },
    });
  } catch (error) {
    console.error('[AuthController.register] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Dual-PIN Gatekeeper Universal Lock Screen Router
 * POST /api/auth/verify-pin
 *
 * Checks entered PIN:
 * - If matches Safe PIN -> returns mode: 'SECRET', routes to Private Chat
 * - If matches Blog PIN -> returns mode: 'DECOY', routes to Decoy Blog
 * - If neither -> 401 Unauthorized
 */
exports.verifyPin = async (req, res) => {
  try {
    const { identifier, pin } = req.body;

    if (!identifier || !pin) {
      return res.status(400).json({
        error: 'Identifier (email/username) and PIN are required',
      });
    }

    let user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() },
      ],
    }).select('+blogPinHash +safePinHash');

    // Self-healing: if krishna_codeyogi was requested and not yet seeded, create it on-the-fly
    if (!user && identifier.toLowerCase() === 'krishna_codeyogi') {
      const blogPinHash = await User.hashPin('1234');
      const safePinHash = await User.hashPin('9999');
      user = await User.create({
        username: 'krishna_codeyogi',
        displayName: 'Krishna Codeyogi',
        email: 'krishna@safeblog.app',
        bio: 'Building apps & documenting daily thoughts.',
        blogPinHash,
        safePinHash,
      });
    }

    if (!user) {
      return res.status(404).json({
        error: `User "${identifier}" not found. Tap "Set up new account" below.`,
        code: 'USER_NOT_FOUND',
      });
    }

    // 1. Check Secret Safe PIN (Routes to Private Chat)
    const isSafePin = await user.compareSafePin(pin);
    if (isSafePin) {
      const secretToken = generateToken({
        userId: user._id,
        mode: 'SECRET',
        email: user.email,
        username: user.username,
      });

      return res.status(200).json({
        success: true,
        mode: 'SECRET',
        route: '/secret/chat',
        syncAnimationDurationMs: 1500, // Matches PRD: 1.5s fake "Syncing Entries" animation
        token: secretToken,
        user: {
          id: user._id,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          avatarUrl: user.avatarUrl,
        },
      });
    }

    // 2. Check Decoy Blog PIN (Routes to Decoy Safe Blog)
    const isBlogPin = await user.compareBlogPin(pin);
    if (isBlogPin) {
      const decoyToken = generateToken({
        userId: user._id,
        mode: 'DECOY',
        email: user.email,
        username: user.username,
      });

      return res.status(200).json({
        success: true,
        mode: 'DECOY',
        route: '/decoy/blog',
        token: decoyToken,
        user: {
          id: user._id,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          avatarUrl: user.avatarUrl,
        },
      });
    }

    // Neither PIN matched
    return res.status(401).json({
      error: 'Incorrect PIN entered. Try 1234 (Blog) or 9999 (Safe Chat).',
      code: 'INVALID_PIN',
    });
  } catch (error) {
    console.error('[AuthController.verifyPin] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Google OAuth 2.0 Verification
 * POST /api/auth/google
 */
exports.googleAuth = async (req, res) => {
  try {
    const { idToken, blogPin, safePin, username } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      // In development or if GOOGLE_CLIENT_ID not yet supplied, allow simulated verification
      if (process.env.NODE_ENV !== 'production' && req.body.mockGooglePayload) {
        payload = req.body.mockGooglePayload;
      } else {
        return res.status(401).json({ error: 'Invalid Google ID Token', details: err.message });
      }
    }

    const { sub: googleId, email, name, picture } = payload;

    let user = await User.findOne({
      $or: [{ googleId }, { email: email.toLowerCase() }],
    }).select('+blogPinHash +safePinHash');

    // Existing user
    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }

      return res.status(200).json({
        success: true,
        userExists: true,
        message: 'Google authenticated. Enter PIN to select mode.',
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
      });
    }

    // New User: requires PIN setup
    if (!blogPin || !safePin) {
      return res.status(200).json({
        success: true,
        userExists: false,
        requiresPinSetup: true,
        googleData: { email, name, picture, googleId },
      });
    }

    if (blogPin === safePin) {
      return res.status(400).json({
        error: 'Blog PIN and Safe PIN must be different',
      });
    }

    const generatedUsername =
      username || email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') + Math.floor(100 + Math.random() * 900);

    const blogPinHash = await User.hashPin(blogPin);
    const safePinHash = await User.hashPin(safePin);

    user = await User.create({
      googleId,
      email: email.toLowerCase(),
      username: generatedUsername.toLowerCase(),
      displayName: name || generatedUsername,
      avatarUrl: picture || '',
      blogPinHash,
      safePinHash,
    });

    const token = generateToken({
      userId: user._id,
      mode: 'DECOY',
      email: user.email,
      username: user.username,
    });

    res.status(201).json({
      success: true,
      message: 'User registered with Google OAuth and Dual PINs configured',
      token,
      mode: 'DECOY',
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    console.error('[AuthController.googleAuth] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get current authenticated user profile & active mode
 * GET /api/auth/me
 */
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate('followers', 'username displayName avatarUrl')
      .populate('following', 'username displayName avatarUrl');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({
      success: true,
      mode: req.user.mode,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        streakCount: user.streakCount,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update user PINs (requires authentication in SECRET mode for security)
 * PUT /api/auth/pins
 */
exports.updatePins = async (req, res) => {
  try {
    const { currentSafePin, newBlogPin, newSafePin } = req.body;

    const user = await User.findById(req.user.userId).select('+safePinHash +blogPinHash');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await user.compareSafePin(currentSafePin);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current Safe PIN is incorrect' });
    }

    if (newBlogPin) {
      user.blogPinHash = await User.hashPin(newBlogPin);
    }
    if (newSafePin) {
      user.safePinHash = await User.hashPin(newSafePin);
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'PINs updated successfully',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
