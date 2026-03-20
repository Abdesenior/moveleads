const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const dbUser = await User.findById(decoded.user.id).select('role isSuspended');
    if (!dbUser) return res.status(401).json({ msg: 'User not found' });
    if (dbUser.isSuspended) return res.status(403).json({ msg: 'Account suspended' });

    // Always trust DB for role to avoid stale tokens after privilege changes.
    req.user = { id: decoded.user.id, role: dbUser.role };
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

module.exports = { auth, admin, superAdmin };
