const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const path = require('path');
const { readDb, getCollection, findById, insertOne, updateOne, deleteOne, findWhere, getSetting } = require('../utils/db');
const { requireFields } = require('../middleware/validate');
const { photoUploader } = require('../middleware/upload');
const files = require('../utils/files');
const { generateContractPdf } = require('../utils/pdfGenerator');

function calcTotal(dataEntrada, dataSaida, valorDiaria, servicos = []) {
  const ms = new Date(dataSaida) - new Date(dataEntrada);
  const dias = Math.max(1, Math.ceil(ms / 86_400_000));
  const extras = servicos.reduce((sum, s) => sum + (s.valor || 0), 0);
  return { dias, total: dias * valorDiaria + extras };
}

router.get('/', async (req, res, next) => {
  try {
    const db = await readDb();
    let bookings = db.bookings || [];
    if (req.query.status) bookings = bookings.filter(b => b.status_presenca === req.query.status);
    if (req.query.data) bookings = bookings.filter(b => b.data_entrada === req.query.data || b.data_saida === req.query.data);
    if (req.query.q) {
      const q = req.query.q.toLowerCase();
      bookings = bookings.filter(b => {
        const animal = db.animals.find(a => a.id === b.animal_id);
        const tutor = db.tutors.find(t => t.id === b.tutor_id);
        return animal?.nome?.toLowerCase().includes(q) || tutor?.nome?.toLowerCase().includes(q);
      });
    }
    const populated = bookings.map(b => ({
      ...b,
      animal: db.animals.find(a => a.id === b.animal_id) || null,
      tutor: db.tutors.find(t => t.id === b.tutor_id) || null,
    }));
    res.json({ success: true, data: populated, total: populated.length });
  } catch (err) { next(err); }
});

router.get('/calendar', async (req, res, next) => {
  try {
    const mes = req.query.mes;
    const bookings = (await getCollection('bookings')).filter(b =>
      b.data_entrada?.startsWith(mes) || b.data_saida?.startsWith(mes)
    );
    const blocked = (await getCollection('blocked_dates')).filter(d => d.data?.startsWith(mes));
    res.json({ success: true, data: { bookings, blocked } });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = await readDb();
    const booking = await findById('bookings', req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found', code: 'NOT_FOUND' });
    const animal = await findById('animals', booking.animal_id);
    const tutor = await findById('tutors', booking.tutor_id);
    const contract = db.contracts.find(c => c.booking_id === booking.id) || null;
    res.json({ success: true, data: { ...booking, animal, tutor, contract } });
  } catch (err) { next(err); }
});

router.post('/', requireFields(['animal_id', 'tutor_id', 'data_entrada', 'data_saida']), async (req, res, next) => {
  try {
    const diaria = req.body.valor_diaria || (await getSetting('diaria_base')) || 80;
    const servicos = req.body.servicos_adicionais || [];
    const { total } = calcTotal(req.body.data_entrada, req.body.data_saida, diaria, servicos);

    const booking = await insertOne('bookings', {
      animal_id: req.body.animal_id,
      tutor_id: req.body.tutor_id,
      data_entrada: req.body.data_entrada,
      data_saida: req.body.data_saida,
      valor_diaria: diaria,
      valor_total: total,
      status_pagamento: 'pendente',
      status_presenca: 'agendado',
      servicos_adicionais: servicos,
      observacoes: req.body.observacoes || '',
    });

    const validadeHoras = await getSetting('contrato_validade_horas');
    const dataExpiracao = validadeHoras
      ? new Date(Date.now() + validadeHoras * 3_600_000).toISOString()
      : null;

    const contract = await insertOne('contracts', {
      booking_id: booking.id,
      token_unico: uuidv4(),
      status: 'gerado',
      data_geracao: new Date().toISOString(),
      data_expiracao: dataExpiracao,
      data_visualizacao: null,
      data_assinatura: null,
      assinatura_path: null,
      nome_digitado: null,
      aceite_termos: false,
      ip_assinante: null,
      user_agent: null,
      hash_verificacao: null,
      pdf_rascunho_path: null,
      pdf_final_path: null,
    });

    generateContractPdf(contract.id, 'rascunho').catch(err =>
      console.error('Draft PDF error:', err.message)
    );

    res.status(201).json({ success: true, data: { booking, contract } });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    // Block fields managed by dedicated endpoints or that must not be reassigned after creation
    const {
      id: _id, created_at: _ca,
      animal_id: _ai, tutor_id: _ti,
      galeria: _g, galeria_token: _gt,
      ...safe
    } = req.body;
    const booking = await updateOne('bookings', req.params.id, safe);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found', code: 'NOT_FOUND' });
    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
});

router.put('/:id/checkin', async (req, res, next) => {
  try {
    const booking = await updateOne('bookings', req.params.id, { status_presenca: 'check-in' });
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found', code: 'NOT_FOUND' });
    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
});

router.put('/:id/checkout', async (req, res, next) => {
  try {
    const booking = await updateOne('bookings', req.params.id, { status_presenca: 'check-out' });
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found', code: 'NOT_FOUND' });
    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
});

router.put('/:id/pagamento', async (req, res, next) => {
  try {
    const { status_pagamento } = req.body;
    if (!['pendente', 'pago', 'parcial'].includes(status_pagamento)) {
      return res.status(400).json({ success: false, error: 'Invalid payment status', code: 'VALIDATION_ERROR' });
    }
    const booking = await updateOne('bookings', req.params.id, { status_pagamento });
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found', code: 'NOT_FOUND' });
    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const booking = await updateOne('bookings', req.params.id, { status_presenca: 'cancelado' });
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found', code: 'NOT_FOUND' });

    // Cancel any pending/active contract — prevents tutor from signing after booking is cancelled
    const contracts = await findWhere('contracts', { booking_id: req.params.id });
    const active = contracts.find(c => c.status !== 'assinado' && c.status !== 'cancelado');
    if (active) await updateOne('contracts', active.id, { status: 'cancelado' });

    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
});

// Gallery — upload photos to booking
router.post('/:id/galeria', (req, res, next) => {
  photoUploader.array('photos', 20)(req, res, async err => {
    if (err) return next(err);
    if (!req.files?.length) return res.status(400).json({ success: false, error: 'No files', code: 'NO_FILE' });
    try {
      const booking = await findById('bookings', req.params.id);
      if (!booking) return res.status(404).json({ success: false, error: 'Booking not found', code: 'NOT_FOUND' });

      const savedPaths = await Promise.all(
        req.files.map((f, i) => {
          const ext = path.extname(f.originalname).toLowerCase() || '.jpg';
          return files.saveFile(f.buffer, `uploads/galeria/${req.params.id}/${Date.now()}_${i}${ext}`);
        })
      );

      const galeria = [
        ...(booking.galeria || []),
        ...savedPaths.map(p => ({ path: p, uploaded_at: new Date().toISOString() })),
      ];
      const galeria_token = booking.galeria_token || uuidv4();
      const updated = await updateOne('bookings', req.params.id, { galeria, galeria_token });
      res.json({ success: true, data: updated });
    } catch (e) { next(e); }
  });
});

// Gallery — remove single photo
router.delete('/:id/galeria/:index', async (req, res, next) => {
  try {
    const booking = await findById('bookings', req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found', code: 'NOT_FOUND' });

    const idx = parseInt(req.params.index, 10);
    const galeria = [...(booking.galeria || [])];
    if (isNaN(idx) || idx < 0 || idx >= galeria.length) {
      return res.status(404).json({ success: false, error: 'Photo not found', code: 'NOT_FOUND' });
    }

    await files.deleteFile(galeria[idx].path);
    galeria.splice(idx, 1);
    const updated = await updateOne('bookings', req.params.id, { galeria });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

module.exports = router;
