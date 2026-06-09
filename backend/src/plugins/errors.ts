import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export async function errorsPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'request error');

    if (error instanceof ZodError) {
      const messages = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      void reply.status(422).send({ error: messages, code: 'VALIDATION_ERROR' });
      return;
    }

    const err = error as { statusCode?: number; code?: string; message?: string };
    const statusCode = err.statusCode ?? 500;
    const code = err.code ?? 'INTERNAL_ERROR';
    const message = statusCode < 500 ? (err.message ?? 'Error') : 'Internal Server Error';
    void reply.status(statusCode).send({ error: message, code });
  });
}
