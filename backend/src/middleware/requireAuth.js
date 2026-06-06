const jwt = require('jsonwebtoken');
const { isRevoked } = require('../utils/tokenRevocation');

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('FATAL: JWT_SECRET not set or too short');
  return s;
}

module.exports = function requireAuth(req, res, next) {
  const token = req.cookies?.petstay_token || req.headers.authorization?.replace(/^Bearer\s+/, '');
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
  }
  try {
    const payload = jwt.verify(token, getSecret());
    if (payload.jti && isRevoked(payload.jti)) {
      return res.status(401).json({ success: false, error: 'Session was logged out', code: 'TOKEN_REVOKED' });
    }
    req.user = payload;
    next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    return res.status(401).json({ success: false, error: 'Invalid or expired session', code });
  }
};
