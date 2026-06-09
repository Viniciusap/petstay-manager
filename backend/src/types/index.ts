import type { FastifyRequest, FastifyReply } from 'fastify';

export interface JwtPayload {
  role: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface AppSettings {
  id: number;
  nome_estabelecimento: string;
  logo_path: string | null;
  cor_primaria: string;
  tema_padrao: 'light' | 'dark';
  telefone_contato: string;
  cidade: string;
  moeda: string;
  diaria_base: string;
  idioma_padrao: 'pt' | 'en';
  contrato_validade_horas: number | null;
  base_url: string;
  onboarding_completo: boolean;
  clausulas_pt: string[];
  clausulas_en: string[];
  assinatura_hotel_path: string | null;
  nome_hotel_assinante: string | null;
  senha_hash: string | null;
}

export interface Saude {
  vacinas: string[];
  alergias: string[];
  observacoes: string;
}

export interface Preferencias {
  alimentacao: string;
  comportamento: string;
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

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
