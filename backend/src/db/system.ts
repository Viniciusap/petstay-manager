import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pgSchema, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';

const SYSTEM_SCHEMA = '_system';

const systemSql = postgres(process.env['POSTGRES_URL']!, {
  max: 2,
  onnotice: () => {},
  connection: { search_path: SYSTEM_SCHEMA },
});

const _systemSchema = pgSchema(SYSTEM_SCHEMA);

const tenantsTable = _systemSchema.table('tenants', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const systemDb = drizzle(systemSql, { schema: { tenants: tenantsTable } });

export type TenantRow = typeof tenantsTable.$inferSelect;

let initialized = false;

export async function initSystemSchema(): Promise<void> {
  if (initialized) return;
  const adminSql = postgres(process.env['POSTGRES_URL']!, { max: 1, onnotice: () => {} });
  try {
    await adminSql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${SYSTEM_SCHEMA}`);
    await adminSql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${SYSTEM_SCHEMA}.tenants (
        slug        TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        active      BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  } finally {
    await adminSql.end();
  }
  initialized = true;
}

export async function listTenants(): Promise<TenantRow[]> {
  return systemDb.select().from(tenantsTable).orderBy(tenantsTable.created_at);
}

export async function getTenant(slug: string): Promise<TenantRow | null> {
  const [row] = await systemDb.select().from(tenantsTable).where(eq(tenantsTable.slug, slug));
  return row ?? null;
}

export async function createTenant(slug: string, name: string): Promise<TenantRow> {
  const [row] = await systemDb.insert(tenantsTable).values({ slug, name }).returning();
  return row!;
}

export async function setTenantActive(slug: string, active: boolean): Promise<void> {
  await systemDb.update(tenantsTable).set({ active }).where(eq(tenantsTable.slug, slug));
}
