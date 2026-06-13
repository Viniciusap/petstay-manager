const express = require('express');
const router = express.Router();
const { getCollection, insertOne, updateOne, deleteOne } = require('../utils/db');
const { requireFields } = require('../middleware/validate');

router.get('/', async (_req, res, next) => {
  try {
    const services = (await getCollection('services')).filter(s => s.ativo !== false);
    res.json({ success: true, data: services, total: services.length });
  } catch (err) { next(err); }
});

router.post('/', requireFields(['nome', 'valor']), async (req, res, next) => {
  try {
    const service = await insertOne('services', {
      nome: req.body.nome,
      nome_en: req.body.nome_en || req.body.nome,
      valor: req.body.valor,
      ativo: true,
    });
    res.status(201).json({ success: true, data: service });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id: _id, created_at: _ca, ...safe } = req.body;
    const service = await updateOne('services', req.params.id, safe);
    if (!service) return res.status(404).json({ success: false, error: 'Service not found', code: 'NOT_FOUND' });
    res.json({ success: true, data: service });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const service = await updateOne('services', req.params.id, { ativo: false });
    if (!service) return res.status(404).json({ success: false, error: 'Service not found', code: 'NOT_FOUND' });
    res.json({ success: true, data: service });
  } catch (err) { next(err); }
});

module.exports = router;
