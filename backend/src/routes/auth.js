const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { getSetting, updateSettings } = require('../utils/db');
const { revoke } = require('../utils/tokenRevocation');

const SALT_ROUNDS = 12;

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET missing or too short (min 16 chars)');
  return s;
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts', code: 'RATE_LIMITED' },
});

// Public: check if system has a password set (tells frontend which form to show)
router.get('/status', async (req, res, next) => {
  try {
    const senhaHash = await getSetting('senha_hash');
    const hasPassword = !!senhaHash;
    const setupRequired = !!process.env.SETUP_TOKEN;
    res.json({ success: true, data: { hasPassword, setupConfigured: setupRequired } });
  } catch (err) { next(err); }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { senha, setup_token } = req.body;
    if (!senha || typeof senha !== 'string') {
      return res.status(400).json({ success: false, error: 'Senha obrigatória', code: 'PASSWORD_REQUIRED' });
    }

    const senhaHash = await getSetting('senha_hash');
    const isFirstLogin = !senhaHash;

    if (isFirstLogin) {
      const envToken = process.env.SETUP_TOKEN;
      // If SETUP_TOKEN is configured, require it. If not set, allow open first login.
      if (envToken && setup_token !== envToken) {
        return res.status(401).json({
          success: false,
          error: 'Token de configuração inválido',
          code: 'INVALID_SETUP_TOKEN',
        });
      }
      if (senha.length < 8) {
        return res.status(400).json({ success: false, error: 'Senha precisa ter ao menos 8 caracteres', code: 'PASSWORD_TOO_SHORT' });
      }
      const hash = await bcrypt.hash(senha, SALT_ROUNDS);
      await updateSettings({ senha_hash: hash });
    } else {
      const ok = await bcrypt.compare(senha, senhaHash);
      if (!ok) return res.status(401).json({ success: false, error: 'Senha incorreta', code: 'INVALID_PASSWORD' });
    }

    const expiry = process.env.JWT_EXPIRY || '7d';
    const jti = uuidv4();
    const token = jwt.sign({ role: 'admin', jti }, secret(), { expiresIn: expiry });
    const decoded = jwt.decode(token);

    res.json({ success: true, data: { token, expiresAt: new Date(decoded.exp * 1000).toISOString(), firstLogin: isFirstLogin } });
  } catch (err) { next(err); }
});

router.get('/me', (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.json({ success: true, data: { authenticated: false } });
  try {
    const payload = jwt.verify(header.slice(7), secret());
    res.json({ success: true, data: { authenticated: true, expiresAt: new Date(payload.exp * 1000).toISOString() } });
  } catch {
    res.json({ success: true, data: { authenticated: false } });
  }
});

router.post('/logout', (req, res) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), secret());
      if (payload.jti) revoke(payload.jti, payload.exp * 1000);
    } catch {}
  }
  res.json({ success: true });
});

module.exports = router;
