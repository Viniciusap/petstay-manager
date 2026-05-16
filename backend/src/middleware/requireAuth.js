const jwt = require('jsonwebtoken');

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('FATAL: JWT_SECRET not set or too short');
  return s;
}

module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
  }
  try {
    req.user = jwt.verify(header.slice(7), getSecret());
    next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    return res.status(401).json({ success: false, error: 'Invalid or expired session', code });
  }
};
