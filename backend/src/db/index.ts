import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';
import { getTenant, initSystemSchema } from './system.js';

export type DB = PostgresJsDatabase<typeof schema>;

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const BLOCKED_SLUGS = new Set([
  'system', 'health', 'api', 'assets', 'uploads', 'public',
  'postgres', '_system', 'pg_catalog', 'information_schema',
  'localhost', 'www', 'admin',
]);

const instances = new Map<string, DB>();
const initPromises = new Map<string, Promise<void>>();

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length <= 63 && !BLOCKED_SLUGS.has(slug);
}

export async function getDb(slug: string): Promise<DB> {
  if (!isValidSlug(slug)) {
    throw Object.assign(new Error('Tenant inválido'), { statusCode: 400 });
  }

  if (instances.has(slug)) return instances.get(slug)!;

  if (initPromises.has(slug)) {
    await initPromises.get(slug)!;
    return instances.get(slug)!;
  }

  const p = initSlug(slug);
  initPromises.set(slug, p);
  try {
    await p;
  } finally {
    initPromises.delete(slug);
  }
  return instances.get(slug)!;
}

async function initSlug(slug: string): Promise<void> {
  const tenant = await getTenant(slug);
  if (!tenant || !tenant.active) {
    throw Object.assign(new Error('Tenant não encontrado'), { statusCode: 404 });
  }

  // Create schema if not exists using an admin (no search_path) connection
  const adminSql = postgres(process.env['POSTGRES_URL']!, { max: 1, onnotice: () => {} });
  try {
    await adminSql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${slug}"`);
    await initTenantSchema(adminSql, slug);
  } finally {
    await adminSql.end();
  }

  const tenantSql = postgres(process.env['POSTGRES_URL']!, {
    max: 5,
    onnotice: () => {},
    connection: { search_path: `"${slug}"` },
  });
  instances.set(slug, drizzle(tenantSql, { schema }));
}

export async function initTenantSchema(pgSql: postgres.Sql, slug: string): Promise<void> {
  const exec = (sql: string) => pgSql.unsafe(sql);

  // All tables use the search_path implicitly set by the caller's connection.
  // When called from initSlug via adminSql, we prefix the schema explicitly.
  const s = `"${slug}"`;

  await exec(`CREATE TABLE IF NOT EXISTS ${s}.app_settings (
    id                    INTEGER PRIMARY KEY DEFAULT 1,
    nome_estabelecimento  TEXT NOT NULL DEFAULT '',
    logo_path             TEXT,
    cor_primaria          TEXT NOT NULL DEFAULT '#F97316',
    tema_padrao           TEXT NOT NULL DEFAULT 'light',
    telefone_contato      TEXT NOT NULL DEFAULT '',
    cidade                TEXT NOT NULL DEFAULT '',
    moeda                 TEXT NOT NULL DEFAULT 'BRL',
    diaria_base           NUMERIC NOT NULL DEFAULT 0,
    idioma_padrao         TEXT NOT NULL DEFAULT 'pt',
    contrato_validade_horas INTEGER,
    base_url              TEXT NOT NULL DEFAULT '',
    onboarding_completo   BOOLEAN NOT NULL DEFAULT false,
    clausulas_pt          JSONB NOT NULL DEFAULT '[]',
    clausulas_en          JSONB NOT NULL DEFAULT '[]',
    assinatura_hotel_path TEXT,
    nome_hotel_assinante  TEXT,
    senha_hash            TEXT,
    mfa_secret            TEXT,
    mfa_enabled           BOOLEAN NOT NULL DEFAULT false
  )`);

  // Seed the single settings row
  await exec(`INSERT INTO ${s}.app_settings (id) VALUES (1) ON CONFLICT DO NOTHING`);

  await exec(`CREATE TABLE IF NOT EXISTS ${s}.tutors (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome       TEXT NOT NULL,
    telefone   TEXT NOT NULL,
    email      TEXT NOT NULL DEFAULT '',
    endereco   TEXT NOT NULL DEFAULT '',
    tipo       TEXT NOT NULL DEFAULT 'primario',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS ${s}.animals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id            UUID NOT NULL REFERENCES ${s}.tutors(id),
    nome                TEXT NOT NULL,
    especie             TEXT NOT NULL,
    raca                TEXT NOT NULL DEFAULT '',
    idade               INTEGER NOT NULL DEFAULT 0,
    peso                NUMERIC NOT NULL DEFAULT 0,
    saude               JSONB NOT NULL DEFAULT '{"vacinas":[],"alergias":[],"observacoes":""}',
    preferencias        JSONB NOT NULL DEFAULT '{"alimentacao":"","comportamento":""}',
    arquivos_vacinacao  JSONB NOT NULL DEFAULT '[]',
    foto_path           TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS ${s}.services (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome       TEXT NOT NULL,
    nome_en    TEXT NOT NULL,
    valor      NUMERIC NOT NULL,
    ativo      BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS ${s}.blocked_dates (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data       TEXT NOT NULL,
    motivo     TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS ${s}.bookings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    animal_id           UUID NOT NULL REFERENCES ${s}.animals(id),
    tutor_id            UUID NOT NULL REFERENCES ${s}.tutors(id),
    data_entrada        TEXT NOT NULL,
    data_saida          TEXT NOT NULL,
    valor_diaria        NUMERIC NOT NULL,
    valor_total         NUMERIC NOT NULL,
    status_pagamento    TEXT NOT NULL DEFAULT 'pendente',
    status_presenca     TEXT NOT NULL DEFAULT 'agendado',
    servicos_adicionais JSONB NOT NULL DEFAULT '[]',
    observacoes         TEXT NOT NULL DEFAULT '',
    galeria             JSONB NOT NULL DEFAULT '[]',
    galeria_token       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS ${s}.contracts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id           UUID NOT NULL REFERENCES ${s}.bookings(id),
    token_unico          TEXT NOT NULL UNIQUE,
    status               TEXT NOT NULL DEFAULT 'gerado',
    data_geracao         TIMESTAMPTZ NOT NULL DEFAULT now(),
    data_expiracao       TIMESTAMPTZ,
    data_visualizacao    TIMESTAMPTZ,
    data_assinatura      TIMESTAMPTZ,
    assinatura_path      TEXT,
    nome_digitado        TEXT,
    aceite_termos        BOOLEAN NOT NULL DEFAULT false,
    ip_assinante         TEXT,
    user_agent           TEXT,
    hash_verificacao     TEXT UNIQUE,
    pdf_rascunho_path    TEXT,
    pdf_final_path       TEXT,
    assinatura_hotel_path TEXT,
    nome_hotel_assinante TEXT,
    data_assinatura_hotel TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

export function getAllActiveDBs(): Array<[string, DB]> {
  return [...instances.entries()];
}

export async function ensureSystemReady(): Promise<void> {
  await initSystemSchema();
}
