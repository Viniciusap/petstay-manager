const revokedJtis = new Map(); // jti → expiry (ms)

module.exports = {
  revoke(jti, expMs) {
    revokedJtis.set(jti, expMs);
  },
  isRevoked(jti) {
    if (!revokedJtis.has(jti)) return false;
    if (Date.now() > revokedJtis.get(jti)) {
      revokedJtis.delete(jti); // token expired naturally — no need to keep in blacklist
      return false;
    }
    return true;
  },
};
