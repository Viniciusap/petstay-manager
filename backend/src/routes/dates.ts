import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { blockedDates } from '../db/schema.js';

const CreateBlockedDateSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  motivo: z.string().optional(),
});

export async function datesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/dates/blocked', { preHandler: [app.requireAuth] }, async () => {
    const rows = await db.select().from(blockedDates).orderBy(blockedDates.data);
    return { data: rows, meta: { total: rows.length } };
  });

  app.post('/api/v1/dates/blocked', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const body = CreateBlockedDateSchema.parse(req.body);
    const [row] = await db.insert(blockedDates).values({
      data: body.data,
      motivo: body.motivo ?? '',
    }).returning();
    return reply.status(201).send({ data: row });
  });

  app.delete('/api/v1/dates/blocked/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [deleted] = await db.delete(blockedDates).where(eq(blockedDates.id, id)).returning();
    if (!deleted) return reply.status(404).send({ error: 'Date not found', code: 'NOT_FOUND' });
    return { data: { deleted: true } };
  });
}
