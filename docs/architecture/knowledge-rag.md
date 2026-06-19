# Conhecimento e RAG

## Entidades

### KnowledgeDocument

Metadados da fonte ingerida:

| Campo | Descrição |
| --- | --- |
| `title` | Título do documento |
| `specialty` | Especialidade (`civil`, `hidraulica`, `eletrica`, `seguranca_trabalho`) |
| `sourceType` | `pdf`, `image`, `html`, `link`, `manual_text` |
| `sourceReference` | Caminho relativo em `STORAGE_PATH` ou URL |
| `normReference` | Ex.: `NBR 8160` |
| `ingestionStatus` | `pending` → `processing` → `completed` / `failed` / `cancelled` |
| `ingestionError` | Mensagem de erro ou motivo do cancelamento |
| `parseQualityWarning` | Aviso quando extração de texto é suspeitamente baixa |
| `offerOcrRetry` | Oferta de reprocessamento com OCR no admin |

### KnowledgeChunk

Pílula de conhecimento pós-chunking:

| Campo | Descrição |
| --- | --- |
| `content` | Texto plain (para busca `$text` e embeddings) |
| `markdownContent` | Conteúdo estruturado |
| `chapter`, `section`, `normItem` | Metadados de localização |
| `tags` | Tags manuais ou automáticas (ex.: norma) |
| `embedding` | Vetor numérico (`select: false`) |
| `embeddingId` | Preenchido quando embedding foi gerado |

A listagem HTTP expõe `hasEmbedding: boolean` derivado de `embeddingId`.

## Pipeline de ingestão

```mermaid
flowchart TD
  A[Admin: upload / link / CMS] --> B[KnowledgeDocument criado]
  B --> C{BullMQ process-document}
  C --> D[Parser por sourceType]
  D --> E[Markdown padronizado]
  E --> F[ChunkingService]
  F --> G[KnowledgeChunk × N]
  G --> H{BullMQ generate-embeddings}
  H --> I[embedding[] persistido]
  I --> J[ingestionStatus: completed]
  B --> K[Cancelar no admin]
  K --> L[status: cancelled + jobs removidos + pílulas apagadas]
```

> Após o parse, o documento fica `completed` enquanto embeddings ainda rodam em fila. **Cancelar** continua disponível até todos os vetores serem gerados.

### Parsers (`apps/api/src/modules/ingestion/parsers/`)

| Tipo | Parser | Dependência |
| --- | --- | --- |
| `pdf` | `PdfParser` | **Docling** via `DoclingClient` se `PARSER_SERVICE_URL`; fallback `pdf-parse` |
| `image` | `ImageParser` | **Docling** se disponível; fallback OpenAI Vision |
| `link` / `html` | `HtmlParser` | `cheerio` — fetch URL + extração de conteúdo |
| `manual_text` | — | CMS grava Markdown direto (sem fila de parse) |

Parser service: [parser-service.md](./parser-service.md) · Evolução Docling: [docling.md](./docling.md)

### Chunking

- Divisão por headings `##`
- Limite de **2000 caracteres** por chunk (split por parágrafos)
- Extração automática de `normItem` via regex

### Cancelamento

- Admin → Documentos ou console de ingestão → **Cancelar**
- Válido em `pending`, `processing` ou `completed` com embeddings ainda na fila
- API marca `cancelled` **antes** de drenar jobs — workers ativos abortam ao persistir
- Remove jobs BullMQ (`process-document` + `generate-embeddings`), soft-delete de pílulas parciais

### Qualidade de parse e OCR

- `assessParseQuality` detecta extração muito baixa (ex.: fallback `pdf-parse` em PDF escaneado)
- Console admin oferece **Reprocessar com OCR** (`POST .../reprocess-with-ocr`) ou **Manter assim**
- OCR via Docling é lento em CPU — reserve para PDFs sem texto selecionável

## Embeddings (`EmbeddingService`)

| Provedor | Config | Custo |
| --- | --- | --- |
| **Ollama** | `EMBEDDING_PROVIDER=ollama`, `EMBEDDING_MODEL=nomic-embed-text` | Grátis (local) |
| **OpenAI** | `EMBEDDING_PROVIDER=openai`, `OPENAI_API_KEY`, `EMBEDDING_MODEL=text-embedding-3-small` | Pago |

Auto-detecção: sem `EMBEDDING_PROVIDER`, usa OpenAI se houver chave; senão Ollama.

Reindexar documento existente: `POST /knowledge/documents/{id}/reindex-embeddings`

Concorrência do worker BullMQ (`EMBEDDING_CONCURRENCY`): default **2** (Ollama) ou **5** (OpenAI); máximo 20.

## LLM (`LlmService`)

Respostas enriquecidas em `RagService.generateAnswer()` e `POST /messaging/query`.

| Provedor | Config | Modelo default |
| --- | --- | --- |
| **Anthropic** | `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` | `claude-haiku-4-5` |
| **OpenAI** | `LLM_PROVIDER=openai`, `OPENAI_API_KEY` | `gpt-4o-mini` |

Auto-detecção: sem `LLM_PROVIDER`, usa Anthropic se houver `ANTHROPIC_API_KEY`; senão OpenAI se houver `OPENAI_API_KEY`.

Sem provedor LLM: resposta em template com citação do chunk principal.

## Busca híbrida (`RagService`)

1. **Texto** — MongoDB `$text` em `content`, `markdownContent`, `tags`
2. **Vetorial** — cosine similarity entre query embedding e `chunk.embedding[]`
3. **Fusão** — Reciprocal Rank Fusion (RRF, k=60)
4. **Filtro** — opcional por `specialty`

### Fallbacks sem provedor de embedding

| Recurso | Comportamento |
| --- | --- |
| Embeddings | Ignorados — busca só por `$text` |
| OCR (imagem) | Docling se parser ativo; senão exige `OPENAI_API_KEY` |
| LLM (resposta) | Template com citação do chunk principal |

## API

| Método | Path | Descrição |
| --- | --- | --- |
| GET | `/knowledge/stats` | Totais + `chunksWithEmbeddings` |
| GET | `/knowledge/documents` | Lista documentos (paginada) |
| GET | `/knowledge/chunks` | Lista pílulas (`?documentId=` opcional) |
| POST | `/knowledge/documents/upload` | Upload PDF/imagem (multipart) |
| POST | `/knowledge/documents/import-link` | Importação de URL |
| POST | `/knowledge/documents/{id}/cancel-ingestion` | Cancela ingestão (inclui embeddings pendentes) |
| POST | `/knowledge/documents/{id}/reindex-embeddings` | Reenfileira embeddings |
| POST | `/knowledge/documents/{id}/reprocess-with-ocr` | Reprocessa PDF com OCR |
| POST | `/knowledge/documents/{id}/dismiss-ocr-retry` | Dispensa oferta de OCR |
| GET | `/knowledge/documents/{id}/ingestion-stream` | SSE — progresso da ingestão |
| POST | `/knowledge/cms` | CMS — documento + Markdown |
| POST | `/knowledge/documents/manual-content` | Chunk em documento existente |
| POST | `/knowledge/search` | Busca híbrida (RRF + filtro especialidade) |

Roles: ingestão exige `admin` ou `editor`; busca também aceita `user`.

## Especialidades (`EngineeringSpecialty`)

- `civil`
- `hidraulica`
- `eletrica`
- `seguranca_trabalho`

## Variáveis de ambiente

```env
PARSER_SERVICE_URL=http://localhost:8000
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
# EMBEDDING_CONCURRENCY=2          # default: 2 ollama, 5 openai
OPENAI_API_KEY=                    # embeddings (openai) ou LLM (openai)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=                 # LLM (anthropic)
LLM_MODEL=claude-haiku-4-5
STORAGE_PATH=./storage
MAX_UPLOAD_SIZE_MB=150
SEED_KNOWLEDGE_ENABLED=true        # 3 procedimentos piloto (dev)
```

Guia de teste: [development/phase-2.md](../development/phase-2.md)
