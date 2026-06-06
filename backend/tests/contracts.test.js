const os = require('os');
const path = require('path');
const fs = require('fs');
const request = require('supertest');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'petstay-test-contracts-'));
let app, agent;
let activeContractToken, activeContractId;
let expiredContractToken;
let signedHash;

// Minimal valid 1×1 transparent PNG
const VALID_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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

  // First login creates password and authenticates the agent
  const loginRes = await agent.post('/api/auth/login').send({ senha: 'password123' });
  if (loginRes.status !== 200) throw new Error(`Login failed: ${JSON.stringify(loginRes.body)}`);

  const futureEntry = new Date(Date.now() + 86400000).toISOString();
  const futureExit = new Date(Date.now() + 172800000).toISOString();

  // Seed: tutor + animal
  const tutorRes = await agent.post('/api/tutors').send({ nome: 'Test Tutor', telefone: '11999999999' });
  const tutorId = tutorRes.body.data.id;

  const animalRes = await agent.post('/api/animals').send({ nome: 'Rex', especie: 'cachorro', tutor_id: tutorId });
  const animalId = animalRes.body.data.id;

  // Booking 1 — active contract
  const b1Res = await agent.post('/api/bookings')
    .send({ tutor_id: tutorId, animal_id: animalId, data_entrada: futureEntry, data_saida: futureExit });
  const b1Detail = await agent.get(`/api/bookings/${b1Res.body.data.booking.id}`);
  activeContractToken = b1Detail.body.data.contract.token_unico;
  activeContractId = b1Detail.body.data.contract.id;

  // Booking 2 — will be expired manually
  const b2Res = await agent.post('/api/bookings')
    .send({ tutor_id: tutorId, animal_id: animalId, data_entrada: futureEntry, data_saida: futureExit });
  const b2Detail = await agent.get(`/api/bookings/${b2Res.body.data.booking.id}`);
  expiredContractToken = b2Detail.body.data.contract.token_unico;
  const expiredContractId = b2Detail.body.data.contract.id;

  // Set contract 2 expiration to the past
  const { updateOne } = require('../src/adapters/local/db');
  await updateOne('contracts', expiredContractId, {
    data_expiracao: new Date(Date.now() - 86400000).toISOString(),
  });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /api/contracts/sign/:token', () => {
  it('400 — missing signature PNG', async () => {
    const res = await request(app)
      .post(`/api/contracts/sign/${activeContractToken}`)
      .send({ nome_digitado: 'Test User', aceite_termos: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SIGNATURE_REQUIRED');
  });

  it('400 — nome_digitado too short', async () => {
    const res = await request(app)
      .post(`/api/contracts/sign/${activeContractToken}`)
      .send({ nome_digitado: 'AB', aceite_termos: true, assinatura_base64: VALID_PNG });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NAME_REQUIRED');
  });

  it('400 — invalid token format (not UUID v4)', async () => {
    const res = await request(app)
      .post('/api/contracts/sign/not-a-valid-uuid')
      .send({ nome_digitado: 'Test User', aceite_termos: true, assinatura_base64: VALID_PNG });
    expect(res.status).toBe(400);
  });

  it('410 — expired contract', async () => {
    const res = await request(app)
      .post(`/api/contracts/sign/${expiredContractToken}`)
      .send({ nome_digitado: 'Test User', aceite_termos: true, assinatura_base64: VALID_PNG });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('200 — signs successfully, returns 64-char SHA-256 hash', async () => {
    const res = await request(app)
      .post(`/api/contracts/sign/${activeContractToken}`)
      .send({ nome_digitado: 'Test User', aceite_termos: true, assinatura_base64: VALID_PNG });
    expect(res.status).toBe(200);
    expect(res.body.data.hash).toHaveLength(64);
    signedHash = res.body.data.hash;
  });

  it('409 — already signed', async () => {
    const res = await request(app)
      .post(`/api/contracts/sign/${activeContractToken}`)
      .send({ nome_digitado: 'Test User', aceite_termos: true, assinatura_base64: VALID_PNG });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_SIGNED');
  });
});

describe('GET /api/contracts/verify/:hash', () => {
  it('200 — valid hash returns valid: true', async () => {
    const res = await request(app).get(`/api/contracts/verify/${signedHash}`);
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.assinado_por).toBe('Test User');
  });

  it('200 — unknown hash returns valid: false', async () => {
    const fakeHash = '0'.repeat(64);
    const res = await request(app).get(`/api/contracts/verify/${fakeHash}`);
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
  });
});
