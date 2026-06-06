const os = require('os');
const path = require('path');
const fs = require('fs');
const request = require('supertest');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'petstay-test-auth-'));
let app;

beforeAll(async () => {
  process.env.DATA_DIR = tmpDir;
  process.env.JWT_SECRET = 'test-secret-min-16-chars-long!';
  process.env.NODE_ENV = 'test';
  process.env.STORAGE_ADAPTER = 'local';

  const { createApp } = require('../src/index');
  app = await createApp();

  // Re-set after createApp — dotenv.config() inside index.js may have overridden .env values
  process.env.JWT_SECRET = 'test-secret-min-16-chars-long!';
  process.env.SETUP_TOKEN = 'my-setup-token';
});

afterAll(() => {
  delete process.env.SETUP_TOKEN;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SETUP_TOKEN — first login enforcement', () => {
  it('rejects first login without setup_token', async () => {
    const res = await request(app).post('/api/auth/login').send({ senha: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_SETUP_TOKEN');
  });

  it('rejects first login with wrong setup_token', async () => {
    const res = await request(app).post('/api/auth/login').send({ senha: 'password123', setup_token: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('accepts first login with correct setup_token, sets HttpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ senha: 'password123', setup_token: 'my-setup-token' });
    expect(res.status).toBe(200);
    expect(res.body.data.firstLogin).toBe(true);
    expect(res.body.data.token).toBeUndefined();
    const cookieStr = (res.headers['set-cookie'] || []).join('');
    expect(cookieStr).toContain('petstay_token=');
    expect(cookieStr).toContain('HttpOnly');
    delete process.env.SETUP_TOKEN;
  });
});

describe('POST /api/auth/login — password established', () => {
  it('rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ senha: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_PASSWORD');
  });

  it('accepts correct password, no token in response body', async () => {
    const res = await request(app).post('/api/auth/login').send({ senha: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.data.firstLogin).toBe(false);
    expect(res.body.data.expiresAt).toBeDefined();
    expect(res.body.data.token).toBeUndefined();
  });

  it('rejects empty body', async () => {
    await request(app).post('/api/auth/login').send({}).expect(400);
  });
});

describe('GET /api/auth/me + session management', () => {
  function extractToken(res) {
    const setCookie = res.headers['set-cookie'] || [];
    const pair = setCookie.map(c => c.split(';')[0]).find(c => c.startsWith('petstay_token='));
    return pair ? pair.slice('petstay_token='.length) : null;
  }

  it('returns authenticated: false without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.body.data.authenticated).toBe(false);
  });

  it('login sets httpOnly cookie', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ senha: 'password123' });
    expect(loginRes.status).toBe(200);
    const cookieStr = (loginRes.headers['set-cookie'] || []).join('');
    expect(cookieStr).toContain('petstay_token=');
    expect(cookieStr).toContain('HttpOnly');
  });

  it('returns authenticated: true via cookie, false without, revoked after logout', async () => {
    const agent2 = request.agent(app);
    const loginRes = await agent2.post('/api/auth/login').send({ senha: 'password123' });
    expect(loginRes.status).toBe(200);

    // Cookie must authenticate /me
    const meAuth = await agent2.get('/api/auth/me');
    expect(meAuth.body.data.authenticated).toBe(true);
    expect(meAuth.body.data.expiresAt).toBeDefined();

    // No cookie: not authenticated
    const noAuth = await request(app).get('/api/auth/me');
    expect(noAuth.body.data.authenticated).toBe(false);

    // Logout revokes token
    await agent2.post('/api/auth/logout').expect(200);
    const afterLogout = await agent2.get('/api/auth/me');
    expect(afterLogout.body.data.authenticated).toBe(false);
  });

  it('logout response clears the cookie', async () => {
    const agent2 = request.agent(app);
    await agent2.post('/api/auth/login').send({ senha: 'password123' });
    const logoutRes = await agent2.post('/api/auth/logout');
    const clearCookie = (logoutRes.headers['set-cookie'] || []).join('');
    expect(clearCookie).toMatch(/petstay_token=;|petstay_token=(?:;| Max-Age=0)/);
  });

  it('revokes session on logout — same token no longer valid', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ senha: 'password123' });
    const token = extractToken(loginRes);

    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(200);

    const afterLogout = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(afterLogout.body.data.authenticated).toBe(false);
  });

  it('logout response clears the cookie', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ senha: 'password123' });
    const token = extractToken(loginRes);

    const logoutRes = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    const clearCookie = (logoutRes.headers['set-cookie'] || []).join('');
    expect(clearCookie).toMatch(/petstay_token=;|petstay_token=(?:;| Max-Age=0)/);
  });
});
