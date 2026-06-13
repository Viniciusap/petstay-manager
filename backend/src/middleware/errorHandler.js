const SAFE_CODES = new Set([
  'VALIDATION_ERROR', 'NOT_FOUND', 'HAS_ACTIVE_BOOKINGS', 'HAS_ANIMALS',
  'ALREADY_SIGNED', 'TOKEN_EXPIRED', 'INVALID_TOKEN', 'TOKEN_REVOKED', 'NO_FILE',
  'INVALID_FILE_TYPE', 'INVALID_FILE', 'INVALID_PATH',
  'TERMS_NOT_ACCEPTED', 'NAME_REQUIRED', 'SIGNATURE_REQUIRED',
  'INVALID_SIGNATURE_FORMAT', 'PAYLOAD_TOO_LARGE', 'NOT_SIGNED',
  'RATE_LIMITED', 'DB_CORRUPTED',
]);

function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const isProd = process.env.NODE_ENV === 'production';

  // In development, log everything for debugging
  if (!isProd) console.error(`[${code}]`, err.message, err.stack || '');

  // Only expose message for known safe error codes; generic message otherwise
  const message = SAFE_CODES.has(code)
    ? err.message
    : isProd
      ? 'An unexpected error occurred'
      : err.message;

  res.status(status).json({ success: false, error: message, code });
}

module.exports = errorHandler;
