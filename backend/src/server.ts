import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import path from 'node:path';
import { errorsPlugin } from './plugins/errors.js';
import { authPlugin } from './plugins/auth.js';
import { rateLimitPlugin } from './plugins/rateLimits.js';
import { authRoutes } from './routes/auth.js';
import { tutorsRoutes } from './routes/tutors.js';
import { animalsRoutes } from './routes/animals.js';
import { bookingsRoutes } from './routes/bookings.js';
import { contractsRoutes } from './routes/contracts.js';
import { servicesRoutes } from './routes/services.js';
import { datesRoutes } from './routes/dates.js';
import { galeriaRoutes } from './routes/galeria.js';
import { settingsRoutes } from './routes/settings.js';
import { mfaRoutes } from './routes/mfa.js';

const APP_VERSION = '2.0.0';

function requiredEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`${key} is required`);
  return val;
}

export async function buildServer() {
  requiredEnv('POSTGRES_URL');

  const app = Fastify({ logger: true, trustProxy: true });

  const allowedOrigins = (process.env['FRONTEND_URL'] ?? 'http://localhost:5173')
    .split(',')
    .map(o => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const isDev = process.env['NODE_ENV'] !== 'production';
  if (isDev) allowedOrigins.push('http://localhost:5173', 'http://localhost:5174');

  await app.register(helmet, {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS: origin not allowed'), false);
    },
    credentials: true,
  });

  await app.register(cookie);

  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });

  const dataDir = process.env['DATA_DIR'];
  if (dataDir) {
    const uploadsDir = path.resolve(dataDir, 'uploads');
    const { promises: fs } = await import('node:fs');
    await fs.mkdir(uploadsDir, { recursive: true });
    await app.register(staticFiles, {
      root: uploadsDir,
      prefix: '/uploads/',
    });
  }

  await app.register(errorsPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);

  app.get('/health', async () => ({
    status: 'ok',
    version: APP_VERSION,
    uptime: Math.floor(process.uptime()),
  }));

  await app.register(authRoutes);
  await app.register(tutorsRoutes);
  await app.register(animalsRoutes);
  await app.register(bookingsRoutes);
  await app.register(contractsRoutes);
  await app.register(servicesRoutes);
  await app.register(datesRoutes);
  await app.register(galeriaRoutes);
  await app.register(settingsRoutes);
  await app.register(mfaRoutes);

  app.addHook('onClose', async () => {
    app.log.info('Server closing gracefully');
  });

  process.on('SIGTERM', () => {
    app.close().catch(err => app.log.error({ err }, 'Error during close'));
  });

  return app;
}

const PORT = parseInt(process.env['PORT'] ?? '3002', 10);
buildServer()
  .then(app => app.listen({ port: PORT, host: '0.0.0.0' }))
  .catch(err => { console.error('Failed to start:', err); process.exit(1); });
