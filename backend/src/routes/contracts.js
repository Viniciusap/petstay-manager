const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const { readDb, findById, updateOne } = require('../utils/db');
const files = require('../utils/files');
const { generateHash } = require('../utils/contractHash');
const { generateContractPdf } = require('../utils/pdfGenerator');
const requireAuth = require('../middleware/requireAuth');

const MAX_SIG_BYTES = 3 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function maskIp(ip) {
  if (!ip) return '';
  // IPv4: keep first two octets only
  const v4 = ip.match(/^(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) return `${v4[1]}.x.x`;
  // IPv6: keep first 3 groups
  const v6parts = ip.split(':');
  if (v6parts.length >= 4) return v6parts.slice(0, 3).join(':') + ':xxxx';
  return ip.slice(0, 8) + '…';
}

async function getContractFull(contract, db = null) {
  if (!db) db = await readDb();
  const booking = db.bookings?.find(b => b.id === contract.booking_id) || null;
  const animal = booking ? db.animals?.find(a => a.id === booking.animal_id) || null : null;
  const tutor = booking ? db.tutors?.find(t => t.id === booking.tutor_id) || null : null;
  return { contract, booking, animal, tutor, settings: db.settings };
}

async function checkExpiry(contract) {
  if (contract.data_expiracao && new Date() > new Date(contract.data_expiracao)) {
    await updateOne('contracts', contract.id, { status: 'expirado' });
    return { expired: true };
  }
  if (contract.status === 'assinado') return { signed: true };
  if (contract.status === 'expirado') return { expired: true };
  return {};
}

function parseSigBuffer(assinatura_base64) {
  if (!assinatura_base64.startsWith('data:image/png;base64,')) return null;
  const base64Data = assinatura_base64.slice('data:image/png;base64,'.length);
  const buf = Buffer.from(base64Data, 'base64');
  if (buf.length < 4 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) return null;
  return buf;
}

// Admin: get by ID
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const db = await readDb();
    const contract = db.contracts?.find(c => c.id === req.params.id) || null;
    if (!contract) return res.status(404).json({ success: false, error: 'Contract not found', code: 'NOT_FOUND' });
    res.json({ success: true, data: await getContractFull(contract, db) });
  } catch (err) { next(err); }
});

// Public: get by token
router.get('/token/:token', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.token)) {
      return res.status(400).json({ success: false, error: 'Invalid token format', code: 'INVALID_TOKEN' });
    }
    const db = await readDb();
    const contract = db.contracts.find(c => c.token_unico === req.params.token);
    if (!contract) return res.status(404).json({ success: false, error: 'Invalid token', code: 'INVALID_TOKEN' });

    const state = await checkExpiry(contract);
    if (state.expired) return res.json({ success: false, error: 'Contract expired', code: 'TOKEN_EXPIRED' });
    if (state.signed) return res.json({ success: false, error: 'Contract already signed', code: 'ALREADY_SIGNED' });

    if (contract.status === 'gerado') {
      await updateOne('contracts', contract.id, { status: 'visualizado', data_visualizacao: new Date().toISOString() });
    }

    res.json({ success: true, data: await getContractFull(contract, db) });
  } catch (err) { next(err); }
});

const signBodyParser = express.json({ limit: '4mb' });

// Public: sign contract
router.post('/sign/:token', signBodyParser, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.token)) {
      return res.status(400).json({ success: false, error: 'Invalid token format', code: 'INVALID_TOKEN' });
    }
    const db = await readDb();
    const contract = db.contracts.find(c => c.token_unico === req.params.token);
    if (!contract) return res.status(404).json({ success: false, error: 'Invalid token', code: 'INVALID_TOKEN' });

    const state = await checkExpiry(contract);
    if (state.expired) return res.status(410).json({ success: false, error: 'Contract expired', code: 'TOKEN_EXPIRED' });
    if (state.signed) return res.status(409).json({ success: false, error: 'Contract already signed', code: 'ALREADY_SIGNED' });

    const { assinatura_base64, nome_digitado, aceite_termos } = req.body;

    if (!aceite_termos) return res.status(400).json({ success: false, error: 'Terms not accepted', code: 'TERMS_NOT_ACCEPTED' });
    if (!nome_digitado || nome_digitado.trim().length < 3) return res.status(400).json({ success: false, error: 'Name required (min 3 chars)', code: 'NAME_REQUIRED' });
    if (!assinatura_base64) return res.status(400).json({ success: false, error: 'Signature required', code: 'SIGNATURE_REQUIRED' });
    if (assinatura_base64.length > MAX_SIG_BYTES) return res.status(413).json({ success: false, error: 'Signature file too large', code: 'PAYLOAD_TOO_LARGE' });

    const sigBuffer = parseSigBuffer(assinatura_base64);
    if (!sigBuffer) return res.status(400).json({ success: false, error: 'Invalid PNG signature', code: 'INVALID_SIGNATURE_FORMAT' });

    const sigFilename = `contrato_${contract.id}_sig.png`;
    const savedSigPath = await files.saveFile(sigBuffer, `uploads/signatures/${sigFilename}`);

    const rawIp = req.ip || req.socket.remoteAddress || '';
    const timestamp = new Date().toISOString();
    const hash = generateHash(contract.token_unico, nome_digitado.trim(), timestamp);

    await updateOne('contracts', contract.id, {
      status: 'assinado',
      data_assinatura: timestamp,
      assinatura_path: savedSigPath,
      nome_digitado: nome_digitado.trim(),
      aceite_termos: true,
      ip_assinante: maskIp(rawIp),
      hash_verificacao: hash,
    });

    const pdfPath = await generateContractPdf(contract.id, 'final');
    res.json({ success: true, data: { hash, pdf_path: pdfPath } });
  } catch (err) { next(err); }
});

// Admin: resend (regenerate token)
router.post('/:id/resend', requireAuth, async (req, res, next) => {
  try {
    const contract = await findById('contracts', req.params.id);
    if (!contract) return res.status(404).json({ success: false, error: 'Contract not found', code: 'NOT_FOUND' });
    if (contract.status === 'assinado') return res.status(409).json({ success: false, error: 'Contract already signed', code: 'ALREADY_SIGNED' });

    const db = await readDb();
    const validadeHoras = db.settings.contrato_validade_horas;
    const dataExpiracao = validadeHoras ? new Date(Date.now() + validadeHoras * 3_600_000).toISOString() : null;

    const updated = await updateOne('contracts', req.params.id, {
      token_unico: uuidv4(),
      status: 'gerado',
      data_geracao: new Date().toISOString(),
      data_expiracao: dataExpiracao,
      data_visualizacao: null,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// Admin: hotel owner signs the contract
router.post('/:id/sign-hotel', requireAuth, async (req, res, next) => {
  try {
    const contract = await findById('contracts', req.params.id);
    if (!contract) return res.status(404).json({ success: false, error: 'Contract not found', code: 'NOT_FOUND' });

    const { assinatura_base64, nome_assinante } = req.body;
    if (!assinatura_base64) return res.status(400).json({ success: false, error: 'Signature required', code: 'SIGNATURE_REQUIRED' });
    if (!nome_assinante || nome_assinante.trim().length < 2) return res.status(400).json({ success: false, error: 'Name required', code: 'NAME_REQUIRED' });
    if (assinatura_base64.length > MAX_SIG_BYTES) return res.status(413).json({ success: false, error: 'Signature too large', code: 'PAYLOAD_TOO_LARGE' });

    const sigBuffer = parseSigBuffer(assinatura_base64);
    if (!sigBuffer) return res.status(400).json({ success: false, error: 'Invalid PNG', code: 'INVALID_SIGNATURE_FORMAT' });

    const sigFilename = `contrato_${contract.id}_hotel_sig.png`;
    const savedSigPath = await files.saveFile(sigBuffer, `uploads/signatures/${sigFilename}`);

    const updated = await updateOne('contracts', contract.id, {
      assinatura_hotel_path: savedSigPath,
      nome_hotel_assinante: nome_assinante.trim(),
      data_assinatura_hotel: new Date().toISOString(),
    });

    if (contract.status === 'assinado') await generateContractPdf(contract.id, 'final');

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// Admin: download draft PDF
router.get('/:id/pdf/rascunho', requireAuth, async (req, res, next) => {
  try {
    const contract = await findById('contracts', req.params.id);
    if (!contract) return res.status(404).json({ success: false, error: 'Contract not found', code: 'NOT_FOUND' });

    const pdfPath = (await files.fileExists(contract.pdf_rascunho_path))
      ? contract.pdf_rascunho_path
      : await generateContractPdf(req.params.id, 'rascunho');

    files.serveFile(res, pdfPath, `contrato_${req.params.id}_rascunho.pdf`);
  } catch (err) { next(err); }
});

// Admin only: download final PDF
router.get('/:id/pdf/final', requireAuth, async (req, res, next) => {
  try {
    const contract = await findById('contracts', req.params.id);
    if (!contract) return res.status(404).json({ success: false, error: 'Contract not found', code: 'NOT_FOUND' });
    if (contract.status !== 'assinado') return res.status(400).json({ success: false, error: 'Contract not signed yet', code: 'NOT_SIGNED' });

    const pdfPath = (await files.fileExists(contract.pdf_final_path))
      ? contract.pdf_final_path
      : await generateContractPdf(req.params.id, 'final');

    files.serveFile(res, pdfPath, `contrato_${req.params.id}_final.pdf`);
  } catch (err) { next(err); }
});

// Public: client downloads their signed PDF using their signing token
router.get('/pdf/by-token/:token', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.token)) {
      return res.status(400).json({ success: false, error: 'Invalid token format', code: 'INVALID_TOKEN' });
    }
    const db = await readDb();
    const contract = db.contracts.find(c => c.token_unico === req.params.token);
    if (!contract) return res.status(404).json({ success: false, error: 'Contract not found', code: 'NOT_FOUND' });
    if (contract.status !== 'assinado') return res.status(400).json({ success: false, error: 'Contract not signed yet', code: 'NOT_SIGNED' });

    const pdfPath = (await files.fileExists(contract.pdf_final_path))
      ? contract.pdf_final_path
      : await generateContractPdf(contract.id, 'final');

    files.serveFile(res, pdfPath, `contrato_assinado.pdf`);
  } catch (err) { next(err); }
});

// Public: verify authenticity by hash
router.get('/verify/:hash', async (req, res, next) => {
  try {
    const db = await readDb();
    if (!/^[a-f0-9]{64}$/.test(req.params.hash)) {
      return res.json({ success: true, data: { valid: false } });
    }
    const contract = db.contracts.find(c => c.hash_verificacao === req.params.hash);
    if (!contract) return res.json({ success: true, data: { valid: false } });

    const booking = await findById('bookings', contract.booking_id);
    const animal = booking ? await findById('animals', booking.animal_id) : null;

    res.json({
      success: true,
      data: {
        valid: true,
        estabelecimento: db.settings.nome_estabelecimento,
        pet: animal?.nome || '—',
        assinado_por: contract.nome_digitado,
        signed_at: contract.data_assinatura,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
