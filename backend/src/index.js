require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { ensureDb, DATA_DIR } = require('./utils/db');
const { autoBackup } = require('./utils/backup');
const { adapter } = require('./utils/storage');
const { runMigrations, APP_VERSION } = require('./migrations');
const errorHandler = require('./middleware/errorHandler');

const settingsRouter = require('./routes/settings');
const tutorsRouter = require('./routes/tutors');
const animalsRouter = require('./routes/animals');
const bookingsRouter = require('./routes/bookings');
const contractsRouter = require('./routes/contracts');
const servicesRouter = require('./routes/services');
const datesRouter = require('./routes/dates');

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.', code: 'RATE_LIMITED' },
});

const signLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many signing attempts, please try again later.', code: 'RATE_LIMITED' },
});

async function createApp() {
  if (adapter === 'local') ensureDb();
  await runMigrations();
  if (adapter === 'local') autoBackup();

  const app = express();
  const isDev = process.env.NODE_ENV !== 'production';

  // Support comma-separated origins and trim trailing slashes
  const allowedOrigins = [
    ...(process.env.FRONTEND_URL || 'http://localhost:5173')
      .split(',')
      .map(o => o.trim().replace(/\/$/, '')),
    ...(isDev ? ['http://localhost:5173', 'http://localhost:5174'] : []),
  ].filter(Boolean);

  function isAllowed(origin) {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;
    // Accept Vercel preview deployments for the same project slug
    const vercelPreview = /^https:\/\/[\w-]+-[\w]+-[\w-]+-[\w-]+\.vercel\.app$/;
    if (process.env.ALLOW_VERCEL_PREVIEWS === '1' && vercelPreview.test(origin)) return true;
    return false;
  }

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  app.use(cors({
    origin: (origin, cb) => cb(null, isAllowed(origin)),
    credentials: true,
  }));

  // Block disallowed origins explicitly after cors sets headers
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !isAllowed(origin)) {
      return res.status(403).json({ success: false, error: 'CORS: origin not allowed', code: 'CORS_BLOCKED' });
    }
    next();
  });

  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', parseInt(process.env.TRUST_PROXY, 10) || 1);
  }

  app.use(express.json({ limit: '1mb' }));

  if (adapter === 'local' && DATA_DIR) {
    app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));
  }

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', version: APP_VERSION, adapter } });
  });

  app.use('/api/contracts/token', publicLimiter);
  app.use('/api/contracts/verify', publicLimiter);
  app.use('/api/contracts/sign', signLimiter);

  app.use('/api/settings', settingsRouter);
  app.use('/api/tutors', tutorsRouter);
  app.use('/api/animals', animalsRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/contracts', contractsRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/dates', datesRouter);

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  createApp()
    .then(app => app.listen(PORT, () => console.log(`PetStay Manager v${APP_VERSION} running on port ${PORT} ✓`)))
    .catch(err => { console.error('Failed to start:', err); process.exit(1); });
}
