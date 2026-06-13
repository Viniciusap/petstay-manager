import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { bookings, animals, tutors, appSettings } from '../db/schema.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function galeriaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/galeria/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    if (!UUID_RE.test(token)) {
      return reply.status(400).send({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }

    const allBookings = await req.db.select().from(bookings)
      .where(eq(bookings.galeria_token, token));
    const booking = allBookings[0];
    if (!booking || !booking.galeria?.length) {
      return reply.status(404).send({ error: 'Gallery not found', code: 'NOT_FOUND' });
    }

    const [[animal], [tutor], [settings]] = await Promise.all([
      req.db.select().from(animals).where(eq(animals.id, booking.animal_id)),
      req.db.select().from(tutors).where(eq(tutors.id, booking.tutor_id)),
      req.db.select().from(appSettings).where(eq(appSettings.id, 1)),
    ]);

    return {
      data: {
        fotos: booking.galeria,
        animal: animal?.nome ?? '—',
        especie: animal?.especie ?? '',
        tutor: tutor?.nome ?? '—',
        hotel: settings?.nome_estabelecimento ?? 'PetStay',
        logo: settings?.logo_path ?? null,
        cor_primaria: settings?.cor_primaria ?? '#F97316',
        data_entrada: booking.data_entrada,
        data_saida: booking.data_saida,
      },
    };
  });
}
