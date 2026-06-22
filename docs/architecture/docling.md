# Docling — evolução, arquitetura e próximos passos

Documento de referência sobre o uso do [Docling](https://github.com/docling-project/docling) no **qi-conhecimento**: por que adotamos, como evoluiu, o que funciona hoje e o que vem a seguir.

Documentação complementar:

- [parser-service.md](./parser-service.md) — contrato HTTP e variáveis do serviço
- [knowledge-rag.md](./knowledge-rag.md) — pipeline de ingestão completo
- [development/local-setup.md](../development/local-setup.md) — setup e troubleshooting
- [apps/parser/README.md](../../apps/parser/README.md) — README operacional do microserviço

---

## O que é Docling neste projeto

Docling é a **engine principal de conversão documento → Markdown** na esteira RAG. Roda como microserviço Python (`apps/parser`, FastAPI) e é acionado pela API NestJS quando `PARSER_SERVICE_URL` está definido no `.env`.

| Entrada | Saída | Uso |
| --- | --- | --- |
| PDF técnico (normas NBR, manuais) | Markdown com headings, tabelas e layout | Chunking + embeddings + busca |
| Imagem (foto de norma, captura de tela) | Markdown estruturado | Idem |

**Sem Docling**, a qualidade cai drasticamente:

| Tipo | Fallback | Limitação |
| --- | --- | --- |
| PDF | `pdf-parse` (JS) | Sem layout, sem OCR, tabelas viram texto plano |
| Imagem | OpenAI Vision | Exige `OPENAI_API_KEY`, custo por imagem |

Docling **não** processa links/HTML (`HtmlParser` + Readability) nem texto manual do CMS.

---

## Por que um serviço separado

1. **Isolamento de dependências** — Docling traz PyTorch e modelos ML (~1 GB na primeira subida, ~2–3 GB RAM por worker).
2. **Runtime Node leve** — a API NestJS permanece sem stack Python.
3. **Open source (MIT)** — roda 100% local, alinhado ao uso de Ollama para embeddings.
4. **Escala independente** — em produção, o parser pode ir para um serviço Render/Docker separado sem redeployar a API.

---

## Arquitetura da integração

```mermaid
flowchart TB
  subgraph admin [Admin]
    Import["/import — upload PDF/imagem"]
    Console["Console SSE — Ver log"]
  end

  subgraph api [API NestJS]
    Upload["POST /knowledge/documents/upload"]
    Queue["BullMQ — process-document"]
    DIS["DocumentIngestionService"]
    PP["PdfParser / ImageParser"]
    DC["DoclingClient"]
    Progress["IngestionProgressService"]
    Quality["assessParseQuality"]
    Chunk["ChunkingService — splitFromBlocks"]
  end

  subgraph parser [apps/parser — FastAPI + Docling]
    Parse["POST /v1/parse"]
    Poll["GET /v1/parse/progress/{job_id}"]
    Engine["DocumentConverter + TableFormer"]
    Blocks["block_extractor — blocks[]"]
    Enrich["table_enrichment — recuperação NBR"]
  end

  Import --> Upload --> Queue --> DIS --> PP --> DC
  DC -->|multipart + job_id| Parse
  DC -->|poll 3s| Poll
  Parse --> Engine --> Blocks --> Enrich
  Parse -->|markdown + blocks| DC --> PP --> DIS
  DIS --> Quality --> Chunk
  Progress --> Console
  DC --> Progress
```

### Camadas e arquivos

| Camada | Arquivo | Responsabilidade |
| --- | --- | --- |
| Cliente HTTP | `apps/api/src/modules/ingestion/services/docling.client.ts` | Health, POST multipart, poll de progresso, timeout dinâmico |
| Roteamento PDF | `apps/api/src/modules/ingestion/parsers/pdf.parser.ts` | Docling primeiro; fallback `pdf-parse` |
| Roteamento imagem | `apps/api/src/modules/ingestion/parsers/image.parser.ts` | Docling primeiro; fallback Vision |
| Orquestração | `apps/api/src/modules/ingestion/services/document-ingestion.service.ts` | Progresso SSE, OCR, qualidade |
| Qualidade | `apps/api/src/modules/ingestion/utils/parse-quality.util.ts` | Detecta extração suspeita → oferta OCR |
| Serviço Python | `apps/parser/app/main.py` | Rotas FastAPI |
| Pipeline | `apps/parser/app/parser.py` | Lotes, backends, TableFormer |
| Blocos estruturados | `apps/parser/app/block_extractor.py` | `blocks[]` — página, tipo, caption, headingPath |
| Paralelismo | `apps/parser/app/parallel.py` | `ProcessPoolExecutor` para lotes |
| Tabelas NBR | `apps/parser/app/table_enrichment.py` | Recupera dados da camada de texto do PDF |
| Perfis RAM | `apps/parser/app/config.py` | Presets `default` / `low_memory` / `high_memory` |
| Progresso | `apps/parser/app/progress.py` | Estado in-memory por `job_id` |
| Launcher dev | `scripts/dev-parser.mjs` | Carrega `.env` da raiz e sobe uvicorn |

---

## Pipeline Docling (estado atual)

### 1. Subida e warm-up

Na primeira requisição (ou no lifespan do FastAPI), o serviço instancia um `DocumentConverter` e baixa modelos Docling (~1 GB). O log `Parser service pronto` indica que está aceitando requisições.

### 2. Backends de PDF

O parser escolhe o backend conforme configuração e presença de tabelas:

| Condição | Backend | Motivo |
| --- | --- | --- |
| `PARSER_LOW_MEMORY=true` e tabelas **desligadas** | **pypdfium2** | Menor uso de RAM |
| `PARSER_DO_TABLE_STRUCTURE=true` (padrão) | **Docling-Parse** | TableFormer reabre imagens de página; pypdfium2 descarrega cedo demais → erro `Page backend was unloaded` |

Com tabelas ativas, `PARSER_IMAGES_SCALE` fica em **1.0** por padrão (scale 2.0 ≈ 4× RAM em normas longas).

### 3. TableFormer e recuperação de tabelas

**TableFormer** (`PARSER_DO_TABLE_STRUCTURE=true`):

- Modo `accurate` (padrão) ou `fast` (`PARSER_TABLE_MODE`)
- `PARSER_TABLE_CELL_MATCHING` — casa células com texto nativo do PDF

**Table image recovery** (`PARSER_TABLE_IMAGE_RECOVERY=true`):

Normas como NBR 8800 exportam tabelas ilustradas como `<!-- image -->` no Markdown do Docling, embora os valores numéricos ainda existam na camada de texto do PDF. O módulo `table_enrichment.py`:

1. Localiza captions `Tabela X — …` seguidas de placeholder de imagem
2. Extrai texto da região correspondente via pypdfium2
3. Monta tabela Markdown (inclui parser especializado para **Tabela H.1 — Valores teóricos de K**)

### 4. OCR

| Modo | Quando |
| --- | --- |
| Global | `PARSER_DO_OCR=true` no ambiente |
| Por requisição | Campo `do_ocr=true` no POST (usado em **Reprocessar com OCR** no admin) |
| Desligado (padrão) | PDFs com texto nativo — OCR em CPU pode levar **30–60+ min** em dezenas de páginas |

Engine na resposta: `docling` vs `docling+ocr`.

### 5. Lotes de páginas

PDFs longos não passam pelo conversor inteiro de uma vez:

1. Contagem de páginas via pypdfium2
2. Tamanho do lote via `effective_page_batch_size()` — reduz automaticamente em PDFs >30, >60 e >150 páginas
3. Um `DocumentConverter` **reutilizado** entre lotes sequenciais (evita recarregar modelos)
4. `gc.collect()` entre lotes

### 6. Paralelismo (workers)

Com `PARSER_PARALLEL_WORKERS=2` (perfil `high_memory`) ou auto:

- `ProcessPoolExecutor` — cada worker mantém **sua própria** cópia do `DocumentConverter`
- Custo: ~2–3 GB RAM **por worker**
- Progresso reportado pelo processo pai conforme lotes terminam
- `PARSER_THREADS_PER_WORKER` limita threads torch por worker

Regra de segurança (modo **auto**): PDFs acima de `parallel_page_limit` (30 no `default`, 400 no `high_memory`) forçam **1 worker**.

Com **`PARSER_PARALLEL_WORKERS` explícito no `.env`**, o valor é respeitado sem downgrade automático — útil em máquinas com RAM livre; em PDFs longos com `pnpm dev` aberto, monitore OOM.

### 7. Progresso e console admin

1. API gera `job_id` (UUID) e envia no POST
2. `DoclingClient` faz poll a cada **3 s** em `/v1/parse/progress/{job_id}`
3. `IngestionProgressService` traduz para SSE: `Docling — X/Y página(s) · lote N/M`
4. Estado do job fica **em memória** no parser — perdido ao reiniciar o serviço

### 8. Fallbacks na API

Comportamento do `PdfParser`:

| Situação | Resultado |
| --- | --- |
| `PARSER_SERVICE_URL` vazio + usuário **não** marcou fallback | Erro `DoclingRequiredError` |
| `PARSER_SERVICE_URL` vazio + **Permitir fallback pdf-parse** | `pdf-parse` |
| Docling falha (não timeout) + sem fallback | Erro |
| Docling **timeout** | **Sempre** cai para `pdf-parse` (mesmo sem opt-in) |
| Docling falha + fallback marcado | `pdf-parse` |

> **Atenção:** timeout → `pdf-parse` evita perder a ingestão, mas em PDFs escaneados o texto extraído pode ser mínimo. O admin oferece **Reprocessar com OCR** quando `assessParseQuality` detecta extração suspeita.

Imagens: qualquer falha Docling → OpenAI Vision (silencioso), sem progresso nem OCR por requisição hoje.

---

## Evolução cronológica

### Fase 0 — Antes do Docling (Fase 1)

- CMS Markdown manual
- Busca só por `$text` MongoDB
- Sem ingestão de PDF

### v1 — Docling inicial (17/06/2026 — commit `8657e82`, Fase 2)

**Entrega:** microserviço `apps/parser` + integração mínima.

| Item | Estado |
| --- | --- |
| FastAPI + `DocumentConverter` single-shot | ✓ |
| Rotas `/health`, `/v1/parse` | ✓ |
| `DoclingClient` básico (fetch, timeout ~120 s) | ✓ |
| Limite upload 50 MB | ✓ |
| Lotes, progresso, OCR por request | ✗ |
| Fallback automático em timeout | ✗ |

PDFs pequenos funcionavam; normas longas estouravam timeout ou RAM.

### v2 — Confiabilidade (18/06/2026 — commit `0678f26`)

Foco: PDFs grandes e PDFs escaneados sem perder a ingestão.

| Item | Detalhe |
| --- | --- |
| **Lotes de páginas** | Conversor reutilizado entre lotes |
| **Timeout escalável** | Default 2 h; mínimo dinâmico ~8 min + 4 min/MB na API |
| **Fallback em timeout** | `pdf-parse` automático |
| **OCR por requisição** | Campo `do_ocr` + endpoint `reprocess-with-ocr` |
| **Qualidade de parse** | `parseQualityWarning` + oferta OCR no admin |
| **Upload 150 MB** | Alinhado API + parser |
| **Checkbox fallback** | Admin — "Permitir fallback pdf-parse" |

### v3 — Observabilidade (18/06/2026 — commit `430498a`)

| Item | Detalhe |
| --- | --- |
| **`GET /v1/parse/progress/{job_id}`** | Páginas, lote, mensagem |
| **Poll na API** | A cada 3 s durante parse de PDF |
| **Console SSE** | Barra de progresso Docling no admin |
| **Cancelamento** | Válido enquanto embeddings ainda rodam |
| **Docs troubleshooting** | OOM, timeout, parser offline |

### v4 — Performance e normas técnicas (18/06/2026)

| Item | Arquivo | Detalhe |
| --- | --- | --- |
| **Perfis de RAM** | `config.py` | `default`, `low_memory`, `high_memory` |
| **Workers paralelos** | `parallel.py` | Até 2 workers no `high_memory` |
| **Backend inteligente** | `parser.py` | Docling-Parse quando TableFormer ativo |
| **Table image recovery** | `table_enrichment.py` | Tabelas NBR a partir da camada de texto |
| **Caps dinâmicos de lote** | `config.py` | Redução automática por nº de páginas |
| **`dev-parser.mjs`** | script | Carrega `.env` da raiz (`PARSER_PROFILE`, etc.) |

### v5 — Metadados estruturados e citações RAG (19/06/2026)

| Item | Arquivo | Detalhe |
| --- | --- | --- |
| **`blocks[]` no contrato parse** | `block_extractor.py`, `schemas.py` | heading, paragraph, table, list + `pageStart`, `caption`, `headingPath`, `tableSource` |
| **Chunks enriquecidos** | `knowledge-chunk.schema.ts`, `chunking.service.ts` | `pageStart`, `pageEnd`, `contentType`, `tableCaption`, `tableSource`, `headingPath` |
| **Chunking por blocos** | `ChunkingService.splitFromBlocks()` | Tabelas atômicas; fallback `splitMarkdown()` se sem blocks ou pdf-parse |
| **Citações RAG** | `rag.service.ts`, `buildCitationLabel()` | Label com norma + tabela + página; rerank H.1; filtro/dedup de citações; prompt Tabela H.1 |
| **UI web** | `KnowledgeSearch.tsx` | Assistente público — resposta + citações filtradas |
| **Eval RAG** | `apps/api/eval/` | 3 casos NBR 8800 contra `/knowledge/public-ask` — `pnpm eval:rag` |

```mermaid
timeline
    title Evolução Docling no qi-conhecimento
    section Fase 1
        CMS + busca texto : Sem Docling
    section v1 — Fase 2
        Parser básico : Single-shot, 50 MB, timeout curto
    section v2 — Confiabilidade
        Lotes + OCR + fallback : PDFs grandes e escaneados
    section v3 — Observabilidade
        Progresso SSE : Admin vê páginas e lotes
    section v4 — Normas NBR
        Perfis + paralelo + tabelas : RAM, velocidade, NBR 8800
    section v5 — Metadados
        blocks + chunks + citações : página, tabela, RAG, eval
```

---

## Capacidades atuais (checklist)

| Capacidade | PDF | Imagem |
| --- | --- | --- |
| Markdown estruturado (headings) | ✓ | ✓ |
| TableFormer | ✓ | — |
| Table image recovery (NBR) | ✓ | — |
| OCR sob demanda | ✓ | — |
| Lotes de páginas | ✓ | — |
| Workers paralelos | ✓ (perfil) | — |
| Progresso tempo real (SSE) | ✓ | ✗ |
| Metadados de página/tabela nos chunks | ✓ | — |
| Fallback fraco | `pdf-parse` | Vision API |
| Perfis RAM (`PARSER_PROFILE`) | ✓ | ✓ |
| Health check admin | ✓ (`GET /knowledge/parser/status`) | ✓ |

---

## Limitações conhecidas

### Técnicas

| Limitação | Impacto | Mitigação |
| --- | --- | --- |
| Python 3.14 não suportado | `pip install` falha | Usar 3.11 ou 3.12 (`pnpm parser:setup`) |
| ~1 GB modelos na 1ª subida | Demora minutos | Aguardar `Parser service pronto` |
| OCR em CPU muito lento | 30–60+ min em PDFs escaneados | Só quando necessário; `PARSER_DO_OCR=false` |
| RAM ~2–3 GB por worker | OOM (`std::bad_alloc`) em normas 100+ pág. | `low_memory`, lote 4, 1 worker |
| Progresso in-memory | Perdido ao reiniciar parser | Reimportar se parser cair mid-parse |
| Timeout → pdf-parse silencioso | Texto quase vazio em scans | Console oferece OCR; ver badge de qualidade |
| Table recovery heurístico | Nem toda tabela vira Markdown perfeito | Parser H.1 específico; demais genérico |
| 1 documento por vez na fila | `IngestionProcessor` concurrency=1 | Aceitável em dev; fila serializa uploads |
| Docker compose mínimo | Não repassa perfis do `.env` | Preferir `pnpm parser:dev` local |

### Produto / contrato

- Resposta de parse expõe `{ markdown, title?, engine?, blocks[] }` — metadados propagados aos chunks quando Docling processa (não em fallback `pdf-parse`)
- Documentos ingeridos **antes** da v5 não têm `pageStart` / `tableCaption` — reimporte para popular metadados
- Imagens não recebem `job_id` nem `do_ocr` da API hoje

---

## Configuração

### Habilitar Docling

```env
PARSER_SERVICE_URL=http://localhost:8000
PARSER_SERVICE_TIMEOUT_MS=7200000
PARSER_MAX_UPLOAD_MB=150
PARSER_PROFILE=high_memory   # ou default / low_memory
```

```bash
pnpm parser:setup   # uma vez
pnpm parser:dev     # terminal separado
pnpm dev            # API + admin
```

Verificação: `curl http://localhost:8000/health` → `{"status":"ok","engine":"docling"}`

### Perfis (`PARSER_PROFILE`)

| Perfil | RAM típica | Workers | Lote base | PDF 279 pág. |
| --- | --- | --- | --- | --- |
| `default` | 8–16 GB | 1 (auto) | 8 → 4 | 1 worker, lote 4 |
| `low_memory` | ≤8 GB | 1 | 4 → 3 | 1 worker, lote 3 |
| `high_memory` | 16–32 GB | 2 | 12 → 8 | 2 workers, lote 8 |

`PARSER_PARALLEL_WORKERS` e `PARSER_PAGE_BATCH_SIZE` **sobrescrevem** o perfil.

Tabela completa de variáveis: [parser-service.md](./parser-service.md) e [local-setup.md](../development/local-setup.md).

---

## Próximos passos

Roadmap organizado por prioridade.

### Curto prazo — observabilidade

| # | Item | Motivação | Onde implementar |
| --- | --- | --- | --- |
| 1 | **Health check do parser no boot da API** | Log/aviso quando `PARSER_SERVICE_URL` definido mas serviço offline | `DoclingClient.checkHealth()` no `onModuleInit` |
| 2 | **Sinalizar fallback pdf-parse no admin** | Usuário deve saber quando timeout trocou o engine | Badge no console + `engine` no documento |
| 3 | **Boost retrieval `contentType=table`** | Perguntas numéricas priorizarem tabelas no índice vetorial/texto | `RagService.hybridSearch` |

### Médio prazo — qualidade RAG

| # | Item | Motivação |
| --- | --- | --- |
| 4 | **Progresso para imagens** | `job_id` + poll no `ImageParser` |
| 5 | **OCR configurável para imagens** | Passar `do_ocr` da API para imagens escaneadas |
| 6 | **Melhorar table recovery** | Generalizar além de NBR H.1; validar NBR 8160, 5410, 8800 |
| 7 | **Testes de regressão** | RAG eval entregue (`apps/api/eval/`); pendente: fixtures de parse (Markdown/blocks por PDF) |

### Médio prazo — operação

| # | Item | Motivação |
| --- | --- | --- |
| 8 | **Docker compose com perfis** | Repassar `PARSER_PROFILE` no `docker-compose.dev.yml` |
| 9 | **Deploy parser em produção** | Serviço Render/Docker separado |
| 10 | **Persistência de progresso** | Redis — sobreviver restart do parser |
| 11 | **Fila no parser** | Job assíncrono para PDFs de 2 h |

### Longo prazo — produto

| # | Item | Motivação |
| --- | --- | --- |
| 12 | **Multimodal RAG** | Figuras e tabelas como assets referenciáveis |
| 13 | **GPU / OCR acelerado** | Reduzir tempo de OCR em PDFs escaneados |
| 14 | **Parser como plugin** | MinerU, Unstructured com interface comum |

### Entregue (v5)

| Item | Detalhe |
| --- | --- |
| Metadados no contrato parse | `blocks[]` com página, tipo, caption, `tableSource` |
| Proveniência nos chunks | `pageStart`, `tableCaption`, `contentType`, `headingPath` |
| Chunking estrutural | `splitFromBlocks()` com tabelas atômicas |
| Citações enriquecidas | `buildCitationLabel(norm, item, page, table)` + rerank tabelas K |

### Fora do escopo Docling (Fase 3)

Canais WhatsApp/Telegram, webhooks e áudio ficam no **Qi Agents** — ver [integrations/qi-agents.md](../integrations/qi-agents.md) e [phase-3.md](../development/phase-3.md). API key, admin `/queries` e auditoria unificada em `field_queries` entregues. Não alteram o pipeline Docling.

---

## Métricas de sucesso (sugeridas)

Para validar evoluções futuras:

| Métrica | Meta orientativa |
| --- | --- |
| Tempo parse NBR 279 pág. (`high_memory`, CPU) | < 45 min sem OCR |
| Chunks com `normItem` preenchido após parse | > 80% em normas estruturadas |
| Tabelas recuperadas vs `<!-- image -->` | > 70% em NBR 8800 H.x |
| Ingestões que caem em pdf-parse por timeout | < 5% com parser saudável |
| Chunks com embedding após import | 100% (Ollama/OpenAI configurado) |

---

## Referências externas

- [Docling — GitHub](https://github.com/docling-project/docling)
- [Docling — documentação](https://docling-project.github.io/docling/)
- [IBM Docling announcement](https://www.ibm.com/new/announcements/donut-docling-open-source-document-understanding)
