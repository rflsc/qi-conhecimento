# Padrões Transversais

## Backend (API)

- Soft delete via `deletedAt` — nunca `deleteOne()`
- Logger: `nestjs-pino` — nunca `console.log`
- Eventos: `DomainEvents.*` via EventEmitter2
- ValidationPipe global: `whitelist` + `forbidNonWhitelisted`
- Erros: `HttpExceptionFilter` com formato padronizado
- Swagger obrigatório em endpoints da API
- TypeScript strict — sem `any`
- `.env` da raiz carregado via `ConfigModule` com path absoluto a partir de `dist/`
- CORS habilitado para frontends locais (3101, 3102)

## Ingestão assíncrona

- Upload síncrono → documento `pending` → job BullMQ `process-document`
- Parser por `DocumentSourceType` via `ParserFactory` (Docling opcional via HTTP)
- Chunks criados → job `generate-embeddings` por chunk
- Status: `pending` → `processing` → `completed` / `failed` / `cancelled` (+ `ingestionError`)
- Cancelamento: remove jobs da fila, soft-delete de pílulas parciais, workers respeitam flag
- Arquivos em `STORAGE_PATH/{documentId}/source.{ext}` — diretório gitignored

## Filas BullMQ (Upstash)

- Redis via `REDIS_URL`; conexão TLS em `createBullRedisConnection()`
- Filas ativas: `ingestion`, `embedding`, `web-import`
- `BULLMQ_WORKER_SETTINGS`: `drainDelay: 30s`, `stalledInterval: 5min` — menos polling ocioso
- `removeOnComplete: true` — jobs concluídos não acumulam metadados no Redis
- `/health` público **não** consulta Redis (health do Render)
- Dev: `pnpm infra:up` — Redis local sem limite de comandos

## RAG

- Plain text derivado de Markdown via `stripMarkdownToPlain()` (`shared-utils`)
- Busca híbrida: RRF entre `$text` MongoDB e cosine similarity em `embedding[]`
- Assistente: `retrieveChunksForAnswer` → `rankChunksForAnswer` → `generateAnswer` + `selectCitationsForDisplay`
- System prompt inclui mapeamento Tabela H.1 (NBR 8800) — caso (b) para engastado-rotulado
- Citações filtradas/deduplicadas na UI; metadados `pageStart` / `tableCaption` quando ingeridos via Docling
- `buildCitationLabel(norm, item, page, table)` em `shared-utils`
- Regressão: `pnpm --filter @qi-conhecimento/api eval:rag` — casos em `apps/api/eval/rag-cases.json`
- Embeddings: Ollama (`nomic-embed-text`) ou OpenAI — configurados em **Admin → Configurações**; concorrência via `EMBEDDING_CONCURRENCY` no `.env`
- LLM com fallback template quando nenhum provedor LLM está configurado no painel
- Mapper `_id` → `id` em todas as respostas HTTP

## Seeds (dev)

| Seed | Variável | Comportamento |
| --- | --- | --- |
| Admin | `SEED_ADMIN_ENABLED=true` | Usuário admin idempotente |
| Conhecimento | `SEED_KNOWLEDGE_ENABLED=true` | 3 procedimentos NBR se chunks vazios |

Desative em produção: `SEED_ADMIN_ENABLED=false`, `SEED_KNOWLEDGE_ENABLED=false`

## Monorepo / Dev

- Gerenciador: pnpm workspaces + Turborepo
- **`pnpm dev`** executa `predev` antes de subir os apps
- `scripts/kill-dev-ports.mjs` libera portas 3100–3102 (evita `EADDRINUSE`)
- **`predev` por app:** API rebuilda `shared-types` + `shared-utils`; Web rebuilda `api-client`
- `pnpm parser:setup` / `pnpm parser:dev` — parser Docling local (Python 3.12)
- `pnpm dev:all` — API + admin + web + parser
- Após alterar pacotes compartilhados manualmente: `pnpm --filter @qi-conhecimento/<pkg> build`
- Variáveis compartilhadas no `.env` da raiz — não duplicar por app
- Next.js apps carregam root `.env` via `loadEnvConfig` no `next.config.js`
- Artefatos `.js` compilados em `apps/api/src/` são ignorados no git e não devem existir (quebram `nest start --watch`)

## Frontend

- Tema escuro slate/emerald — ver [design-system.md](./design-system.md)
- i18n obrigatório — 4 idiomas (pt, en, fr, es)
- Texto visível sempre via `t()` — nunca hardcoded no JSX
- RTK Query em `apps/admin/src/store/api.ts` — JWT via cookie `access_token`
- Upload multipart via `FormData` (sem `Content-Type` manual)

## Git

- Nunca commitar `.env` — apenas `.env.example`
- `node_modules`, `dist`, `.next`, `storage/`, `infra/data/` ignorados
