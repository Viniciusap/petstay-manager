import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/index.js';
import { appSettings } from '../db/schema.js';
import { revoke, isRevoked } from '../lib/tokenRevocation.js';
import { authRateLimitConfig } from '../plugins/rateLimits.js';

const SALT_ROUNDS = 12;

const LoginSchema = z.object({
  senha: z.string().min(1),
  setup_token: z.string().optional(),
});

const ChangePasswordSchema = z.object({
  senha_atual: z.string().optional(),
  senha_nova: z.string().min(8),
});

function parseExpiry(str: string | undefined): number {
  if (!str) return 7 * 24 * 60 * 60 * 1000;
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(match[1]!);
  return n * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]!] ?? 86400000);
}

function cookieOpts(slug: string) {
  const prod = process.env['NODE_ENV'] === 'production';
  return { httpOnly: true, secure: prod, sameSite: prod ? 'none' : 'lax', path: '/' + slug } as const;
}

async function getSettings(db: DB) {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  return row;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/auth/status', async (req) => {
    const settings = await getSettings(req.db);
    return {
      data: {
        hasPassword: !!settings?.senha_hash,
        setupConfigured: !!process.env['SETUP_TOKEN'],
      },
    };
  });

  app.post('/api/v1/auth/login', authRateLimitConfig, async (req, reply) => {
    const body = LoginSchema.parse(req.body);
    const settings = await getSettings(req.db);
    const isFirstLogin = !settings?.senha_hash;

    if (isFirstLogin) {
      const envToken = process.env['SETUP_TOKEN'];
      if (envToken && body.setup_token !== envToken) {
        return reply.status(401).send({ error: 'Token de configuração inválido', code: 'INVALID_SETUP_TOKEN' });
      }
      if (body.senha.length < 8) {
        return reply.status(400).send({ error: 'Senha precisa ter ao menos 8 caracteres', code: 'PASSWORD_TOO_SHORT' });
      }
      const hash = await bcrypt.hash(body.senha, SALT_ROUNDS);
      await req.db.insert(appSettings).values({ id: 1, senha_hash: hash })
        .onConflictDoUpdate({ target: appSettings.id, set: { senha_hash: hash } });
    } else {
      const ok = await bcrypt.compare(body.senha, settings!.senha_hash!);
      if (!ok) return reply.status(401).send({ error: 'Senha incorreta', code: 'INVALID_PASSWORD' });
    }

    // If MFA is enabled, issue a short-lived pending token instead of the real JWT
    if (!isFirstLogin && settings?.mfa_enabled && settings.mfa_secret) {
      const pendingToken = app.jwt.sign({ role: 'mfa_pending', tenant: req.tenantSlug }, { expiresIn: '5m' });
      void reply.setCookie('petstay_mfa_pending', pendingToken, {
        ...cookieOpts(req.tenantSlug),
        maxAge: 5 * 60 * 1000,
      });
      return { data: { mfa_required: true } };
    }

    const expiry = process.env['JWT_EXPIRY'] ?? '7d';
    const jti = uuidv4();
    const token = app.jwt.sign({ role: 'admin', tenant: req.tenantSlug, jti }, { expiresIn: expiry });
    const decoded = app.jwt.decode<{ exp: number }>(token);

    void reply.setCookie('petstay_token', token, {
      ...cookieOpts(req.tenantSlug),
      maxAge: parseExpiry(expiry),
    });
    return {
      data: {
        expiresAt: new Date((decoded?.exp ?? 0) * 1000).toISOString(),
        firstLogin: isFirstLogin,
        mfa_required: false,
      },
    };
  });

  app.get('/api/v1/auth/me', async (req) => {
    const token = req.cookies?.['petstay_token'] ?? '';
    if (!token) return { data: { authenticated: false } };
    try {
      const payload = app.jwt.verify<{ jti?: string; exp: number }>(token);
      if (payload.jti && isRevoked(payload.jti)) return { data: { authenticated: false } };
      return { data: { authenticated: true, expiresAt: new Date(payload.exp * 1000).toISOString() } };
    } catch {
      return { data: { authenticated: false } };
    }
  });

  app.post('/api/v1/auth/logout', async (req, reply) => {
    const token = req.cookies?.['petstay_token'] ?? '';
    if (token) {
      try {
        const payload = app.jwt.verify<{ jti?: string; exp: number }>(token);
        if (payload.jti) revoke(payload.jti, payload.exp * 1000);
      } catch { /* token already invalid */ }
    }
    const prod = process.env['NODE_ENV'] === 'production';
    void reply.clearCookie('petstay_token', { path: '/' + req.tenantSlug, sameSite: prod ? 'none' : 'lax', secure: prod });
    return { data: { ok: true } };
  });

  app.post('/api/v1/auth/password', { preHandler: [app.requireAuth], ...authRateLimitConfig }, async (req, reply) => {
    const body = ChangePasswordSchema.parse(req.body);
    const settings = await getSettings(req.db);
    if (settings?.senha_hash) {
      if (!body.senha_atual) {
        return reply.status(400).send({ error: 'Senha atual obrigatória', code: 'CURRENT_PASSWORD_REQUIRED' });
      }
      const ok = await bcrypt.compare(body.senha_atual, settings.senha_hash);
      if (!ok) return reply.status(401).send({ error: 'Senha atual incorreta', code: 'INVALID_PASSWORD' });
    }
    const hash = await bcrypt.hash(body.senha_nova, SALT_ROUNDS);
    await req.db.insert(appSettings).values({ id: 1, senha_hash: hash })
      .onConflictDoUpdate({ target: appSettings.id, set: { senha_hash: hash } });
    return { data: { updated: true } };
  });
}
