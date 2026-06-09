import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { eq, and } from 'drizzle-orm';
import path from 'node:path';
import { z } from 'zod';
import { db } from '../db/index.js';
import { animals, bookings } from '../db/schema.js';
import { saveFile, deleteFile } from '../lib/storage.js';

const SaudeSchema = z.object({
  vacinas: z.array(z.string()).optional().default([]),
  alergias: z.array(z.string()).optional().default([]),
  observacoes: z.string().optional().default(''),
});

const PreferenciasSchema = z.object({
  alimentacao: z.string().optional().default(''),
  comportamento: z.string().optional().default(''),
});

const CreateAnimalSchema = z.object({
  tutor_id: z.string().uuid(),
  nome: z.string().min(1),
  especie: z.enum(['cachorro', 'gato', 'outro']),
  raca: z.string().optional().default(''),
  idade: z.number().int().nonnegative().optional().default(0),
  peso: z.number().nonnegative().optional().default(0),
  saude: SaudeSchema.optional(),
  preferencias: PreferenciasSchema.optional(),
});

const UpdateAnimalSchema = CreateAnimalSchema.omit({ tutor_id: true }).partial();

function sanitizeFilename(fname: string): void {
  if (!fname || /[/\\]/.test(fname) || fname.includes('..')) {
    throw Object.assign(new Error('Invalid filename'), { statusCode: 400, code: 'INVALID_FILE' });
  }
}

export async function animalsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/animals', { preHandler: [app.requireAuth] }, async (req) => {
    const { tutor_id } = req.query as { tutor_id?: string };
    const rows = tutor_id
      ? await db.select().from(animals).where(eq(animals.tutor_id, tutor_id)).orderBy(animals.created_at)
      : await db.select().from(animals).orderBy(animals.created_at);
    return { data: rows, meta: { total: rows.length } };
  });

  app.get('/api/v1/animals/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [animal] = await db.select().from(animals).where(eq(animals.id, id));
    if (!animal) return reply.status(404).send({ error: 'Animal not found', code: 'NOT_FOUND' });
    const bookingRows = await db.select().from(bookings).where(eq(bookings.animal_id, id))
      .orderBy(bookings.created_at);
    return { data: { ...animal, bookings: bookingRows } };
  });

  app.post('/api/v1/animals', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const body = CreateAnimalSchema.parse(req.body);
    const [animal] = await db.insert(animals).values({
      tutor_id: body.tutor_id,
      nome: body.nome,
      especie: body.especie,
      raca: body.raca ?? '',
      idade: body.idade ?? 0,
      peso: String(body.peso ?? 0),
      saude: body.saude ?? { vacinas: [], alergias: [], observacoes: '' },
      preferencias: body.preferencias ?? { alimentacao: '', comportamento: '' },
      arquivos_vacinacao: [],
    }).returning();
    return reply.status(201).send({ data: animal });
  });

  app.put('/api/v1/animals/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = UpdateAnimalSchema.parse(req.body);
    const updates: Record<string, unknown> = { ...patch };
    if (patch.peso !== undefined) updates['peso'] = String(patch.peso);
    const [updated] = await db.update(animals).set(updates).where(eq(animals.id, id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Animal not found', code: 'NOT_FOUND' });
    return { data: updated };
  });

  app.delete('/api/v1/animals/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const activeStatuses = ['cancelado', 'check-out'];
    const bookingRows = await db.select().from(bookings).where(eq(bookings.animal_id, id));
    const hasActive = bookingRows.some(b => !activeStatuses.includes(b.status_presenca));
    if (hasActive) {
      return reply.status(409).send({ error: 'Animal has active bookings', code: 'HAS_ACTIVE_BOOKINGS' });
    }
    const [deleted] = await db.delete(animals).where(eq(animals.id, id)).returning();
    if (!deleted) return reply.status(404).send({ error: 'Animal not found', code: 'NOT_FOUND' });
    return { data: { deleted: true } };
  });

  // Upload vaccination file
  app.post('/api/v1/animals/:id/vacina', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = await req.file() as MultipartFile | undefined;
    if (!data) return reply.status(400).send({ error: 'No file uploaded', code: 'NO_FILE' });

    const ext = path.extname(data.filename);
    const destRelPath = `uploads/animal_${id}/${Date.now()}${ext}`;
    const buf = await data.toBuffer();
    const savedPath = await saveFile(buf, destRelPath);

    const [animal] = await db.select().from(animals).where(eq(animals.id, id));
    if (!animal) return reply.status(404).send({ error: 'Animal not found', code: 'NOT_FOUND' });

    const [updated] = await db.update(animals)
      .set({ arquivos_vacinacao: [...(animal.arquivos_vacinacao ?? []), savedPath] })
      .where(eq(animals.id, id)).returning();
    return { data: updated };
  });

  // Delete vaccination file
  app.delete('/api/v1/animals/:id/vacina/:fname', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id, fname } = req.params as { id: string; fname: string };
    sanitizeFilename(fname);

    const [animal] = await db.select().from(animals).where(eq(animals.id, id));
    if (!animal) return reply.status(404).send({ error: 'Animal not found', code: 'NOT_FOUND' });

    const storedPath = (animal.arquivos_vacinacao ?? []).find(p =>
      p === `uploads/animal_${id}/${fname}` || p.endsWith(`/${fname}`)
    );
    if (storedPath) await deleteFile(storedPath);

    const [updated] = await db.update(animals)
      .set({ arquivos_vacinacao: (animal.arquivos_vacinacao ?? []).filter(p => p !== storedPath) })
      .where(eq(animals.id, id)).returning();
    return { data: updated };
  });

  // Upload profile photo
  app.post('/api/v1/animals/:id/foto', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = await req.file() as MultipartFile | undefined;
    if (!data) return reply.status(400).send({ error: 'No file', code: 'NO_FILE' });

    const [animal] = await db.select().from(animals).where(eq(animals.id, id));
    if (!animal) return reply.status(404).send({ error: 'Animal not found', code: 'NOT_FOUND' });

    if (animal.foto_path) await deleteFile(animal.foto_path).catch(() => undefined);

    const ext = path.extname(data.filename).toLowerCase() || '.jpg';
    const buf = await data.toBuffer();
    const savedPath = await saveFile(buf, `uploads/animal_${id}/foto${ext}`);
    const [updated] = await db.update(animals).set({ foto_path: savedPath })
      .where(eq(animals.id, id)).returning();
    return { data: updated };
  });

  // Delete profile photo
  app.delete('/api/v1/animals/:id/foto', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [animal] = await db.select().from(animals).where(eq(animals.id, id));
    if (!animal) return reply.status(404).send({ error: 'Animal not found', code: 'NOT_FOUND' });
    if (animal.foto_path) await deleteFile(animal.foto_path).catch(() => undefined);
    const [updated] = await db.update(animals).set({ foto_path: null })
      .where(eq(animals.id, id)).returning();
    return { data: updated };
  });
}
