const CLAUSULAS_PT = [
  '1. Responsabilidade: O estabelecimento se compromete a zelar pelo bem-estar, alimentacao e seguranca do animal durante o periodo contratado.',
  '2. Saude e Vacinacao: O responsavel declara que o animal esta com as vacinas em dia e apto para conviver com outros animais.',
  '3. Pagamento: O valor acordado deve ser quitado conforme combinado. A nao quitacao podera resultar em retencao do animal.',
  '4. Cancelamento: Cancelamentos com menos de 48h de antecedencia estao sujeitos a cobranca de 50% do valor total.',
  '5. Emergencias: O estabelecimento esta autorizado a tomar decisoes veterinarias emergenciais, sendo os custos de responsabilidade do tutor.',
  '6. Limitacao: O estabelecimento nao se responsabiliza por doencas preexistentes ou condicoes nao informadas no check-in.',
];

const CLAUSULAS_EN = [
  '1. Liability: The establishment commits to ensuring the animal\'s well-being, feeding and safety during the contracted period.',
  '2. Health & Vaccination: The guardian declares the animal is fully vaccinated and fit to coexist with other animals.',
  '3. Payment: The agreed amount must be paid as arranged. Failure to pay may result in the animal being held.',
  '4. Cancellation: Cancellations less than 48h in advance are subject to a 50% charge of the total amount.',
  '5. Emergencies: The establishment is authorized to make emergency veterinary decisions; costs are the guardian\'s responsibility.',
  '6. Limitation: The establishment is not liable for pre-existing conditions or issues not disclosed at check-in.',
];

module.exports = async function migrate_v1_0_1(readDb, writeDb) {
  const db = await readDb();

  // Fix base_url default — should point to frontend, not backend
  if (db.settings.base_url === 'http://localhost:3001') {
    db.settings.base_url = 'http://localhost:5173';
  }

  // Add editable clauses (preserve if already customized)
  db.settings = {
    clausulas_pt: CLAUSULAS_PT,
    clausulas_en: CLAUSULAS_EN,
    assinatura_hotel_path: null,
    nome_hotel_assinante: null,
    ...db.settings,
  };

  // Add hotel signature fields to existing contracts
  db.contracts = (db.contracts || []).map(c => ({
    assinatura_hotel_path: null,
    nome_hotel_assinante: null,
    data_assinatura_hotel: null,
    ...c,
  }));

  await writeDb(db);
};
