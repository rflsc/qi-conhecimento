# Fase 2 — Ingestão multimodal + RAG com LLM

Entrega concluída: upload PDF/imagem/link, parsers (Docling + fallbacks), embeddings (Ollama ou OpenAI), busca híbrida, cancelamento de ingestão e respostas com LLM.

## O que foi implementado

### API — Ingestão (`apps/api/src/modules/ingestion`)

| Componente | Descrição |
| --- | --- |
| `StorageService` | Persistência local em `STORAGE_PATH` |
| `DoclingClient` | Cliente HTTP para `apps/parser` (Docling) |
| `PdfParser` | Docling quando `PARSER_SERVICE_URL` definido; fallback `pdf-parse` |
| `ImageParser` | Docling quando disponível; fallback OpenAI Vision |
| `HtmlParser` | Extração de conteúdo com Cheerio (link/HTML) |
| `ChunkingService` | Divisão por `##` com limite de 2000 chars |
| `DocumentIngestionService` | Orquestra parse → chunks → fila embeddings |
| `IngestionProcessor` | BullMQ: `process-document`, `generate-embeddings` |

### API — RAG (`apps/api/src/modules/knowledge`)

| Componente | Descrição |
| --- | --- |
| `EmbeddingService` | Provedor `ollama` (local) ou `openai` (API) |
| `RagService` | Busca híbrida (RRF: texto + vetorial) + LLM |
| `POST /knowledge/documents/upload` | Multipart — PDF ou imagem |
| `POST /knowledge/documents/import-link` | Importação de URL |
| `POST /knowledge/documents/{id}/cancel-ingestion` | Cancela ingestão (parse, chunking ou embeddings pendentes) |
| `POST /knowledge/documents/{id}/reindex-embeddings` | Reenfileira embeddings dos chunks |
| `POST /knowledge/documents/{id}/reprocess-with-ocr` | Reprocessa PDF com OCR (Docling) |
| `POST /knowledge/documents/{id}/dismiss-ocr-retry` | Dispensa oferta de OCR no console |
| `GET /knowledge/documents/{id}/ingestion-stream` | SSE — progresso em tempo real |

- Embeddings em `chunk.embedding[]` (cosine similarity in-app)
- `GET /knowledge/stats` inclui `chunksWithEmbeddings` / `chunksWithoutEmbeddings`
- Chunks expõem `hasEmbedding` na listagem
- Status de ingestão: `pending` → `processing` → `completed` / `failed` / **`cancelled`**
- `ingestionError` exposto quando status = `failed` ou `cancelled`
- `parseQualityWarning` + `offerOcrRetry` quando extração de texto é suspeitamente baixa
- Docling: timeout dinâmico, progresso por página/lote, fallback automático para `pdf-parse` em timeout

### Parser Docling (`apps/parser`)

- FastAPI + Docling — PDFs e imagens → Markdown estruturado
- Scripts: `pnpm parser:setup`, `pnpm parser:dev`, `pnpm parser:docker`
- Ver [architecture/parser-service.md](../architecture/parser-service.md)

### Admin (`apps/admin`)

- **`/import`** — abas PDF, Imagem, Link/HTML; opção fallback `pdf-parse`
- **Documentos** — status com tooltip de erro; badge `embedding ✓` nas pílulas
- **Cancelar** — parse, chunking ou **embeddings ainda na fila** (status `completed` com pílulas sem vetor)
- **Console de ingestão** — SSE, progresso Docling por página, barra de embeddings, oferta OCR
- Dashboard — cards apontam para `/import?type=...`

### Mensageria

- `POST /messaging/query` usa `RagService` (busca híbrida + LLM com fallback template)

## Como testar

### Setup mínimo (sem Docling, sem embeddings)

```bash
pnpm infra:up && pnpm dev
```

PDFs usam `pdf-parse`; busca só por palavra-chave.

### Fluxo completo (Docling + Ollama — recomendado)

```bash
pnpm infra:up
pnpm parser:setup && pnpm parser:dev    # terminal 2
ollama pull nomic-embed-text            # uma vez
pnpm dev
```

`.env`:

```env
PARSER_SERVICE_URL=http://localhost:8000
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
STORAGE_PATH=./storage
```

1. Login admin → **Importar** → PDF de norma
2. Aguarde **Concluído**; pílulas com `embedding ✓`
3. **Busca** — query exata e reformulada
4. Import duplicado/travado → **Cancelar** em Documentos (inclui parar fila de embeddings)

### Reindexar após configurar embeddings

Swagger: `POST /knowledge/documents/{documentId}/reindex-embeddings`

## Variáveis de ambiente

```env
# Parser (opcional — melhor qualidade em PDFs técnicos)
PARSER_SERVICE_URL=http://localhost:8000
PARSER_SERVICE_TIMEOUT_MS=7200000

# Embeddings — Ollama (grátis) ou OpenAI (pago)
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
# OPENAI_API_KEY=sk-...           # se EMBEDDING_PROVIDER=openai
# EMBEDDING_MODEL=text-embedding-3-small

# LLM (opcional — respostas enriquecidas)
OPENAI_API_KEY=
LLM_MODEL=gpt-4o-mini

STORAGE_PATH=./storage
MAX_UPLOAD_SIZE_MB=150
```

## Próxima fase

Fase 3: WhatsApp Cloud API completa, transcrição de áudio (Whisper), bot Telegram — ver [scope/product-vision.md](../scope/product-vision.md).
