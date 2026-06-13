import type { FastifyInstance } from 'fastify';
import { eq, and, ilike, or, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { tutors, animals, bookings, contracts } from '../db/schema.js';
import { deleteFile } from '../lib/storage.js';

const CreateTutorSchema = z.object({
  nome: z.string().min(1),
  telefone: z.string().min(1),
  email: z.string().optional().default(''),
  endereco: z.string().optional().default(''),
  tipo: z.enum(['primario', 'secundario']).optional().default('primario'),
});

const UpdateTutorSchema = CreateTutorSchema.partial();

export async function tutorsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/tutors', { preHandler: [app.requireAuth] }, async (req) => {
    const { q } = req.query as { q?: string };
    const rows = q
      ? await req.db.select().from(tutors).where(
          or(ilike(tutors.nome, `%${q}%`), ilike(tutors.telefone, `%${q}%`))
        ).orderBy(tutors.created_at)
      : await req.db.select().from(tutors).orderBy(tutors.created_at);
    return { data: rows, meta: { total: rows.length } };
  });

  app.get('/api/v1/tutors/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [tutor] = await req.db.select().from(tutors).where(eq(tutors.id, id));
    if (!tutor) return reply.status(404).send({ error: 'Tutor not found', code: 'NOT_FOUND' });
    const animalRows = await req.db.select().from(animals).where(eq(animals.tutor_id, id))
      .orderBy(animals.created_at);
    return { data: { ...tutor, animals: animalRows } };
  });

  app.post('/api/v1/tutors', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const body = CreateTutorSchema.parse(req.body);
    const [tutor] = await req.db.insert(tutors).values(body).returning();
    return reply.status(201).send({ data: tutor });
  });

  app.put('/api/v1/tutors/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = UpdateTutorSchema.parse(req.body);
    const [updated] = await req.db.update(tutors).set(patch).where(eq(tutors.id, id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Tutor not found', code: 'NOT_FOUND' });
    return { data: updated };
  });

  app.delete('/api/v1/tutors/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const activeStatuses = ['cancelado', 'check-out'];
    const activeBookings = await req.db.select().from(bookings).where(
      and(eq(bookings.tutor_id, id))
    );
    const hasActive = activeBookings.some(b => !activeStatuses.includes(b.status_presenca));
    if (hasActive) {
      return reply.status(409).send({ error: 'Tutor has active bookings', code: 'HAS_ACTIVE_BOOKINGS' });
    }
    const animalRows = await req.db.select().from(animals).where(eq(animals.tutor_id, id));
    if (animalRows.length > 0) {
      return reply.status(409).send({ error: 'Tutor has registered animals', code: 'HAS_ANIMALS' });
    }
    const [deleted] = await req.db.delete(tutors).where(eq(tutors.id, id)).returning();
    if (!deleted) return reply.status(404).send({ error: 'Tutor not found', code: 'NOT_FOUND' });
    return { data: { deleted: true } };
  });

  // LGPD — hard delete: tutor + animals + bookings + contracts + all files
  app.delete('/api/v1/tutors/:id/account', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [tutor] = await req.db.select().from(tutors).where(eq(tutors.id, id));
    if (!tutor) return reply.status(404).send({ error: 'Tutor not found', code: 'NOT_FOUND' });

    const tutorBookings = await req.db.select().from(bookings).where(eq(bookings.tutor_id, id));
    const bookingIds = tutorBookings.map(b => b.id);

    if (bookingIds.length > 0) {
      const contractRows = await req.db.select().from(contracts).where(inArray(contracts.booking_id, bookingIds));
      for (const c of contractRows) {
        if (c.assinatura_path) await deleteFile(c.assinatura_path);
        if (c.pdf_rascunho_path) await deleteFile(c.pdf_rascunho_path);
        if (c.pdf_final_path) await deleteFile(c.pdf_final_path);
        if (c.assinatura_hotel_path) await deleteFile(c.assinatura_hotel_path);
      }
      await req.db.delete(contracts).where(inArray(contracts.booking_id, bookingIds));
    }

    if (bookingIds.length > 0) {
      await req.db.delete(bookings).where(eq(bookings.tutor_id, id));
    }

    const tutorAnimals = await req.db.select().from(animals).where(eq(animals.tutor_id, id));
    for (const a of tutorAnimals) {
      if (a.foto_path) await deleteFile(a.foto_path);
      for (const f of a.arquivos_vacinacao ?? []) await deleteFile(f);
    }
    if (tutorAnimals.length > 0) {
      await req.db.delete(animals).where(eq(animals.tutor_id, id));
    }

    await req.db.delete(tutors).where(eq(tutors.id, id));

    return { data: { deleted: true } };
  });
}
