const express = require('express');
const path = require('path');
const router = express.Router();

const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { readDb, updateSettings, getSetting } = require('../utils/db');
const files = require('../utils/files');
const { backupDb, listBackups, restoreBackup } = require('../utils/backup');
const { logoUploader } = require('../middleware/upload');
const { adapter } = require('../utils/storage');

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many password attempts', code: 'RATE_LIMITED' },
});

const BACKUP_FNAME_RE = /^db_[\w\-]+\.json$/;

router.get('/', async (_req, res, next) => {
  try {
    const db = await readDb();
    res.json({ success: true, data: db.settings });
  } catch (err) { next(err); }
});

router.put('/', async (req, res, next) => {
  try {
    const { logo_path: _lp, onboarding_completo: _oc, ...safe } = req.body;
    const settings = await updateSettings({ ...safe, ...(req.body.onboarding_completo !== undefined ? { onboarding_completo: req.body.onboarding_completo } : {}) });
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
});

router.post('/logo', logoUploader.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded', code: 'NO_FILE' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      return res.status(400).json({ success: false, error: 'Invalid file extension', code: 'INVALID_FILE_TYPE' });
    }

    const logo_path = await files.saveFile(req.file.buffer, `uploads/logo/logo${ext}`);
    await updateSettings({ logo_path });
    res.json({ success: true, data: { logo_path } });
  } catch (err) { next(err); }
});

router.get('/logo', async (req, res, next) => {
  try {
    const db = await readDb();
    const logoPath = db.settings?.logo_path;
    if (!logoPath) return res.status(404).json({ success: false, error: 'No logo set', code: 'NOT_FOUND' });
    files.serveFile(res, logoPath);
  } catch (err) { next(err); }
});

// Backup endpoints — local adapter only
router.post('/backup', (_req, res, next) => {
  if (adapter !== 'local') return res.status(501).json({ success: false, error: 'Backup not supported for this storage adapter', code: 'NOT_SUPPORTED' });
  try {
    const fname = backupDb();
    res.json({ success: true, data: { fname } });
  } catch (err) { next(err); }
});

router.get('/backup/list', (_req, res) => {
  if (adapter !== 'local') return res.json({ success: true, data: [] });
  res.json({ success: true, data: listBackups() });
});

router.post('/backup/restore/:fname', (req, res, next) => {
  if (adapter !== 'local') return res.status(501).json({ success: false, error: 'Restore not supported for this storage adapter', code: 'NOT_SUPPORTED' });
  try {
    const fname = req.params.fname;
    if (!BACKUP_FNAME_RE.test(fname) || fname.includes('..')) {
      return res.status(400).json({ success: false, error: 'Invalid backup filename', code: 'INVALID_FILE' });
    }
    restoreBackup(fname);
    res.json({ success: true, data: { restored: fname } });
  } catch (err) {
    next(Object.assign(err, { status: 404, code: 'NOT_FOUND' }));
  }
});

router.delete('/logo', async (req, res, next) => {
  try {
    const db = await readDb();
    if (db.settings?.logo_path) await files.deleteFile(db.settings.logo_path);
    const settings = await updateSettings({ logo_path: null });
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
});

router.post('/assinatura', async (req, res, next) => {
  try {
    const { assinatura_base64, nome_representante } = req.body;

    if (!nome_representante || nome_representante.trim().length < 2) return res.status(400).json({ success: false, error: 'Nome do representante obrigatorio', code: 'NAME_REQUIRED' });
    if (!assinatura_base64) return res.status(400).json({ success: false, error: 'Assinatura obrigatoria', code: 'SIGNATURE_REQUIRED' });
    if (assinatura_base64.length > 3 * 1024 * 1024) return res.status(413).json({ success: false, error: 'Assinatura muito grande', code: 'PAYLOAD_TOO_LARGE' });
    if (!assinatura_base64.startsWith('data:image/png;base64,')) return res.status(400).json({ success: false, error: 'Formato invalido', code: 'INVALID_SIGNATURE_FORMAT' });

    const buf = Buffer.from(assinatura_base64.slice('data:image/png;base64,'.length), 'base64');
    if (buf.length < 4 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) {
      return res.status(400).json({ success: false, error: 'PNG invalido', code: 'INVALID_SIGNATURE_FORMAT' });
    }

    const assinatura_hotel_path = await files.saveFile(buf, 'uploads/signatures/hotel_sig.png');
    const settings = await updateSettings({ assinatura_hotel_path, nome_hotel_assinante: nome_representante.trim() });
    res.json({ success: true, data: { assinatura_hotel_path, nome_hotel_assinante: settings.nome_hotel_assinante } });
  } catch (err) { next(err); }
});

router.post('/password', passwordLimiter, async (req, res, next) => {
  try {
    const { senha_atual, senha_nova } = req.body;
    if (!senha_nova || senha_nova.length < 8) {
      return res.status(400).json({ success: false, error: 'Nova senha precisa ter ao menos 8 caracteres', code: 'PASSWORD_TOO_SHORT' });
    }
    const senhaHash = await getSetting('senha_hash');
    if (senhaHash) {
      if (!senha_atual) return res.status(400).json({ success: false, error: 'Senha atual obrigatória', code: 'CURRENT_PASSWORD_REQUIRED' });
      const ok = await bcrypt.compare(senha_atual, senhaHash);
      if (!ok) return res.status(401).json({ success: false, error: 'Senha atual incorreta', code: 'INVALID_PASSWORD' });
    }
    const hash = await bcrypt.hash(senha_nova, 12);
    await updateSettings({ senha_hash: hash });
    res.json({ success: true, data: { updated: true } });
  } catch (err) { next(err); }
});

router.delete('/assinatura', async (req, res, next) => {
  try {
    const db = await readDb();
    if (db.settings?.assinatura_hotel_path) {
      await files.deleteFile(db.settings.assinatura_hotel_path);
    }
    const settings = await updateSettings({ assinatura_hotel_path: null, nome_hotel_assinante: null });
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
});

module.exports = router;
