import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { eq, and, or, ilike } from 'drizzle-orm';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { bookings, animals, tutors, contracts, appSettings } from '../db/schema.js';
import { saveFile, deleteFile } from '../lib/storage.js';
import { generateContractPdf } from '../lib/pdfGenerator.js';
import type { ServiceItem } from '../types/index.js';

const ServiceItemSchema = z.object({
  servico_id: z.string(),
  nome: z.string(),
  nome_en: z.string().optional().default(''),
  valor: z.number().nonnegative(),
});

const CreateBookingSchema = z.object({
  animal_id: z.string().uuid(),
  tutor_id: z.string().uuid(),
  data_entrada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_saida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valor_diaria: z.number().nonnegative().optional(),
  servicos_adicionais: z.array(ServiceItemSchema).optional().default([]),
  observacoes: z.string().optional().default(''),
});

const UpdateBookingSchema = z.object({
  data_entrada: z.string().optional(),
  data_saida: z.string().optional(),
  valor_diaria: z.number().nonnegative().optional(),
  valor_total: z.number().nonnegative().optional(),
  status_pagamento: z.enum(['pendente', 'pago', 'parcial']).optional(),
  status_presenca: z.enum(['agendado', 'check-in', 'check-out', 'cancelado']).optional(),
  servicos_adicionais: z.array(ServiceItemSchema).optional(),
  observacoes: z.string().optional(),
});

function calcTotal(dataEntrada: string, dataSaida: string, valorDiaria: number, servicos: ServiceItem[] = []) {
  const ms = new Date(dataSaida).getTime() - new Date(dataEntrada).getTime();
  const dias = Math.max(1, Math.ceil(ms / 86_400_000));
  const extras = servicos.reduce((sum, s) => sum + (s.valor ?? 0), 0);
  return { dias, total: dias * valorDiaria + extras };
}

export async function bookingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/bookings', { preHandler: [app.requireAuth] }, async (req) => {
    const { status, data: dateFilter, q } = req.query as { status?: string; data?: string; q?: string };

    let rows = await req.db.select().from(bookings).orderBy(bookings.created_at);

    if (status) rows = rows.filter(b => b.status_presenca === status);
    if (dateFilter) rows = rows.filter(b => b.data_entrada === dateFilter || b.data_saida === dateFilter);

    if (q) {
      const lower = q.toLowerCase();
      const [animalRows, tutorRows] = await Promise.all([
        req.db.select().from(animals),
        req.db.select().from(tutors),
      ]);
      const animalMap = new Map(animalRows.map(a => [a.id, a]));
      const tutorMap = new Map(tutorRows.map(t => [t.id, t]));
      rows = rows.filter(b => {
        const animal = animalMap.get(b.animal_id);
        const tutor = tutorMap.get(b.tutor_id);
        return animal?.nome?.toLowerCase().includes(lower) || tutor?.nome?.toLowerCase().includes(lower);
      });
    }

    const [animalRows, tutorRows] = await Promise.all([
      req.db.select().from(animals),
      req.db.select().from(tutors),
    ]);
    const animalMap = new Map(animalRows.map(a => [a.id, a]));
    const tutorMap = new Map(tutorRows.map(t => [t.id, t]));

    const populated = rows.map(b => ({
      ...b,
      animal: animalMap.get(b.animal_id) ?? null,
      tutor: tutorMap.get(b.tutor_id) ?? null,
    }));

    return { data: populated, meta: { total: populated.length } };
  });

  app.get('/api/v1/bookings/calendar', { preHandler: [app.requireAuth] }, async (req) => {
    const { mes } = req.query as { mes?: string };
    if (!mes) return { data: { bookings: [], blocked: [] } };

    const bookingRows = await req.db.select().from(bookings);
    const filtered = bookingRows.filter(b =>
      b.data_entrada?.startsWith(mes) || b.data_saida?.startsWith(mes)
    );

    return { data: { bookings: filtered, blocked: [] } };
  });

  app.get('/api/v1/bookings/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [booking] = await req.db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking) return reply.status(404).send({ error: 'Booking not found', code: 'NOT_FOUND' });

    const [[animal], [tutor], [contract]] = await Promise.all([
      req.db.select().from(animals).where(eq(animals.id, booking.animal_id)),
      req.db.select().from(tutors).where(eq(tutors.id, booking.tutor_id)),
      req.db.select().from(contracts).where(eq(contracts.booking_id, id)),
    ]);

    return { data: { ...booking, animal: animal ?? null, tutor: tutor ?? null, contract: contract ?? null } };
  });

  app.post('/api/v1/bookings', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const body = CreateBookingSchema.parse(req.body);

    let valorDiaria = body.valor_diaria;
    if (valorDiaria === undefined) {
      const [settings] = await req.db.select().from(appSettings).where(eq(appSettings.id, 1));
      valorDiaria = parseFloat(settings?.diaria_base ?? '80');
    }

    const servicos = body.servicos_adicionais ?? [];
    const { total } = calcTotal(body.data_entrada, body.data_saida, valorDiaria, servicos);

    const [booking] = await req.db.insert(bookings).values({
      animal_id: body.animal_id,
      tutor_id: body.tutor_id,
      data_entrada: body.data_entrada,
      data_saida: body.data_saida,
      valor_diaria: String(valorDiaria),
      valor_total: String(total),
      status_pagamento: 'pendente',
      status_presenca: 'agendado',
      servicos_adicionais: servicos,
      observacoes: body.observacoes ?? '',
    }).returning();

    const [settings] = await req.db.select().from(appSettings).where(eq(appSettings.id, 1));
    const validadeHoras = settings?.contrato_validade_horas;
    const dataExpiracao = validadeHoras ? new Date(Date.now() + validadeHoras * 3_600_000) : null;

    const [contract] = await req.db.insert(contracts).values({
      booking_id: booking!.id,
      token_unico: uuidv4(),
      status: 'gerado',
      data_expiracao: dataExpiracao,
    }).returning();

    generateContractPdf(req.db, contract!.id, 'rascunho').catch((err: Error) =>
      app.log.error({ err }, 'Draft PDF error')
    );

    return reply.status(201).send({ data: { booking, contract } });
  });

  app.put('/api/v1/bookings/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = UpdateBookingSchema.parse(req.body);
    const updates: Record<string, unknown> = { ...patch };
    if (patch.valor_diaria !== undefined) updates['valor_diaria'] = String(patch.valor_diaria);
    if (patch.valor_total !== undefined) updates['valor_total'] = String(patch.valor_total);
    const [updated] = await req.db.update(bookings).set(updates).where(eq(bookings.id, id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Booking not found', code: 'NOT_FOUND' });
    return { data: updated };
  });

  app.put('/api/v1/bookings/:id/checkin', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [updated] = await req.db.update(bookings).set({ status_presenca: 'check-in' })
      .where(eq(bookings.id, id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Booking not found', code: 'NOT_FOUND' });
    return { data: updated };
  });

  app.put('/api/v1/bookings/:id/checkout', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [updated] = await req.db.update(bookings).set({ status_presenca: 'check-out' })
      .where(eq(bookings.id, id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Booking not found', code: 'NOT_FOUND' });
    return { data: updated };
  });

  app.put('/api/v1/bookings/:id/pagamento', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status_pagamento } = req.body as { status_pagamento?: string };
    if (!['pendente', 'pago', 'parcial'].includes(status_pagamento ?? '')) {
      return reply.status(400).send({ error: 'Invalid payment status', code: 'VALIDATION_ERROR' });
    }
    const [updated] = await req.db.update(bookings).set({ status_pagamento: status_pagamento! })
      .where(eq(bookings.id, id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Booking not found', code: 'NOT_FOUND' });
    return { data: updated };
  });

  app.delete('/api/v1/bookings/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [booking] = await req.db.update(bookings).set({ status_presenca: 'cancelado' })
      .where(eq(bookings.id, id)).returning();
    if (!booking) return reply.status(404).send({ error: 'Booking not found', code: 'NOT_FOUND' });

    const activeContract = await req.db.select().from(contracts)
      .where(and(eq(contracts.booking_id, id)));
    const toCancel = activeContract.find(c => c.status !== 'assinado' && c.status !== 'cancelado');
    if (toCancel) {
      await req.db.update(contracts).set({ status: 'cancelado' }).where(eq(contracts.id, toCancel.id));
    }

    return { data: booking };
  });

  // Upload gallery photos
  app.post('/api/v1/bookings/:id/galeria', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parts = req.files() as AsyncIterableIterator<MultipartFile>;
    const saved: string[] = [];

    let i = 0;
    for await (const part of parts) {
      const ext = path.extname(part.filename).toLowerCase() || '.jpg';
      const buf = await part.toBuffer();
      const savedPath = await saveFile(buf, `uploads/galeria/${id}/${Date.now()}_${i}${ext}`);
      saved.push(savedPath);
      i++;
    }

    if (!saved.length) return reply.status(400).send({ error: 'No files', code: 'NO_FILE' });

    const [booking] = await req.db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking) return reply.status(404).send({ error: 'Booking not found', code: 'NOT_FOUND' });

    const galeria = [
      ...(booking.galeria ?? []),
      ...saved.map(p => ({ path: p, uploaded_at: new Date().toISOString() })),
    ];
    const galeria_token = booking.galeria_token ?? uuidv4();
    const [updated] = await req.db.update(bookings).set({ galeria, galeria_token })
      .where(eq(bookings.id, id)).returning();
    return { data: updated };
  });

  // Delete single gallery photo
  app.delete('/api/v1/bookings/:id/galeria/:index', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id, index: idxStr } = req.params as { id: string; index: string };
    const [booking] = await req.db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking) return reply.status(404).send({ error: 'Booking not found', code: 'NOT_FOUND' });

    const idx = parseInt(idxStr, 10);
    const galeria = [...(booking.galeria ?? [])];
    if (isNaN(idx) || idx < 0 || idx >= galeria.length) {
      return reply.status(404).send({ error: 'Photo not found', code: 'NOT_FOUND' });
    }

    const photo = galeria[idx];
    if (photo?.path) await deleteFile(photo.path);
    galeria.splice(idx, 1);
    const [updated] = await req.db.update(bookings).set({ galeria }).where(eq(bookings.id, id)).returning();
    return { data: updated };
  });
}
