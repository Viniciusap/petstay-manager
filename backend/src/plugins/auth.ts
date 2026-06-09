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

  app.decorate('requireAuth', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
      const payload = request.user as { jti?: string };
      if (payload.jti && isRevoked(payload.jti)) {
        return reply.status(401).send({ error: 'Token revoked', code: 'TOKEN_REVOKED' });
      }
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
  });
}

export const authPlugin = fp(_authPlugin);
