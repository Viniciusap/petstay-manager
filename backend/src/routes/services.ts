import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { services } from '../db/schema.js';

const CreateServiceSchema = z.object({
  nome: z.string().min(1),
  nome_en: z.string().optional(),
  valor: z.number().nonnegative(),
});

const UpdateServiceSchema = z.object({
  nome: z.string().min(1).optional(),
  nome_en: z.string().optional(),
  valor: z.number().nonnegative().optional(),
  ativo: z.boolean().optional(),
});

export async function servicesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/services', { preHandler: [app.requireAuth] }, async () => {
    const rows = await db.select().from(services).where(eq(services.ativo, true))
      .orderBy(services.created_at);
    return { data: rows, meta: { total: rows.length } };
  });

  app.post('/api/v1/services', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const body = CreateServiceSchema.parse(req.body);
    const [service] = await db.insert(services).values({
      nome: body.nome,
      nome_en: body.nome_en ?? body.nome,
      valor: String(body.valor),
      ativo: true,
    }).returning();
    return reply.status(201).send({ data: service });
  });

  app.put('/api/v1/services/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = UpdateServiceSchema.parse(req.body);
    const updates: Record<string, unknown> = { ...patch };
    if (patch.valor !== undefined) updates['valor'] = String(patch.valor);
    const [updated] = await db.update(services).set(updates)
      .where(eq(services.id, id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Service not found', code: 'NOT_FOUND' });
    return { data: updated };
  });

  app.delete('/api/v1/services/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [updated] = await db.update(services).set({ ativo: false })
      .where(eq(services.id, id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Service not found', code: 'NOT_FOUND' });
    return { data: updated };
  });
}
