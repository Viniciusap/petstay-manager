const express = require('express');
const path = require('path');
const router = express.Router();

const { getCollection, findById, insertOne, updateOne, deleteOne, findWhere } = require('../utils/db');
const files = require('../utils/files');
const { requireFields } = require('../middleware/validate');
const { vaccinaUploader, photoUploader } = require('../middleware/upload');

function sanitizeFilename(fname) {
  if (!fname || /[/\\]/.test(fname) || fname.includes('..')) {
    throw Object.assign(new Error('Invalid filename'), { status: 400, code: 'INVALID_FILE' });
  }
  return fname;
}

router.get('/', async (req, res, next) => {
  try {
    let animals = await getCollection('animals');
    if (req.query.tutor_id) animals = animals.filter(a => a.tutor_id === req.query.tutor_id);
    res.json({ success: true, data: animals, total: animals.length });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const animal = await findById('animals', req.params.id);
    if (!animal) return res.status(404).json({ success: false, error: 'Animal not found', code: 'NOT_FOUND' });
    const bookings = await findWhere('bookings', { animal_id: animal.id });
    res.json({ success: true, data: { ...animal, bookings } });
  } catch (err) { next(err); }
});

router.post('/', requireFields(['tutor_id', 'nome', 'especie']), async (req, res, next) => {
  try {
    const animal = await insertOne('animals', {
      tutor_id: req.body.tutor_id,
      nome: req.body.nome,
      especie: req.body.especie,
      raca: req.body.raca || '',
      idade: req.body.idade || 0,
      peso: req.body.peso || 0,
      saude: req.body.saude || { vacinas: [], alergias: [], observacoes: '' },
      preferencias: req.body.preferencias || { alimentacao: '', comportamento: '' },
      arquivos_vacinacao: [],
    });
    res.status(201).json({ success: true, data: animal });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    // Block fields managed by dedicated endpoints
    const { id: _id, created_at: _ca, foto_path: _fp, arquivos_vacinacao: _av, ...safe } = req.body;
    const animal = await updateOne('animals', req.params.id, safe);
    if (!animal) return res.status(404).json({ success: false, error: 'Animal not found', code: 'NOT_FOUND' });
    res.json({ success: true, data: animal });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const activeBookings = (await findWhere('bookings', { animal_id: req.params.id }))
      .filter(b => !['cancelado', 'check-out'].includes(b.status_presenca));
    if (activeBookings.length > 0) {
      return res.status(409).json({ success: false, error: 'Animal has active bookings', code: 'HAS_ACTIVE_BOOKINGS' });
    }
    const deleted = await deleteOne('animals', req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Animal not found', code: 'NOT_FOUND' });
    res.json({ success: true, data: { deleted: true } });
  } catch (err) { next(err); }
});

router.post('/:id/vacina', (req, res, next) => {
  vaccinaUploader.single('file')(req, res, async err => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded', code: 'NO_FILE' });

    try {
      const ext = path.extname(req.file.originalname);
      const destRelPath = `uploads/animal_${req.params.id}/${Date.now()}${ext}`;
      const savedPath = await files.saveFile(req.file.buffer, destRelPath);

      const animal = await findById('animals', req.params.id);
      if (!animal) return res.status(404).json({ success: false, error: 'Animal not found', code: 'NOT_FOUND' });

      const updated = await updateOne('animals', req.params.id, {
        arquivos_vacinacao: [...(animal.arquivos_vacinacao || []), savedPath],
      });
      res.json({ success: true, data: updated });
    } catch (e) { next(e); }
  });
});

router.delete('/:id/vacina/:fname', async (req, res, next) => {
  try {
    sanitizeFilename(req.params.fname);

    const animal = await findById('animals', req.params.id);
    if (!animal) return res.status(404).json({ success: false, error: 'Animal not found', code: 'NOT_FOUND' });

    // Find the stored path by filename suffix (works for both local relative paths and Blob URLs)
    const storedPath = (animal.arquivos_vacinacao || []).find(p =>
      p === `uploads/animal_${req.params.id}/${req.params.fname}` ||
      p.endsWith(`/${req.params.fname}`)
    );

    if (storedPath) await files.deleteFile(storedPath);

    const updated = await updateOne('animals', req.params.id, {
      arquivos_vacinacao: (animal.arquivos_vacinacao || []).filter(p => p !== storedPath),
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// Profile photo
router.post('/:id/foto', (req, res, next) => {
  photoUploader.single('foto')(req, res, async err => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ success: false, error: 'No file', code: 'NO_FILE' });
    try {
      const animal = await findById('animals', req.params.id);
      if (!animal) return res.status(404).json({ success: false, error: 'Animal not found', code: 'NOT_FOUND' });

      // Delete old photo if exists
      if (animal.foto_path) await files.deleteFile(animal.foto_path).catch(() => {});

      const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
      const savedPath = await files.saveFile(req.file.buffer, `uploads/animal_${req.params.id}/foto${ext}`);
      const updated = await updateOne('animals', req.params.id, { foto_path: savedPath });
      res.json({ success: true, data: updated });
    } catch (e) { next(e); }
  });
});

router.delete('/:id/foto', async (req, res, next) => {
  try {
    const animal = await findById('animals', req.params.id);
    if (!animal) return res.status(404).json({ success: false, error: 'Animal not found', code: 'NOT_FOUND' });
    if (animal.foto_path) await files.deleteFile(animal.foto_path).catch(() => {});
    const updated = await updateOne('animals', req.params.id, { foto_path: null });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

module.exports = router;
