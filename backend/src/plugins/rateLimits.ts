import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

export async function rateLimitPlugin(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'Too many requests, please try again later.',
      code: 'RATE_LIMITED',
    }),
  });
}

export const authRateLimitConfig = {
  config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
} as const;
