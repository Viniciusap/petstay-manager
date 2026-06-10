import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
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
import { systemRoutes } from './routes/system.js';
import { getDb, isValidSlug, ensureSystemReady } from './db/index.js';

const APP_VERSION = '3.0.0';

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf',
};

function requiredEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`${key} is required`);
  return val;
}

export async function buildServer() {
  requiredEnv('POSTGRES_URL');
  requiredEnv('SYSTEM_ADMIN_PASSWORD');

  await ensureSystemReady();

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
  await app.register(errorsPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);

  // ── Tenant resolution by path ──────────────────────────────────────────────
  // Skipped for: /health, /system (system-admin area)
  app.addHook('preHandler', async (req, reply) => {
    if (req.url === '/health' || req.url.startsWith('/system')) return;

    const slug = req.url.split('/').filter(Boolean)[0] ?? '';
    if (!slug || !isValidSlug(slug)) {
      return reply.status(400).send({ error: 'Tenant inválido ou não informado', code: 'INVALID_TENANT' });
    }

    try {
      req.tenantSlug = slug;
      req.db = await getDb(slug);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message, code: 'TENANT_ERROR' });
    }
  });

  // ── Tenant-aware uploads ───────────────────────────────────────────────────
  const dataDir = process.env['DATA_DIR'];
  if (dataDir) {
    app.get('/:slug/uploads/*', async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const subPath = ((req.params as any)['*'] as string).replace(/\.\./g, '').replace(/^\/+/, '');
      if (!subPath) return reply.status(404).send();

      const fullPath = path.resolve(dataDir, slug, 'uploads', subPath);
      const base = path.resolve(dataDir, slug, 'uploads');
      if (!fullPath.startsWith(base + path.sep)) return reply.status(400).send({ error: 'Invalid path' });

      try {
        await access(fullPath);
      } catch {
        return reply.status(404).send();
      }

      const ext = path.extname(fullPath).toLowerCase();
      reply.header('Content-Type', MIME[ext] ?? 'application/octet-stream');
      reply.header('Cache-Control', 'public, max-age=86400');
      return reply.send(createReadStream(fullPath));
    });
  }

  // ── Health ─────────────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    version: APP_VERSION,
    uptime: Math.floor(process.uptime()),
  }));

  // ── System routes (no tenant prefix) ──────────────────────────────────────
  await app.register(systemRoutes);

  // ── Tenant routes (all under /:tenantSlug prefix) ──────────────────────────
  // req.db and req.tenantSlug are populated by the preHandler above.
  await app.register(async (tenantApp) => {
    await tenantApp.register(authRoutes);
    await tenantApp.register(tutorsRoutes);
    await tenantApp.register(animalsRoutes);
    await tenantApp.register(bookingsRoutes);
    await tenantApp.register(contractsRoutes);
    await tenantApp.register(servicesRoutes);
    await tenantApp.register(datesRoutes);
    await tenantApp.register(galeriaRoutes);
    await tenantApp.register(settingsRoutes);
    await tenantApp.register(mfaRoutes);
  }, { prefix: '/:tenantSlug' });

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
