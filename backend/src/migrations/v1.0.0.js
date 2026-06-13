module.exports = async function migrate_v1_0_0(readDb, writeDb) {
  const db = await readDb();

  if (!db.tutors) db.tutors = [];
  if (!db.animals) db.animals = [];
  if (!db.bookings) db.bookings = [];
  if (!db.contracts) db.contracts = [];
  if (!db.services) db.services = [];
  if (!db.blocked_dates) db.blocked_dates = [];

  db.settings = {
    nome_estabelecimento: 'PetStay',
    logo_path: null,
    cor_primaria: '#F97316',
    tema_padrao: 'light',
    telefone_contato: '',
    cidade: '',
    moeda: 'BRL',
    diaria_base: 80.00,
    idioma_padrao: 'pt',
    contrato_validade_horas: null,
    base_url: 'http://localhost:3001',
    onboarding_completo: false,
    ...db.settings,
  };

  await writeDb(db);
};
