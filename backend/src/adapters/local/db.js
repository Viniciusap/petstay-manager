const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../../data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  version: '0.0.0',
  settings: {},
  tutors: [],
  animals: [],
  bookings: [],
  contracts: [],
  services: [],
  blocked_dates: [],
};

let writeQueue = Promise.resolve();

function enqueue(fn) {
  writeQueue = writeQueue.then(fn).catch(err => {
    console.error('[db queue error]', err.message);
    throw err;
  });
  return writeQueue;
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  ['uploads', 'uploads/logo', 'uploads/signatures', 'pdfs', 'backups'].forEach(sub => {
    const dir = path.join(DATA_DIR, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
  }
}

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (err) {
    throw Object.assign(
      new Error('Database file is missing or corrupted. Restore a backup from /api/settings/backup/list.'),
      { status: 503, code: 'DB_CORRUPTED' }
    );
  }
}

function _write(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function writeDb(data) {
  return enqueue(() => _write(data));
}

function getCollection(name) {
  return readDb()[name] || [];
}

function insertOne(collection, item) {
  return enqueue(() => {
    const db = readDb();
    const record = { id: uuidv4(), created_at: new Date().toISOString(), ...item };
    db[collection] = [...(db[collection] || []), record];
    _write(db);
    return record;
  });
}

function updateOne(collection, id, data) {
  return enqueue(() => {
    const db = readDb();
    const idx = db[collection]?.findIndex(r => r.id === id) ?? -1;
    if (idx === -1) return null;
    db[collection][idx] = { ...db[collection][idx], ...data };
    _write(db);
    return db[collection][idx];
  });
}

function deleteOne(collection, id) {
  return enqueue(() => {
    const db = readDb();
    const idx = db[collection]?.findIndex(r => r.id === id) ?? -1;
    if (idx === -1) return false;
    db[collection].splice(idx, 1);
    _write(db);
    return true;
  });
}

function findById(collection, id) {
  return readDb()[collection]?.find(r => r.id === id) || null;
}

function findWhere(collection, filters) {
  return readDb()[collection]?.filter(r =>
    Object.entries(filters).every(([k, v]) => r[k] === v)
  ) || [];
}

function getSetting(key) {
  return readDb().settings?.[key];
}

function updateSettings(data) {
  return enqueue(() => {
    const db = readDb();
    db.settings = { ...db.settings, ...data };
    _write(db);
    return db.settings;
  });
}

function assertInsideDataDir(resolvedPath) {
  const rel = path.relative(DATA_DIR, resolvedPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw Object.assign(new Error('Path traversal detected'), { status: 400, code: 'INVALID_PATH' });
  }
}

module.exports = {
  DATA_DIR,
  DB_PATH,
  ensureDb,
  readDb,
  writeDb,
  getCollection,
  insertOne,
  updateOne,
  deleteOne,
  findById,
  findWhere,
  getSetting,
  updateSettings,
  assertInsideDataDir,
};
