import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import { isRevoked } from '../lib/tokenRevocation.js';

async function _authPlugin(app: FastifyInstance): Promise<void> {
  const secret = process.env['JWT_SECRET'];
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long');
  }

  await app.register(fastifyJwt, {
    secret,
    cookie: { cookieName: 'petstay_token', signed: false },
  });

  // Second namespace for system-admin JWT
  const systemSecret = process.env['SYSTEM_JWT_SECRET'] ?? `system-${secret}`;
  await app.register(fastifyJwt, {
    secret: systemSecret,
    namespace: 'system',
    jwtVerify: 'systemVerify',
    jwtSign: 'systemSign',
    cookie: { cookieName: 'petstay_system_token', signed: false },
  } as Parameters<typeof fastifyJwt>[1]);

  app.decorate('requireAuth', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
      const payload = request.user as { jti?: string; tenant?: string };
      if (payload.jti && isRevoked(payload.jti)) {
        return reply.status(401).send({ error: 'Token revoked', code: 'TOKEN_REVOKED' });
      }
      // Cross-tenant guard: JWT must carry matching tenant slug
      if (payload.tenant && payload.tenant !== request.tenantSlug) {
        return reply.status(403).send({ error: 'Tenant mismatch', code: 'TENANT_MISMATCH' });
      }
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
  });

  app.decorate('requireSystemAuth', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await (request as any).systemVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
  });
}

export const authPlugin = fp(_authPlugin);
