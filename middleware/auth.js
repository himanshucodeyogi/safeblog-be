const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'safeblog_super_secret_jwt_key_development_only';

/**
 * Verifies JWT token from Authorization header or query parameter (for SSE EventSource)
 */
function authenticateToken(req, res, next) {
  let token = null;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    // Allows EventSource SSE connection which cannot set custom Authorization headers
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_TOKEN_MISSING',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, mode: 'DECOY' | 'SECRET', email, username }
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Invalid or expired authentication token',
      code: 'AUTH_TOKEN_INVALID',
    });
  }
}

/**
 * Gatekeeper Mode Enforcement:
 * Ensures the token was generated via the correct PIN:
 * - 'DECOY' mode for Journal / Blog routes
 * - 'SECRET' mode for Private Chat routes (Strict Data Isolation)
 */
function requireMode(expectedMode) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.mode !== expectedMode) {
      return res.status(403).json({
        error: `Access Denied: Requires ${expectedMode} interface mode.`,
        code: 'INTERFACE_MODE_MISMATCH',
        currentMode: req.user.mode,
        requiredMode: expectedMode,
      });
    }

    next();
  };
}

/**
 * Optional authentication middleware for public endpoints
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      // Ignore token errors for optional auth
    }
  }
  next();
}

/**
 * Helper to generate scoped JWT tokens
 */
function generateToken(payload, expiresIn = '30d') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

module.exports = {
  authenticateToken,
  requireMode,
  optionalAuth,
  generateToken,
  JWT_SECRET,
};
