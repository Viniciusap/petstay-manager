const express = require('express');
const router = express.Router();
const { findWhere, findById, readDb } = require('../utils/db');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.get('/:token', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.token)) {
      return res.status(400).json({ success: false, error: 'Invalid token', code: 'INVALID_TOKEN' });
    }

    const matches = await findWhere('bookings', { galeria_token: req.params.token });
    const booking = matches[0] || null;
    if (!booking || !booking.galeria?.length) {
      return res.status(404).json({ success: false, error: 'Gallery not found', code: 'NOT_FOUND' });
    }

    const [animal, tutor, db] = await Promise.all([
      findById('animals', booking.animal_id),
      findById('tutors', booking.tutor_id),
      readDb(),
    ]);

    res.json({
      success: true,
      data: {
        fotos: booking.galeria,
        animal: animal?.nome || '—',
        especie: animal?.especie || '',
        tutor: tutor?.nome || '—',
        hotel: db.settings?.nome_estabelecimento || 'PetStay',
        logo: db.settings?.logo_path || null,
        cor_primaria: db.settings?.cor_primaria || '#F97316',
        data_entrada: booking.data_entrada,
        data_saida: booking.data_saida,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
