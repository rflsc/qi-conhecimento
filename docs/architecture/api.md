# Arquitetura da API

## Stack

- NestJS 11 · MongoDB (Mongoose) · Redis (BullMQ) · Passport JWT · nestjs-pino · Swagger `/api`
- OpenAI · Anthropic · Ollama (embeddings locais) · Docling via HTTP · `pdf-parse` · `cheerio`
- Porta padrão: **3100** (`PORT` no `.env`)

## Configuração de ambiente

A API carrega variáveis do **`.env` na raiz do monorepo**, não de `apps/api/.env`:

```typescript
// apps/api/src/app.module.ts
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: [join(__dirname, '../../../.env'), '.env'],
}),
```

Isso garante que `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `PARSER_SERVICE_URL`, `API_CREDENTIALS_ENCRYPTION_KEY` e `SEED_*` sejam encontrados quando o Turbo executa a API com cwd em `apps/api`.

LLM e embeddings configuram-se no **admin → Configurações** (`llm_configs` no MongoDB), não no `.env`.

> Após alterar `packages/shared-types`, rode `pnpm --filter @qi-conhecimento/shared-types build`.

## CORS

Habilitado em `main.ts` para os frontends locais:

- `http://localhost:3101` (web)
- `http://localhost:3102` (admin)

## Módulos

| Módulo | Responsabilidade |
| --- | --- |
| `auth` | Register, login, refresh, logout, `/auth/me` |
| `users` | CRUD com soft delete, RBAC e seed admin |
| `health` | Health check (`GET /health`) |
| `knowledge` | Documentos, chunks, CMS, busca híbrida, RAG, embeddings |
| `ingestion` | Storage, parsers, Docling client, chunking, processador BullMQ |
| `web-import` | Jobs de importação web em lote — descoberta, fetch, settings no admin |
| `messaging` | Assistente de campo — `POST /messaging/query` (RAG para Qi Agents) |

### Estrutura `knowledge`

```
apps/api/src/modules/knowledge/
├── controllers/knowledge.controller.ts
├── services/
│   ├── knowledge.service.ts      # CRUD + upload + cancel + reindex
│   ├── knowledge-seed.service.ts
│   ├── embedding.service.ts      # Ollama ou OpenAI
│   ├── llm.service.ts            # Anthropic ou OpenAI
│   └── rag.service.ts            # busca híbrida + LLM
├── repositories/knowledge.repository.ts
└── schemas/
```

### Estrutura `ingestion`

```
apps/api/src/modules/ingestion/
├── processors/ingestion.processor.ts
├── services/
│   ├── storage.service.ts
│   ├── chunking.service.ts
│   ├── document-ingestion.service.ts
│   └── docling.client.ts
└── parsers/
    ├── pdf.parser.ts
    ├── image.parser.ts
    ├── html.parser.ts
    ├── html/                    # extratores genéricos + perfis (ver web-import.md)
    └── parser.factory.ts
```

### Importação web

Especificação completa: [web-import.md](./web-import.md).

| Fase | Endpoints |
| --- | --- |
| 1 ✅ | Melhoria interna em `POST /knowledge/documents/import-link` (Readability + `blocks[]`) |
| 2 ✅ | `POST/GET /knowledge/web-imports`, settings, SSE `…/stream`, cancel/retry |
| 3 | `GET /knowledge/web-imports/profiles`, `POST …/profiles/detect` |

### Estrutura `web-import`

```
apps/api/src/modules/web-import/
├── controllers/web-import.controller.ts
├── services/
│   ├── web-import.service.ts
│   ├── web-discovery.service.ts
│   ├── web-fetch.service.ts
│   ├── web-import-settings.service.ts
│   └── web-import-progress.service.ts
├── discovery/          # single-url, sitemap, listing-crawl
├── processors/web-import.processor.ts
├── repositories/web-import.repository.ts
└── schemas/            # jobs, pages, settings
```

## Seeds (dev)

### Admin (`AdminSeedService`)

`SEED_ADMIN_ENABLED=true` — cria usuário admin idempotente.

### Conhecimento (`KnowledgeSeedService`)

`SEED_KNOWLEDGE_ENABLED=true` — 3 procedimentos piloto (NBR 8160 × 2, NBR 5410 × 1) se não houver chunks.

## Fluxo por camada

`Request → Controller (DTO) → Service (lógica) → Repository (query) → MongoDB`

Trabalho assíncrono via BullMQ: `IngestionProcessor` → `DocumentIngestionService` / `EmbeddingService`.

## Filas

| Fila | Jobs | Descrição |
| --- | --- | --- |
| `ingestion` | `process-document` | Parse → chunking → enqueue embeddings |
| `ingestion` | `generate-embeddings` | Ollama/OpenAI → `chunk.embedding[]` |
| `web-import` | `run-web-import` | Descoberta de URLs + enqueue páginas |
| `web-import` | `process-web-import-page` | Cria documento LINK + fila de ingestão |
| `messaging` | `send-field-response` | Fora de escopo — envio fica no Qi Agents |

## Collections MongoDB

- `users`
- `knowledge_documents`
- `knowledge_chunks` — text index + campo `embedding[]`
- `web_import_jobs`, `web_import_pages`, `web_import_settings`
- `field_queries`

## Endpoints

### Sistema

| Método | Path | Descrição |
| --- | --- | --- |
| GET | `/health` | Status da API |
| GET | `/api` | Swagger UI |
| POST | `/auth/login` | Login email/senha |
| POST | `/auth/register` | Criar conta |

### Conhecimento

| Método | Path | Descrição |
| --- | --- | --- |
| GET | `/knowledge/stats` | Totais + chunks com/sem embedding |
| GET | `/knowledge/documents` | Lista documentos (paginada) |
| GET | `/knowledge/chunks` | Lista pílulas de conhecimento |
| POST | `/knowledge/documents/upload` | Upload PDF/imagem (multipart) |
| POST | `/knowledge/documents/import-link` | Importação de URL |
| POST | `/knowledge/documents/{id}/cancel-ingestion` | Cancela ingestão (parse ou embeddings pendentes) |
| POST | `/knowledge/documents/{id}/reindex-embeddings` | Reenfileira embeddings dos chunks |
| POST | `/knowledge/documents/{id}/reprocess-with-ocr` | Reprocessa PDF com OCR (Docling) |
| POST | `/knowledge/documents/{id}/dismiss-ocr-retry` | Dispensa oferta de OCR |
| GET | `/knowledge/documents/{id}/ingestion-stream` | SSE — progresso da ingestão |
| POST | `/knowledge/cms` | CMS — documento + Markdown |
| POST | `/knowledge/documents/manual-content` | Chunk em documento existente |
| POST | `/knowledge/search` | Busca híbrida (RRF texto + vetorial) |
| POST | `/knowledge/public-search` | Busca híbrida pública (LP web) |
| POST | `/knowledge/public-ask` | RAG público — resposta + citações; audita em `field_queries` (canal `web`) |

### Importação web

Ver [web-import.md](./web-import.md).

| Método | Path | Descrição |
| --- | --- | --- |
| GET/PATCH | `/knowledge/web-imports/settings` | Configurações globais de importação web (admin UI) |
| GET/PATCH | `/llm-config` | Provedor LLM, chaves e embeddings (admin UI — **Configurações**) |
| POST | `/knowledge/web-imports` | Cria job de importação em lote |
| GET | `/knowledge/web-imports` | Lista jobs |
| GET | `/knowledge/web-imports/{jobId}` | Detalhe do job |
| GET | `/knowledge/web-imports/{jobId}/pages` | Páginas descobertas |
| GET | `/knowledge/web-imports/{jobId}/progress` | Snapshot de progresso |
| GET | `/knowledge/web-imports/{jobId}/stream` | SSE — progresso |
| POST | `/knowledge/web-imports/{jobId}/cancel` | Cancela job |
| POST | `/knowledge/web-imports/{jobId}/retry-failed` | Reprocessa falhas |

### Mensageria

Canais WhatsApp/Telegram: **[Qi Agents](../integrations/qi-agents.md)**. Detalhes: [messaging.md](./messaging.md)

| Método | Path | Descrição |
| --- | --- | --- |
| POST | `/messaging/query` | Consulta RAG — backend para Qi Agents e testes admin |
| GET | `/messaging/queries` | Histórico `field_queries` — painel admin `/queries` |
| GET | `/messaging/whatsapp/webhook` | Legado (verificação Meta) |
| POST | `/messaging/whatsapp/webhook` | Legado (stub — não usar) |

Detalhes RAG: [knowledge-rag.md](./knowledge-rag.md) · Parser: [parser-service.md](./parser-service.md)
