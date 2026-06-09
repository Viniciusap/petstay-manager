# PetStayManager — CLAUDE.md

Sistema de gerenciamento de hotel para pets (tutores, animais, reservas, contratos digitais com assinatura).

## Compliance Arancia Architecture

Ler `C:\Dev\AranciaArquitecture\.claude\CLAUDE.md` e executar o processo descrito.

Este sistema deve estar 100% conforme o checklist `C:\Dev\AranciaArquitecture\compliance\checklist.md`.
Nenhuma exceção documentada.

## Stack

- **Backend:** Fastify 5 · TypeScript strict · Drizzle ORM · Zod · PostgreSQL 17
- **Frontend:** React 19 · TypeScript strict · Vite · TanStack Query 5 · react-hook-form + Zod
- **Deploy:** Docker + Compose → KingHost VPS → `petstay.aranciatech.com.br`
- **Porta interna API:** 3002
- **Porta interna frontend:** 8082
- **Database:** `petstay_prod`

## Rotas API

Todas as rotas sob `/api/v1/`. Auth em `/api/v1/auth/`. Health em `/health`.

## Variáveis de Ambiente

Ver `.env.example` para todas as keys obrigatórias.
