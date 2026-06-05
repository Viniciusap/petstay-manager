const express = require('express');
const router = express.Router();
const { getCollection, findById, insertOne, updateOne, deleteOne, findWhere } = require('../utils/db');
const { requireFields } = require('../middleware/validate');

router.get('/', async (req, res, next) => {
  try {
    let tutors = await getCollection('tutors');
    if (req.query.q) {
      const q = req.query.q.toLowerCase();
      tutors = tutors.filter(t => t.nome?.toLowerCase().includes(q) || t.telefone?.includes(q));
    }
    res.json({ success: true, data: tutors, total: tutors.length });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const tutor = await findById('tutors', req.params.id);
    if (!tutor) return res.status(404).json({ success: false, error: 'Tutor not found', code: 'NOT_FOUND' });
    const animals = await findWhere('animals', { tutor_id: tutor.id });
    res.json({ success: true, data: { ...tutor, animals } });
  } catch (err) { next(err); }
});

router.post('/', requireFields(['nome', 'telefone']), async (req, res, next) => {
  try {
    const tutor = await insertOne('tutors', {
      nome: req.body.nome,
      telefone: req.body.telefone,
      email: req.body.email || '',
      endereco: req.body.endereco || '',
      tipo: req.body.tipo || 'primario',
    });
    res.status(201).json({ success: true, data: tutor });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id: _id, created_at: _ca, ...safe } = req.body;
    const tutor = await updateOne('tutors', req.params.id, safe);
    if (!tutor) return res.status(404).json({ success: false, error: 'Tutor not found', code: 'NOT_FOUND' });
    res.json({ success: true, data: tutor });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const activeBookings = (await findWhere('bookings', { tutor_id: req.params.id }))
      .filter(b => !['cancelado', 'check-out'].includes(b.status_presenca));
    if (activeBookings.length > 0) {
      return res.status(409).json({ success: false, error: 'Tutor has active bookings', code: 'HAS_ACTIVE_BOOKINGS' });
    }
    const animals = await findWhere('animals', { tutor_id: req.params.id });
    if (animals.length > 0) {
      return res.status(409).json({ success: false, error: 'Tutor has registered animals', code: 'HAS_ANIMALS' });
    }
    const deleted = await deleteOne('tutors', req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Tutor not found', code: 'NOT_FOUND' });
    res.json({ success: true, data: { deleted: true } });
  } catch (err) { next(err); }
});

module.exports = router;
