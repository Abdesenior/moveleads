const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const dbUser = await User.findById(decoded.user.id).select('role isSuspended isEmailVerified');
    if (!dbUser) return res.status(401).json({ msg: 'User not found' });
    if (dbUser.isSuspended) return res.status(403).json({ msg: 'Account suspended' });

    // Always trust DB for role + verification state to avoid stale tokens after
    // privilege changes or post-issue verification flips.
    req.user = {
      id: decoded.user.id,
      role: dbUser.role,
      isEmailVerified: dbUser.isEmailVerified,
    };
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

const admin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
    next();
  } else {
    res.status(403).json({ msg: 'Admin resources access denied' });
  }
};

const superAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'super_admin') {
    next();
  } else {
    res.status(403).json({ msg: 'Super Admin resources access denied' });
  }
};

// ── requireEmailVerified ───────────────────────────────────────────────────
// Defense-in-depth gate. Must be mounted AFTER `auth` so req.user is populated.
// Admin / super_admin roles bypass (mirrors client-side ProtectedRoute logic);
// admin seed accounts may not have an isEmailVerified=true stamp and we don't
// want to lock the platform out of itself.
function requireEmailVerified(req, res, next) {
  if (!req.user) return res.status(401).json({ msg: 'Auth required', code: 'AUTH_REQUIRED' });
  if (req.user.role === 'admin' || req.user.role === 'super_admin') return next();
  if (req.user.isEmailVerified !== true) {
    return res.status(403).json({
      msg: 'Verify your email to continue.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }
  next();
}

module.exports = { auth, admin, superAdmin, requireEmailVerified };
