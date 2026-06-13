export interface Settings {
  nome_estabelecimento: string;
  logo_path: string | null;
  cor_primaria: string;
  tema_padrao: 'light' | 'dark';
  telefone_contato: string;
  cidade: string;
  moeda: string;
  diaria_base: number;
  idioma_padrao: 'pt' | 'en';
  contrato_validade_horas: number | null;
  base_url: string;
  onboarding_completo: boolean;
  clausulas_pt?: string[];
  clausulas_en?: string[];
  assinatura_hotel_path?: string | null;
  nome_hotel_assinante?: string | null;
}

export interface Tutor {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  endereco: string;
  tipo: 'primario' | 'secundario';
  created_at: string;
  animals?: Animal[];
}

export interface Animal {
  id: string;
  tutor_id: string;
  nome: string;
  especie: 'cachorro' | 'gato' | 'outro';
  raca: string;
  idade: number;
  peso: number;
  saude: { vacinas: string[]; alergias: string[]; observacoes: string };
  preferencias: { alimentacao: string; comportamento: string };
  arquivos_vacinacao: string[];
  foto_path?: string | null;
  created_at: string;
  bookings?: Booking[];
}

export interface ServiceItem {
  servico_id: string;
  nome: string;
  nome_en: string;
  valor: number;
}

export interface GaleriaPhoto {
  path: string;
  uploaded_at: string;
}

export interface Booking {
  id: string;
  animal_id: string;
  tutor_id: string;
  data_entrada: string;
  data_saida: string;
  valor_diaria: number;
  valor_total: number;
  status_pagamento: 'pendente' | 'pago' | 'parcial';
  status_presenca: 'agendado' | 'check-in' | 'check-out' | 'cancelado';
  servicos_adicionais: ServiceItem[];
  observacoes: string;
  created_at: string;
  galeria?: GaleriaPhoto[];
  galeria_token?: string | null;
  animal?: Animal;
  tutor?: Tutor;
  contract?: Contract;
}

export interface Contract {
  id: string;
  booking_id: string;
  token_unico: string;
  status: 'gerado' | 'visualizado' | 'assinado' | 'expirado' | 'cancelado';
  data_geracao: string;
  data_expiracao: string | null;
  data_visualizacao: string | null;
  data_assinatura: string | null;
  assinatura_path: string | null;
  nome_digitado: string | null;
  aceite_termos: boolean;
  ip_assinante: string | null;
  user_agent: string | null;
  hash_verificacao: string | null;
  pdf_rascunho_path: string | null;
  pdf_final_path: string | null;
  assinatura_hotel_path?: string | null;
  nome_hotel_assinante?: string | null;
  data_assinatura_hotel?: string | null;
}

export interface Service {
  id: string;
  nome: string;
  nome_en: string;
  valor: number;
  ativo: boolean;
}

export interface BlockedDate {
  id: string;
  data: string;
  motivo: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  code?: string;
  meta?: { total?: number };
}
