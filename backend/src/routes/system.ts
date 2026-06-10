import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { listTenants, createTenant, setTenantActive, getTenant } from '../db/system.js';
import { getDb, initTenantSchema, isValidSlug } from '../db/index.js';
import postgres from 'postgres';

const SLUG_SCHEMA = z.string().min(2).max(63).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Slug inválido (só letras minúsculas, dígitos e hífens)');

function cookieOpts() {
  const prod = process.env['NODE_ENV'] === 'production';
  return { httpOnly: true, secure: prod, sameSite: prod ? 'none' : 'lax', path: '/system' } as const;
}

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.post('/system/api/login', async (req, reply) => {
    const { senha } = z.object({ senha: z.string().min(1) }).parse(req.body);
    const adminPassword = process.env['SYSTEM_ADMIN_PASSWORD'];
    if (!adminPassword) return reply.status(500).send({ error: 'SYSTEM_ADMIN_PASSWORD não configurado', code: 'MISSING_ENV' });

    // Support both raw plaintext and pre-hashed ($2b$...) value in env
    const valid = adminPassword.startsWith('$2')
      ? await bcrypt.compare(senha, adminPassword)
      : senha === adminPassword;

    if (!valid) return reply.status(401).send({ error: 'Senha incorreta', code: 'INVALID_PASSWORD' });

    const token = (app as any).systemSign({ role: 'system' }, { expiresIn: '8h' });
    void reply.setCookie('petstay_system_token', token, { ...cookieOpts(), maxAge: 8 * 3600 * 1000 });
    return { data: { ok: true } };
  });

  app.get('/system/api/tenants', { preHandler: [app.requireSystemAuth] }, async () => {
    const tenants = await listTenants();
    return { data: tenants };
  });

  app.post('/system/api/tenants', { preHandler: [app.requireSystemAuth] }, async (req, reply) => {
    const { slug, name } = z.object({ slug: SLUG_SCHEMA, name: z.string().min(2) }).parse(req.body);

    if (!isValidSlug(slug)) return reply.status(400).send({ error: 'Slug reservado ou inválido', code: 'INVALID_SLUG' });

    const existing = await getTenant(slug);
    if (existing) return reply.status(409).send({ error: 'Tenant já existe', code: 'TENANT_EXISTS' });

    const tenant = await createTenant(slug, name);

    // Provision schema + DDL immediately
    const adminSql = postgres(process.env['POSTGRES_URL']!, { max: 1, onnotice: () => {} });
    try {
      await adminSql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${slug}"`);
      await initTenantSchema(adminSql, slug);
    } finally {
      await adminSql.end();
    }

    // Warm the DB cache
    await getDb(slug);

    return reply.status(201).send({ data: tenant });
  });

  app.patch('/system/api/tenants/:slug', { preHandler: [app.requireSystemAuth] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const existing = await getTenant(slug);
    if (!existing) return reply.status(404).send({ error: 'Tenant não encontrado', code: 'NOT_FOUND' });
    await setTenantActive(slug, active);
    return { data: { slug, active } };
  });

  app.post('/system/api/logout', async (_, reply) => {
    const prod = process.env['NODE_ENV'] === 'production';
    void reply.clearCookie('petstay_system_token', { path: '/system', sameSite: prod ? 'none' : 'lax', secure: prod });
    return { data: { ok: true } };
  });
}
