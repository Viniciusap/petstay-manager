import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { eq } from 'drizzle-orm';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { db } from '../db/index.js';
import { appSettings } from '../db/schema.js';
import { saveFile, deleteFile } from '../lib/storage.js';
import { authRateLimitConfig } from '../plugins/rateLimits.js';

const execFileAsync = promisify(execFile);
const SAFE_FNAME = /^[\w-]+\.sql$/;

function getBackupDir(): string {
  return path.resolve(process.env['DATA_DIR'] ?? './data', 'backups');
}

const UpdateSettingsSchema = z.object({
  nome_estabelecimento: z.string().optional(),
  cor_primaria: z.string().optional(),
  tema_padrao: z.enum(['light', 'dark']).optional(),
  telefone_contato: z.string().optional(),
  cidade: z.string().optional(),
  moeda: z.string().optional(),
  diaria_base: z.number().nonnegative().optional(),
  idioma_padrao: z.enum(['pt', 'en']).optional(),
  contrato_validade_horas: z.number().int().positive().nullable().optional(),
  base_url: z.string().optional(),
  onboarding_completo: z.boolean().optional(),
  clausulas_pt: z.array(z.string()).optional(),
  clausulas_en: z.array(z.string()).optional(),
}).strip();

const ALLOWED_LOGO_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

async function getSettings() {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  return row;
}

async function upsertSettings(patch: Record<string, unknown>) {
  const [row] = await db.insert(appSettings).values({ id: 1, ...patch })
    .onConflictDoUpdate({ target: appSettings.id, set: patch }).returning();
  return row;
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/settings', { preHandler: [app.requireAuth] }, async () => {
    const settings = await getSettings();
    return { data: settings };
  });

  app.put('/api/v1/settings', { preHandler: [app.requireAuth] }, async (req) => {
    const patch = UpdateSettingsSchema.parse(req.body);
    const updates: Record<string, unknown> = { ...patch };
    if (patch.diaria_base !== undefined) updates['diaria_base'] = String(patch.diaria_base);
    const settings = await upsertSettings(updates);
    return { data: settings };
  });

  app.post('/api/v1/settings/logo', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const data = await req.file() as MultipartFile | undefined;
    if (!data) return reply.status(400).send({ error: 'No file uploaded', code: 'NO_FILE' });

    const ext = path.extname(data.filename).toLowerCase();
    if (!ALLOWED_LOGO_EXTS.includes(ext)) {
      return reply.status(400).send({ error: 'Invalid file extension', code: 'INVALID_FILE_TYPE' });
    }

    const buf = await data.toBuffer();
    const logo_path = await saveFile(buf, `uploads/logo/logo${ext}`);
    const settings = await upsertSettings({ logo_path });
    return { data: settings };
  });

  app.delete('/api/v1/settings/logo', { preHandler: [app.requireAuth] }, async () => {
    const current = await getSettings();
    if (current?.logo_path) await deleteFile(current.logo_path);
    const settings = await upsertSettings({ logo_path: null });
    return { data: settings };
  });

  app.post('/api/v1/settings/assinatura', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const body = req.body as { assinatura_base64?: string; nome_representante?: string };
    const { assinatura_base64, nome_representante } = body;

    if (!nome_representante || nome_representante.trim().length < 2) {
      return reply.status(400).send({ error: 'Nome do representante obrigatorio', code: 'NAME_REQUIRED' });
    }
    if (!assinatura_base64) {
      return reply.status(400).send({ error: 'Assinatura obrigatoria', code: 'SIGNATURE_REQUIRED' });
    }
    if (assinatura_base64.length > 3 * 1024 * 1024) {
      return reply.status(413).send({ error: 'Assinatura muito grande', code: 'PAYLOAD_TOO_LARGE' });
    }
    if (!assinatura_base64.startsWith('data:image/png;base64,')) {
      return reply.status(400).send({ error: 'Formato invalido', code: 'INVALID_SIGNATURE_FORMAT' });
    }

    const buf = Buffer.from(assinatura_base64.slice('data:image/png;base64,'.length), 'base64');
    if (buf.length < 4 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) {
      return reply.status(400).send({ error: 'PNG invalido', code: 'INVALID_SIGNATURE_FORMAT' });
    }

    const assinatura_hotel_path = await saveFile(buf, 'uploads/signatures/hotel_sig.png');
    const settings = await upsertSettings({
      assinatura_hotel_path,
      nome_hotel_assinante: nome_representante.trim(),
    });
    return { data: { assinatura_hotel_path, nome_hotel_assinante: settings?.nome_hotel_assinante } };
  });

  app.delete('/api/v1/settings/assinatura', { preHandler: [app.requireAuth] }, async () => {
    const current = await getSettings();
    if (current?.assinatura_hotel_path) await deleteFile(current.assinatura_hotel_path);
    const settings = await upsertSettings({ assinatura_hotel_path: null, nome_hotel_assinante: null });
    return { data: settings };
  });

  app.get('/api/v1/settings/backup/list', { preHandler: [app.requireAuth] }, async () => {
    const dir = getBackupDir();
    await fs.mkdir(dir, { recursive: true });
    const files = await fs.readdir(dir);
    const backups = await Promise.all(
      files
        .filter(f => f.endsWith('.sql'))
        .sort((a, b) => b.localeCompare(a))
        .map(async fname => {
          const stat = await fs.stat(path.join(dir, fname));
          return { fname, size: stat.size, mtime: stat.mtime.toISOString() };
        })
    );
    return { data: backups };
  });

  app.post('/api/v1/settings/backup', { preHandler: [app.requireAuth] }, async (_, reply) => {
    const dbUrl = process.env['POSTGRES_URL'];
    if (!dbUrl) return reply.status(500).send({ error: 'POSTGRES_URL not set', code: 'MISSING_ENV' });

    const dir = getBackupDir();
    await fs.mkdir(dir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fname = `backup_${ts}.sql`;
    const fpath = path.join(dir, fname);

    try {
      await execFileAsync('pg_dump', ['--clean', '--if-exists', '-f', fpath, dbUrl]);
      const stat = await fs.stat(fpath);
      return { data: { fname, size: stat.size, mtime: stat.mtime.toISOString() } };
    } catch (err: any) {
      app.log.error({ err }, 'pg_dump failed');
      return reply.status(500).send({ error: 'Backup failed', code: 'BACKUP_FAILED' });
    }
  });

  app.post('/api/v1/settings/backup/restore/:fname', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { fname } = req.params as { fname: string };
    if (!SAFE_FNAME.test(fname)) return reply.status(400).send({ error: 'Invalid filename', code: 'INVALID_FNAME' });

    const dir = getBackupDir();
    const fpath = path.join(dir, fname);
    if (!fpath.startsWith(dir + path.sep) && fpath !== path.join(dir, fname)) {
      return reply.status(400).send({ error: 'Invalid path', code: 'INVALID_PATH' });
    }

    try {
      await fs.access(fpath);
    } catch {
      return reply.status(404).send({ error: 'Backup not found', code: 'BACKUP_NOT_FOUND' });
    }

    const dbUrl = process.env['POSTGRES_URL'];
    if (!dbUrl) return reply.status(500).send({ error: 'POSTGRES_URL not set', code: 'MISSING_ENV' });

    try {
      await execFileAsync('psql', [dbUrl, '-f', fpath]);
      return { data: { ok: true } };
    } catch (err: any) {
      app.log.error({ err }, 'psql restore failed');
      return reply.status(500).send({ error: 'Restore failed', code: 'RESTORE_FAILED' });
    }
  });
}
