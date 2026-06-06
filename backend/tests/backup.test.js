const os = require('os');
const path = require('path');
const fs = require('fs');
const request = require('supertest');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'petstay-test-backup-'));
let app, agent;

beforeAll(async () => {
  process.env.DATA_DIR = tmpDir;
  process.env.JWT_SECRET = 'test-secret-min-16-chars-long!';
  process.env.NODE_ENV = 'test';
  process.env.STORAGE_ADAPTER = 'local';

  const { createApp } = require('../src/index');
  app = await createApp();

  // Re-set after createApp — dotenv.config() inside index.js may have overridden .env values
  process.env.JWT_SECRET = 'test-secret-min-16-chars-long!';
  delete process.env.SETUP_TOKEN;

  agent = request.agent(app);
  const loginRes = await agent.post('/api/auth/login').send({ senha: 'password123' });
  if (loginRes.status !== 200) throw new Error(`Login failed: ${JSON.stringify(loginRes.body)}`);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /api/settings/backup', () => {
  it('creates a backup file', async () => {
    const res = await agent.post('/api/settings/backup');
    expect(res.status).toBe(200);
    expect(res.body.data.fname).toMatch(/\.json$/);
  });

  it('requires authentication', async () => {
    await request(app).post('/api/settings/backup').expect(401);
  });
});

describe('GET /api/settings/backup/list', () => {
  it('returns array with at least one backup', async () => {
    const res = await agent.get('/api/settings/backup/list');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('fname');
    expect(res.body.data[0]).toHaveProperty('size');
  });
});

describe('POST /api/settings/backup/restore/:fname', () => {
  let backupFname;

  beforeAll(async () => {
    const res = await agent.post('/api/settings/backup');
    backupFname = res.body.data.fname;
  });

  it('restores a valid backup', async () => {
    const res = await agent.post(`/api/settings/backup/restore/${encodeURIComponent(backupFname)}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns error for non-existent backup', async () => {
    const res = await agent.post('/api/settings/backup/restore/nonexistent.json');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('blocks path traversal via encoded slashes', async () => {
    const res = await agent.post('/api/settings/backup/restore/..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE');
  });
});

describe('restoreBackup utility — path traversal', () => {
  it('throws INVALID_PATH when fname escapes DATA_DIR', () => {
    const { restoreBackup } = require('../src/utils/backup');
    let thrown;
    try { restoreBackup('../../etc/passwd'); } catch (e) { thrown = e; }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('INVALID_PATH');
  });
});
