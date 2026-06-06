const crypto = require('crypto');

// Payload serialized as JSON to prevent pipe-injection collisions.
// Fields are named so payload is unambiguous regardless of their values.
function generateHash(token, nomeDigitado, timestamp) {
  const payload = JSON.stringify({ token, nomeDigitado, timestamp });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function verifyHash(hash, token, nomeDigitado, timestamp) {
  return generateHash(token, nomeDigitado, timestamp) === hash;
}

module.exports = { generateHash, verifyHash };
