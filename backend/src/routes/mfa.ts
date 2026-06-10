import type { FastifyInstance } from 'fastify';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { DB } from '../db/index.js';
import { appSettings } from '../db/schema.js';
import { authRateLimitConfig } from '../plugins/rateLimits.js';

async function getSettings(db: DB) {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  return row;
}

function parseExpiry(str: string): number {
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(match[1]!);
  return n * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]!] ?? 86400000);
}

function cookieOpts(slug: string) {
  const prod = process.env['NODE_ENV'] === 'production';
  return { httpOnly: true, secure: prod, sameSite: prod ? 'none' as const : 'lax' as const, path: '/' + slug };
}

export async function mfaRoutes(app: FastifyInstance): Promise<void> {
  // Generate TOTP secret + QR code for setup
  app.post('/api/v1/auth/mfa/setup', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const settings = await getSettings(req.db);
    if (settings?.mfa_enabled) {
      return reply.status(400).send({ error: 'MFA already enabled', code: 'MFA_ALREADY_ENABLED' });
    }

    const secret = speakeasy.generateSecret({ length: 20 });
    const issuer = settings?.nome_estabelecimento || 'PetStay Manager';
    const otpauthUrl = speakeasy.otpauthURL({
      secret: secret.base32,
      label: encodeURIComponent(`admin@${issuer}`),
      issuer,
      encoding: 'base32',
    });
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

    await req.db.update(appSettings).set({ mfa_secret: secret.base32 }).where(eq(appSettings.id, 1));

    return { data: { secret: secret.base32, qrDataUrl } };
  });

  // Verify TOTP token and activate MFA
  app.post('/api/v1/auth/mfa/verify', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { token } = z.object({ token: z.string().length(6) }).parse(req.body);
    const settings = await getSettings(req.db);
    if (!settings?.mfa_secret) {
      return reply.status(400).send({ error: 'Run /mfa/setup first', code: 'MFA_NOT_SETUP' });
    }

    const valid = speakeasy.totp.verify({
      secret: settings.mfa_secret,
      encoding: 'base32',
      token,
      window: 1,
    });
    if (!valid) {
      return reply.status(401).send({ error: 'Código inválido', code: 'INVALID_TOTP' });
    }

    await req.db.update(appSettings).set({ mfa_enabled: true }).where(eq(appSettings.id, 1));
    return { data: { enabled: true } };
  });

  // Disable MFA
  app.delete('/api/v1/auth/mfa', { preHandler: [app.requireAuth] }, async (req) => {
    await req.db.update(appSettings)
      .set({ mfa_enabled: false, mfa_secret: null })
      .where(eq(appSettings.id, 1));
    return { data: { disabled: true } };
  });

  // Validate TOTP during login (called after password auth when MFA is enabled)
  app.post('/api/v1/auth/mfa/validate', authRateLimitConfig, async (req, reply) => {
    const { token } = z.object({ token: z.string().length(6) }).parse(req.body);

    const pendingToken = req.cookies?.['petstay_mfa_pending'] ?? '';
    if (!pendingToken) {
      return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    try {
      const pendingPayload = app.jwt.verify<{ role: string }>(pendingToken);
      if (pendingPayload.role !== 'mfa_pending') throw new Error();
    } catch {
      return reply.status(401).send({ error: 'Sessão MFA expirada', code: 'MFA_SESSION_EXPIRED' });
    }

    const settings = await getSettings(req.db);
    if (!settings?.mfa_secret || !settings.mfa_enabled) {
      return reply.status(400).send({ error: 'MFA not enabled', code: 'MFA_NOT_ENABLED' });
    }

    const valid = speakeasy.totp.verify({
      secret: settings.mfa_secret,
      encoding: 'base32',
      token,
      window: 1,
    });
    if (!valid) {
      return reply.status(401).send({ error: 'Código inválido', code: 'INVALID_TOTP' });
    }

    const expiry = process.env['JWT_EXPIRY'] ?? '7d';
    const jti = uuidv4();
    const realToken = app.jwt.sign({ role: 'admin', tenant: req.tenantSlug, jti }, { expiresIn: expiry });
    const decoded = app.jwt.decode<{ exp: number }>(realToken);

    const opts = cookieOpts(req.tenantSlug);
    void reply
      .clearCookie('petstay_mfa_pending', { path: opts.path })
      .setCookie('petstay_token', realToken, { ...opts, maxAge: parseExpiry(expiry) });

    return {
      data: {
        expiresAt: new Date((decoded?.exp ?? 0) * 1000).toISOString(),
        firstLogin: false,
      },
    };
  });
}
