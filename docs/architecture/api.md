# Arquitetura da API

## Stack

- NestJS 11 · MongoDB (Mongoose) · Redis (BullMQ) · Passport JWT · nestjs-pino · Swagger `/api`

## Módulos

| Módulo | Responsabilidade |
| --- | --- |
| `auth` | Register, login, refresh, logout, `/auth/me` |
| `users` | CRUD com soft delete e RBAC |
| `health` | Health check |
| `knowledge` | Documentos, chunks, busca híbrida (Pilar 1 + 2) |
| `ingestion` | Processadores BullMQ — PDF, OCR, embeddings |
| `messaging` | Assistente de campo, webhooks WhatsApp (Pilar 3) |

## Fluxo por camada

`Request → Controller (DTO) → Service (lógica) → Repository (query) → MongoDB`

## Filas

| Fila | Jobs |
| --- | --- |
| `ingestion` | `process-document`, `generate-embeddings` |
| `messaging` | `send-field-response` (futuro) |

## Collections MongoDB

- `users`
- `knowledge_documents`
- `knowledge_chunks` (text index para busca híbrida MVP)
- `field_queries`
