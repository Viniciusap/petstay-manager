const { readDb, writeDb } = require('../utils/db');
const { backupDb } = require('../utils/backup');
const { adapter } = require('../utils/storage');

const APP_VERSION = '1.0.1';

function isVersionGreater(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
}

async function runMigrations() {
  const db = await readDb();
  const dbVersion = db.version || '0.0.0';

  if (dbVersion === APP_VERSION) return;

  if (adapter === 'local') {
    console.log(`Backing up before migration...`);
    backupDb(`pre_migration_${dbVersion}_to_${APP_VERSION}`);
  }

  console.log(`Migrating db: ${dbVersion} → ${APP_VERSION}`);

  const migrations = [
    { version: '1.0.0', run: require('./v1.0.0') },
    { version: '1.0.1', run: require('./v1.0.1') },
  ];

  for (const migration of migrations) {
    if (isVersionGreater(migration.version, dbVersion)) {
      await migration.run(readDb, writeDb);
      const current = await readDb();
      await writeDb({ ...current, version: migration.version });
      console.log(`Migration ${migration.version} done`);
    }
  }
}

module.exports = { runMigrations, APP_VERSION };
