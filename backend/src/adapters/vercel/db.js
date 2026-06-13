const { db } = require('@vercel/postgres');
const { v4: uuidv4 } = require('uuid');

const COLLECTIONS = ['tutors', 'animals', 'bookings', 'contracts', 'services', 'blocked_dates'];
const VALID = new Set(COLLECTIONS);

function col(name) {
  if (!VALID.has(name)) throw Object.assign(new Error(`Invalid collection: "${name}"`), { status: 400 });
  return name;
}

function flatRow(row) {
  return { id: row.id, created_at: row.created_at, ...row.data };
}

async function ensureDb() {
  for (const table of COLLECTIONS) {
    await db.query(
      `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}')`
    );
  }
  await db.query(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL DEFAULT '{}')`);
  await db.query(`CREATE TABLE IF NOT EXISTS app_meta (id INTEGER PRIMARY KEY DEFAULT 1, version TEXT NOT NULL DEFAULT '0.0.0')`);
  await db.query(`INSERT INTO app_settings (key, value) VALUES ('settings', '{}') ON CONFLICT (key) DO NOTHING`);
  await db.query(`INSERT INTO app_meta (id, version) VALUES (1, '0.0.0') ON CONFLICT (id) DO NOTHING`);
}

async function readDb() {
  const results = await Promise.all([
    ...COLLECTIONS.map(t => db.query(`SELECT id, created_at, data FROM ${t} ORDER BY created_at`)),
    db.query(`SELECT value FROM app_settings WHERE key = 'settings'`),
    db.query(`SELECT version FROM app_meta WHERE id = 1`),
  ]);

  const obj = { version: results[results.length - 1].rows[0]?.version || '0.0.0', settings: results[results.length - 2].rows[0]?.value || {} };
  COLLECTIONS.forEach((name, i) => { obj[name] = results[i].rows.map(flatRow); });
  return obj;
}

async function writeDb(data) {
  for (const name of COLLECTIONS) {
    if (!data[name]) continue;
    for (const item of data[name]) {
      const { id, created_at, ...rest } = item;
      await db.query(
        `INSERT INTO ${name} (id, created_at, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET data = $3`,
        [id, created_at, JSON.stringify(rest)]
      );
    }
  }
  if (data.settings) {
    await db.query(`UPDATE app_settings SET value = $1 WHERE key = 'settings'`, [JSON.stringify(data.settings)]);
  }
  if (data.version) {
    await db.query(`UPDATE app_meta SET version = $1 WHERE id = 1`, [data.version]);
  }
}

async function getCollection(name) {
  const result = await db.query(`SELECT id, created_at, data FROM ${col(name)} ORDER BY created_at`);
  return result.rows.map(flatRow);
}

async function insertOne(collection, item) {
  col(collection);
  const { id: _id, created_at: _ca, ...rest } = item;
  const id = uuidv4();
  const created_at = new Date().toISOString();
  await db.query(
    `INSERT INTO ${collection} (id, created_at, data) VALUES ($1, $2, $3)`,
    [id, created_at, JSON.stringify(rest)]
  );
  return { id, created_at, ...rest };
}

async function updateOne(collection, id, patch) {
  col(collection);
  const existing = await db.query(`SELECT id, created_at, data FROM ${collection} WHERE id = $1`, [id]);
  if (!existing.rows.length) return null;
  const row = existing.rows[0];
  const updated = { ...row.data, ...patch };
  await db.query(`UPDATE ${collection} SET data = $1 WHERE id = $2`, [JSON.stringify(updated), id]);
  return { id: row.id, created_at: row.created_at, ...updated };
}

async function deleteOne(collection, id) {
  col(collection);
  const result = await db.query(`DELETE FROM ${collection} WHERE id = $1`, [id]);
  return result.rowCount > 0;
}

async function findById(collection, id) {
  col(collection);
  const result = await db.query(`SELECT id, created_at, data FROM ${collection} WHERE id = $1`, [id]);
  return result.rows.length ? flatRow(result.rows[0]) : null;
}

async function findWhere(collection, filters) {
  col(collection);
  const entries = Object.entries(filters);
  if (entries.length === 0) return getCollection(collection);

  for (const [k] of entries) {
    if (!/^[a-z_][a-z0-9_]*$/.test(k)) throw new Error(`Invalid filter key: "${k}"`);
  }

  const conditions = entries.map(([k], i) => `data->>'${k}' = $${i + 1}`);
  const values = entries.map(([, v]) => String(v));

  const result = await db.query(
    `SELECT id, created_at, data FROM ${collection} WHERE ${conditions.join(' AND ')} ORDER BY created_at`,
    values
  );
  return result.rows.map(flatRow);
}

async function getSetting(key) {
  const result = await db.query(`SELECT value FROM app_settings WHERE key = 'settings'`);
  return result.rows[0]?.value?.[key];
}

async function updateSettings(data) {
  const result = await db.query(`SELECT value FROM app_settings WHERE key = 'settings'`);
  const current = result.rows[0]?.value || {};
  const updated = { ...current, ...data };
  await db.query(`UPDATE app_settings SET value = $1 WHERE key = 'settings'`, [JSON.stringify(updated)]);
  return updated;
}

// Local-only stubs (not applicable for Vercel but keep interface compatible)
const DATA_DIR = null;
const DB_PATH = null;
function assertInsideDataDir() {}

module.exports = {
  DATA_DIR, DB_PATH,
  ensureDb, readDb, writeDb,
  getCollection, insertOne, updateOne, deleteOne,
  findById, findWhere,
  getSetting, updateSettings,
  assertInsideDataDir,
};
