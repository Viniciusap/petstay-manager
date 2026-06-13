import {
  pgTable, uuid, text, boolean, integer, numeric,
  timestamp, jsonb,
} from 'drizzle-orm/pg-core';
import type { Saude, Preferencias, ServiceItem, GaleriaPhoto } from '../types/index.js';

export const appSettings = pgTable('app_settings', {
  id: integer('id').primaryKey().default(1),
  nome_estabelecimento: text('nome_estabelecimento').notNull().default(''),
  logo_path: text('logo_path'),
  cor_primaria: text('cor_primaria').notNull().default('#F97316'),
  tema_padrao: text('tema_padrao').notNull().default('light'),
  telefone_contato: text('telefone_contato').notNull().default(''),
  cidade: text('cidade').notNull().default(''),
  moeda: text('moeda').notNull().default('BRL'),
  diaria_base: numeric('diaria_base').notNull().default('0'),
  idioma_padrao: text('idioma_padrao').notNull().default('pt'),
  contrato_validade_horas: integer('contrato_validade_horas'),
  base_url: text('base_url').notNull().default(''),
  onboarding_completo: boolean('onboarding_completo').notNull().default(false),
  clausulas_pt: jsonb('clausulas_pt').notNull().default([]).$type<string[]>(),
  clausulas_en: jsonb('clausulas_en').notNull().default([]).$type<string[]>(),
  assinatura_hotel_path: text('assinatura_hotel_path'),
  nome_hotel_assinante: text('nome_hotel_assinante'),
  senha_hash: text('senha_hash'),
  mfa_secret: text('mfa_secret'),
  mfa_enabled: boolean('mfa_enabled').notNull().default(false),
});

export const tutors = pgTable('tutors', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  telefone: text('telefone').notNull(),
  email: text('email').notNull().default(''),
  endereco: text('endereco').notNull().default(''),
  tipo: text('tipo').notNull().default('primario'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const animals = pgTable('animals', {
  id: uuid('id').primaryKey().defaultRandom(),
  tutor_id: uuid('tutor_id').notNull().references(() => tutors.id),
  nome: text('nome').notNull(),
  especie: text('especie').notNull(),
  raca: text('raca').notNull().default(''),
  idade: integer('idade').notNull().default(0),
  peso: numeric('peso').notNull().default('0'),
  saude: jsonb('saude').notNull().default({ vacinas: [], alergias: [], observacoes: '' }).$type<Saude>(),
  preferencias: jsonb('preferencias').notNull().default({ alimentacao: '', comportamento: '' }).$type<Preferencias>(),
  arquivos_vacinacao: jsonb('arquivos_vacinacao').notNull().default([]).$type<string[]>(),
  foto_path: text('foto_path'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  nome_en: text('nome_en').notNull(),
  valor: numeric('valor').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const blockedDates = pgTable('blocked_dates', {
  id: uuid('id').primaryKey().defaultRandom(),
  data: text('data').notNull(),
  motivo: text('motivo').notNull().default(''),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  animal_id: uuid('animal_id').notNull().references(() => animals.id),
  tutor_id: uuid('tutor_id').notNull().references(() => tutors.id),
  data_entrada: text('data_entrada').notNull(),
  data_saida: text('data_saida').notNull(),
  valor_diaria: numeric('valor_diaria').notNull(),
  valor_total: numeric('valor_total').notNull(),
  status_pagamento: text('status_pagamento').notNull().default('pendente'),
  status_presenca: text('status_presenca').notNull().default('agendado'),
  servicos_adicionais: jsonb('servicos_adicionais').notNull().default([]).$type<ServiceItem[]>(),
  observacoes: text('observacoes').notNull().default(''),
  galeria: jsonb('galeria').notNull().default([]).$type<GaleriaPhoto[]>(),
  galeria_token: text('galeria_token'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contracts = pgTable('contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  booking_id: uuid('booking_id').notNull().references(() => bookings.id),
  token_unico: text('token_unico').notNull().unique(),
  status: text('status').notNull().default('gerado'),
  data_geracao: timestamp('data_geracao', { withTimezone: true }).notNull().defaultNow(),
  data_expiracao: timestamp('data_expiracao', { withTimezone: true }),
  data_visualizacao: timestamp('data_visualizacao', { withTimezone: true }),
  data_assinatura: timestamp('data_assinatura', { withTimezone: true }),
  assinatura_path: text('assinatura_path'),
  nome_digitado: text('nome_digitado'),
  aceite_termos: boolean('aceite_termos').notNull().default(false),
  ip_assinante: text('ip_assinante'),
  user_agent: text('user_agent'),
  hash_verificacao: text('hash_verificacao').unique(),
  pdf_rascunho_path: text('pdf_rascunho_path'),
  pdf_final_path: text('pdf_final_path'),
  assinatura_hotel_path: text('assinatura_hotel_path'),
  nome_hotel_assinante: text('nome_hotel_assinante'),
  data_assinatura_hotel: timestamp('data_assinatura_hotel', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AppSettingsRow = typeof appSettings.$inferSelect;
export type TutorRow = typeof tutors.$inferSelect;
export type AnimalRow = typeof animals.$inferSelect;
export type ServiceRow = typeof services.$inferSelect;
export type BlockedDateRow = typeof blockedDates.$inferSelect;
export type BookingRow = typeof bookings.$inferSelect;
export type ContractRow = typeof contracts.$inferSelect;
