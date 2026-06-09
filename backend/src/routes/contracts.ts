import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../db/index.js';
import { contracts, bookings, animals, tutors, appSettings } from '../db/schema.js';
import { saveFile, fileExists, streamFile } from '../lib/storage.js';
import { generateContractPdf } from '../lib/pdfGenerator.js';
import { generateHash } from '../lib/contractHash.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SIG_BYTES = 3 * 1024 * 1024;

const SignSchema = z.object({
  assinatura_base64: z.string(),
  nome_digitado: z.string().min(3),
  aceite_termos: z.literal(true, { errorMap: () => ({ message: 'Terms not accepted' }) }),
});

const SignHotelSchema = z.object({
  assinatura_base64: z.string(),
  nome_assinante: z.string().min(2),
});

function maskIp(ip: string): string {
  const v4 = ip.match(/^(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) return `${v4[1]}.x.x`;
  const v6parts = ip.split(':');
  if (v6parts.length >= 4) return v6parts.slice(0, 3).join(':') + ':xxxx';
  return ip.slice(0, 8) + '…';
}

function parseSigBuffer(assinatura_base64: string): Buffer | null {
  if (!assinatura_base64.startsWith('data:image/png;base64,')) return null;
  const buf = Buffer.from(assinatura_base64.slice('data:image/png;base64,'.length), 'base64');
  if (buf.length < 4 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) return null;
  return buf;
}

async function getContractFull(contract: typeof contracts.$inferSelect) {
  const [[booking], [settings]] = await Promise.all([
    db.select().from(bookings).where(eq(bookings.id, contract.booking_id)),
    db.select().from(appSettings).where(eq(appSettings.id, 1)),
  ]);
  const [animal, tutor] = booking
    ? await Promise.all([
        db.select().from(animals).where(eq(animals.id, booking.animal_id)).then(r => r[0]),
        db.select().from(tutors).where(eq(tutors.id, booking.tutor_id)).then(r => r[0]),
      ])
    : [null, null];
  return { contract, booking: booking ?? null, animal: animal ?? null, tutor: tutor ?? null, settings: settings ?? null };
}

async function checkExpiry(contract: typeof contracts.$inferSelect) {
  if (contract.data_expiracao && new Date() > contract.data_expiracao) {
    await db.update(contracts).set({ status: 'expirado' }).where(eq(contracts.id, contract.id));
    return { expired: true };
  }
  if (contract.status === 'assinado') return { signed: true };
  if (contract.status === 'expirado') return { expired: true };
  return {};
}

export async function contractsRoutes(app: FastifyInstance): Promise<void> {
  // Admin: get by ID
  app.get('/api/v1/contracts/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
    if (!contract) return reply.status(404).send({ error: 'Contract not found', code: 'NOT_FOUND' });
    return { data: await getContractFull(contract) };
  });

  // Public: get by token
  app.get('/api/v1/contracts/token/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    if (!UUID_RE.test(token)) {
      return reply.status(400).send({ error: 'Invalid token format', code: 'INVALID_TOKEN' });
    }
    const [contract] = await db.select().from(contracts).where(eq(contracts.token_unico, token));
    if (!contract) return reply.status(404).send({ error: 'Invalid token', code: 'INVALID_TOKEN' });

    const state = await checkExpiry(contract);
    if (state.expired) return reply.status(410).send({ error: 'Contract expired', code: 'TOKEN_EXPIRED' });
    if (state.signed) return reply.status(409).send({ error: 'Contract already signed', code: 'ALREADY_SIGNED' });

    if (contract.status === 'gerado') {
      await db.update(contracts)
        .set({ status: 'visualizado', data_visualizacao: new Date() })
        .where(eq(contracts.id, contract.id));
    }

    return { data: await getContractFull(contract) };
  });

  // Public: sign contract
  app.post('/api/v1/contracts/sign/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    if (!UUID_RE.test(token)) {
      return reply.status(400).send({ error: 'Invalid token format', code: 'INVALID_TOKEN' });
    }
    const [contract] = await db.select().from(contracts).where(eq(contracts.token_unico, token));
    if (!contract) return reply.status(404).send({ error: 'Invalid token', code: 'INVALID_TOKEN' });

    const state = await checkExpiry(contract);
    if (state.expired) return reply.status(410).send({ error: 'Contract expired', code: 'TOKEN_EXPIRED' });
    if (state.signed) return reply.status(409).send({ error: 'Contract already signed', code: 'ALREADY_SIGNED' });

    const body = SignSchema.parse(req.body);

    if (body.assinatura_base64.length > MAX_SIG_BYTES) {
      return reply.status(413).send({ error: 'Signature file too large', code: 'PAYLOAD_TOO_LARGE' });
    }

    const sigBuffer = parseSigBuffer(body.assinatura_base64);
    if (!sigBuffer) {
      return reply.status(400).send({ error: 'Invalid PNG signature', code: 'INVALID_SIGNATURE_FORMAT' });
    }

    const sigFilename = `contrato_${contract.id}_sig.png`;
    const savedSigPath = await saveFile(sigBuffer, `uploads/signatures/${sigFilename}`);

    const rawIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? '';
    const timestamp = new Date().toISOString();
    const hash = generateHash(contract.token_unico, body.nome_digitado.trim(), timestamp);

    await db.update(contracts).set({
      status: 'assinado',
      data_assinatura: new Date(),
      assinatura_path: savedSigPath,
      nome_digitado: body.nome_digitado.trim(),
      aceite_termos: true,
      ip_assinante: maskIp(rawIp),
      user_agent: req.headers['user-agent'] ?? null,
      hash_verificacao: hash,
    }).where(eq(contracts.id, contract.id));

    const pdfPath = await generateContractPdf(contract.id, 'final');
    return { data: { hash, pdf_path: pdfPath } };
  });

  // Admin: resend (regenerate token)
  app.post('/api/v1/contracts/:id/resend', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
    if (!contract) return reply.status(404).send({ error: 'Contract not found', code: 'NOT_FOUND' });
    if (contract.status === 'assinado') {
      return reply.status(409).send({ error: 'Contract already signed', code: 'ALREADY_SIGNED' });
    }

    const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
    const validadeHoras = settings?.contrato_validade_horas;
    const dataExpiracao = validadeHoras ? new Date(Date.now() + validadeHoras * 3_600_000) : null;

    const [updated] = await db.update(contracts).set({
      token_unico: uuidv4(),
      status: 'gerado',
      data_geracao: new Date(),
      data_expiracao: dataExpiracao,
      data_visualizacao: null,
    }).where(eq(contracts.id, id)).returning();
    return { data: updated };
  });

  // Admin: hotel signs
  app.post('/api/v1/contracts/:id/sign-hotel', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
    if (!contract) return reply.status(404).send({ error: 'Contract not found', code: 'NOT_FOUND' });

    const body = SignHotelSchema.parse(req.body);

    if (body.assinatura_base64.length > MAX_SIG_BYTES) {
      return reply.status(413).send({ error: 'Signature too large', code: 'PAYLOAD_TOO_LARGE' });
    }

    const sigBuffer = parseSigBuffer(body.assinatura_base64);
    if (!sigBuffer) {
      return reply.status(400).send({ error: 'Invalid PNG', code: 'INVALID_SIGNATURE_FORMAT' });
    }

    const sigFilename = `contrato_${contract.id}_hotel_sig.png`;
    const savedSigPath = await saveFile(sigBuffer, `uploads/signatures/${sigFilename}`);

    const [updated] = await db.update(contracts).set({
      assinatura_hotel_path: savedSigPath,
      nome_hotel_assinante: body.nome_assinante.trim(),
      data_assinatura_hotel: new Date(),
    }).where(eq(contracts.id, id)).returning();

    if (contract.status === 'assinado') {
      generateContractPdf(contract.id, 'final').catch((err: Error) =>
        app.log.error({ err }, 'Hotel sign PDF regen error')
      );
    }

    return { data: updated };
  });

  // Admin: download draft PDF
  app.get('/api/v1/contracts/:id/pdf/rascunho', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
    if (!contract) return reply.status(404).send({ error: 'Contract not found', code: 'NOT_FOUND' });

    const pdfPath = (await fileExists(contract.pdf_rascunho_path))
      ? contract.pdf_rascunho_path!
      : await generateContractPdf(id, 'rascunho');

    return streamFile(reply, pdfPath, `contrato_${id}_rascunho.pdf`);
  });

  // Admin: download final PDF
  app.get('/api/v1/contracts/:id/pdf/final', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
    if (!contract) return reply.status(404).send({ error: 'Contract not found', code: 'NOT_FOUND' });
    if (contract.status !== 'assinado') {
      return reply.status(400).send({ error: 'Contract not signed yet', code: 'NOT_SIGNED' });
    }

    const pdfPath = (await fileExists(contract.pdf_final_path))
      ? contract.pdf_final_path!
      : await generateContractPdf(id, 'final');

    return streamFile(reply, pdfPath, `contrato_${id}_final.pdf`);
  });

  // Public: client downloads signed PDF by signing token
  app.get('/api/v1/contracts/pdf/by-token/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    if (!UUID_RE.test(token)) {
      return reply.status(400).send({ error: 'Invalid token format', code: 'INVALID_TOKEN' });
    }
    const [contract] = await db.select().from(contracts).where(eq(contracts.token_unico, token));
    if (!contract) return reply.status(404).send({ error: 'Contract not found', code: 'NOT_FOUND' });
    if (contract.status !== 'assinado') {
      return reply.status(400).send({ error: 'Contract not signed yet', code: 'NOT_SIGNED' });
    }

    const pdfPath = (await fileExists(contract.pdf_final_path))
      ? contract.pdf_final_path!
      : await generateContractPdf(contract.id, 'final');

    return streamFile(reply, pdfPath, 'contrato_assinado.pdf');
  });

  // Public: verify authenticity by hash
  app.get('/api/v1/contracts/verify/:hash', async (req, reply) => {
    const { hash } = req.params as { hash: string };
    if (!/^[a-f0-9]{64}$/.test(hash)) return { data: { valid: false } };

    const [contract] = await db.select().from(contracts).where(eq(contracts.hash_verificacao, hash));
    if (!contract) return { data: { valid: false } };

    const [[booking], [settings]] = await Promise.all([
      db.select().from(bookings).where(eq(bookings.id, contract.booking_id)),
      db.select().from(appSettings).where(eq(appSettings.id, 1)),
    ]);
    const [animal] = booking
      ? await db.select().from(animals).where(eq(animals.id, booking.animal_id))
      : [];

    return {
      data: {
        valid: true,
        estabelecimento: settings?.nome_estabelecimento ?? '—',
        pet: animal?.nome ?? '—',
        assinado_por: contract.nome_digitado,
        signed_at: contract.data_assinatura,
      },
    };
  });
}
