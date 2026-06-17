# Arquitetura da API

## Stack

- NestJS 11 · MongoDB (Mongoose) · Redis (BullMQ) · Passport JWT · nestjs-pino · Swagger `/api`
- OpenAI (`openai`) · Ollama (embeddings locais) · Docling via HTTP · `pdf-parse` · `cheerio`
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

Isso garante que `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `PARSER_SERVICE_URL`, `EMBEDDING_PROVIDER` e `SEED_*` sejam encontrados quando o Turbo executa a API com cwd em `apps/api`.

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
| `messaging` | Assistente de campo, webhooks WhatsApp (Pilar 3) |

### Estrutura `knowledge`

```
apps/api/src/modules/knowledge/
├── controllers/knowledge.controller.ts
├── services/
│   ├── knowledge.service.ts      # CRUD + upload + cancel + reindex
│   ├── knowledge-seed.service.ts
│   ├── embedding.service.ts      # Ollama ou OpenAI
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
    └── parser.factory.ts
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
| `messaging` | `send-field-response` | (futuro) envio assíncrono |

## Collections MongoDB

- `users`
- `knowledge_documents`
- `knowledge_chunks` — text index + campo `embedding[]`
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
| POST | `/knowledge/documents/{id}/cancel-ingestion` | Cancela ingestão pendente/em processamento |
| POST | `/knowledge/documents/{id}/reindex-embeddings` | Reenfileira embeddings dos chunks |
| POST | `/knowledge/cms` | CMS — documento + Markdown |
| POST | `/knowledge/documents/manual-content` | Chunk em documento existente |
| POST | `/knowledge/search` | Busca híbrida (RRF texto + vetorial) |

### Mensageria

| Método | Path | Descrição |
| --- | --- | --- |
| POST | `/messaging/query` | Consulta RAG (campo simulado) |
| GET | `/messaging/whatsapp/webhook` | Verificação Meta |
| POST | `/messaging/whatsapp/webhook` | Recebimento (stub) |

Detalhes RAG: [knowledge-rag.md](./knowledge-rag.md) · Parser: [parser-service.md](./parser-service.md) · Mensageria: [messaging.md](./messaging.md)
