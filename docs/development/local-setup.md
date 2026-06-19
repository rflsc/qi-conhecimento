# Setup local

Guia para rodar o monorepo **qi-conhecimento** em desenvolvimento.

## Pré-requisitos

- Node.js 20+
- pnpm 9+
- Docker Desktop (MongoDB + Redis)
- [Ollama](https://ollama.com) *(recomendado para embeddings locais — grátis)*
- Python 3.12 *(opcional — parser Docling local)*
- Chave Anthropic ou OpenAI *(opcional — respostas RAG enriquecidas)*
- Chave OpenAI *(opcional — LLM OpenAI, OCR sem Docling, embeddings cloud)*

## 1. Instalação

```bash
pnpm install
cp .env.example .env   # Windows: copy .env.example .env
```

Todas as variáveis ficam no **`.env` da raiz** do monorepo. Tanto a API quanto os apps Next.js (`web`, `admin`) leem esse arquivo.

## 2. Infraestrutura

```bash
pnpm infra:up
# ou: docker compose -f infra/docker-compose.dev.yml up -d mongodb redis
```

| Serviço | Porta | Variável |
| --- | --- | --- |
| MongoDB | 27017 | `MONGODB_URI` |
| Redis | 6379 | `REDIS_URL` |

Redis é **obrigatório** — filas BullMQ de ingestão dependem dele.

## 3. Desenvolvimento

```bash
pnpm dev
```

O script `predev` libera automaticamente as portas **3100, 3101 e 3102** antes de subir os apps (evita `EADDRINUSE` ao reiniciar).

| App | Porta | Comando individual |
| --- | --- | --- |
| API | 3100 | `pnpm --filter @qi-conhecimento/api dev` |
| Web | 3101 | `pnpm --filter @qi-conhecimento/web dev` |
| Admin | 3102 | `pnpm --filter @qi-conhecimento/admin dev` |
| Parser (Docling) | 8000 | `pnpm parser:dev` *(após setup)* |

### Parser Docling (recomendado para PDFs técnicos)

O serviço Python em `apps/parser` extrai Markdown de PDFs e imagens com [Docling](https://github.com/docling-project/docling). A API usa quando `PARSER_SERVICE_URL` está definido no `.env`.

Documentação detalhada: [architecture/docling.md](../architecture/docling.md) (evolução, pipeline, roadmap).

**Setup local (Windows — preferível ao Docker):**

```bash
pnpm parser:setup    # cria venv + pip install (Python 3.11 ou 3.12)
pnpm parser:dev      # http://localhost:8000 — primeira subida baixa modelos
```

**Alternativa Docker** (imagem pesada, build pode levar 10–20 min):

```bash
pnpm parser:docker
```

**Stack completa** (API + admin + web + parser):

```bash
pnpm dev:all
```

Verifique:

```bash
curl http://localhost:8000/health
```

No `.env` da raiz:

```env
PARSER_SERVICE_URL=http://localhost:8000
PARSER_SERVICE_TIMEOUT_MS=7200000
PARSER_MAX_UPLOAD_MB=150
```

`PARSER_SERVICE_TIMEOUT_MS` default **2 h** — PDFs grandes em CPU (Docling + OCR) podem levar dezenas de minutos. A API também aplica um mínimo dinâmico (~8 min + ~4 min/MB).

Sem o parser, PDFs usam fallback `pdf-parse`; imagens exigem `OPENAI_API_KEY` (Vision) ou Docling.

### Embeddings com Ollama (grátis, recomendado em dev)

1. Instale [Ollama](https://ollama.com/download)
2. Baixe o modelo: `ollama pull nomic-embed-text`
3. No `.env`:

```env
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
```

4. Reinicie a API — log: `Provedor de embedding ativo` com `provider: ollama`

Sem provedor de embedding, a busca usa só palavra-chave (`$text`). Com Ollama, busca híbrida (texto + vetorial) funciona sem `OPENAI_API_KEY`.

Para reindexar chunks importados antes de configurar embeddings: Swagger → `POST /knowledge/documents/{id}/reindex-embeddings`.

### LLM para respostas RAG (opcional)

Por padrão em dev (`.env.example`), o provedor é **Anthropic**:

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-haiku-4-5
```

Alternativa OpenAI:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
```

Sem chave LLM, busca e ingestão funcionam; respostas usam template com citação do chunk principal.

## 4. Primeiro acesso (admin)

Com `SEED_ADMIN_ENABLED=true` (padrão em dev), a API cria um usuário admin na primeira subida:

| Campo | Valor |
| --- | --- |
| URL | http://localhost:3102/login |
| E-mail | `admin@altoqi.com.br` |
| Senha | `AdminQi123!` |

Com `SEED_KNOWLEDGE_ENABLED=true`, 3 procedimentos piloto (NBR) são criados automaticamente se não houver chunks.

O seed **não recria** registros existentes. Para alterar credenciais, edite `SEED_ADMIN_*` no `.env` **antes** da primeira subida.

## 5. Verificação rápida

```bash
# API saudável
curl http://localhost:3100/health

# Swagger
open http://localhost:3100/api
```

## 6. Testar Fase 1 (CMS + busca)

1. Login → **CMS interno** → criar procedimento em Markdown
2. **Documentos** → aba Pílulas — ver chunk criado
3. **Busca** → ex.: `recuo tubo esgoto` + filtro Hidráulica

Guia: [phase-1.md](./phase-1.md)

## 7. Testar Fase 2 (ingestão + RAG)

### Fluxo completo (Docling + Ollama)

| Terminal | Comando |
| --- | --- |
| 1 | `pnpm infra:up` |
| 2 | `pnpm parser:dev` *(aguarde `Parser service pronto`)* |
| 3 | Ollama aberto + `nomic-embed-text` |
| 4 | `pnpm dev` |

No `.env`:

```env
PARSER_SERVICE_URL=http://localhost:8000
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
STORAGE_PATH=./storage
```

1. Login → **Importar** (http://localhost:3102/import)
2. Envie um PDF de norma
3. **Documentos** — aguarde **Concluído**; aba **Pílulas** mostra `embedding ✓`
4. **Busca** — teste query reformulada (ex.: `"quanto afastar tubo da parede"`)
5. Swagger → `POST /messaging/query` *(resposta LLM exige `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY` — ver `LLM_PROVIDER` no `.env`)*

### Cancelar ingestão ou embeddings em andamento

Admin → **Documentos** → **Cancelar** (ou **Ver log** → Cancelar no rodapé do console).

Funciona enquanto o documento está **Pendente**, **Processando** ou **Concluído mas ainda gerando embeddings** (fila BullMQ com pílulas sem vetor).

Remove jobs da fila, apaga pílulas parciais e marca status **Cancelado**. API: `POST /knowledge/documents/{id}/cancel-ingestion`.

### Console de ingestão (SSE)

**Documentos** → **Ver log** — stream em tempo real (`GET /knowledge/documents/{id}/ingestion-stream`) com fases parse/chunking/embedding, progresso de páginas Docling e barra de embeddings.

### OCR sob demanda

Se a extração de texto ficar suspeitamente baixa (PDF escaneado), o console oferece **Reprocessar com OCR**. OCR em CPU é **muito mais lento** que parse normal — use só em PDFs sem texto selecionável. API: `POST /knowledge/documents/{id}/reprocess-with-ocr`.

Na importação, marque **Permitir fallback pdf-parse** para usar o parser simples quando Docling falhar ou estourar timeout.

Guia: [phase-2.md](./phase-2.md)

## Troubleshooting

### `EADDRINUSE` na porta 3100

Há uma instância antiga da API ainda rodando. Soluções:

1. Rode `pnpm dev` de novo — o `predev` mata processos nessas portas automaticamente
2. Manual (Windows):
   ```powershell
   netstat -ano | findstr ":3100"
   Stop-Process -Id <PID> -Force
   ```

### `Configuration key "MONGODB_URI" does not exist`

A API não encontrou o `.env` da raiz. Verifique que o arquivo existe na raiz do monorepo.

### Login no admin não faz nada / erro de conexão

1. Confirme que a API está em http://localhost:3100/health
2. Verifique `NEXT_PUBLIC_API_URL=http://localhost:3100` no `.env` da raiz
3. Reinicie `pnpm dev` após alterar variáveis `NEXT_PUBLIC_*`
4. A API precisa de CORS habilitado para `localhost:3102` (já configurado em `main.ts`)

### Documento fica em `pending` / `processing` eternamente

1. Confirme Redis rodando: `docker compose -f infra/docker-compose.dev.yml ps`
2. Verifique logs da API — `IngestionProcessor` deve processar jobs
3. Status `failed` — passe o mouse no badge em Documentos para ver `ingestionError`
4. Use **Cancelar** no admin e reimporte

### `Property 'CANCELLED' does not exist on type 'IngestionStatus'`

Rebuild do pacote compartilhado após alterações em `packages/shared-types`:

```bash
pnpm --filter @qi-conhecimento/shared-types build
```

### Docling excedeu tempo limite / caiu para pdf-parse

1. Confirme `pnpm parser:dev` rodando — logs mostram lotes `Lote X/Y concluído`
2. PDFs com **texto nativo** não precisam de OCR — evite **Reprocessar com OCR** no admin
3. Aumente `PARSER_SERVICE_TIMEOUT_MS` (ex.: `7200000` = 2 h) e reinicie a API
4. OCR em 49 páginas em CPU pode levar **30–60+ min** — timeout curto dispara fallback automático para `pdf-parse` (pouco texto)
5. Mantenha `PARSER_DO_OCR=false` no ambiente do parser (padrão em `parser:dev`) salvo reprocessamento explícito

### Docling indisponível — fallback para pdf-parse

`PARSER_SERVICE_URL` está definido mas o parser não responde na porta 8000. Suba `pnpm parser:dev` ou comente a variável no `.env`.

### OCR de imagem falha

Com `PARSER_SERVICE_URL` e o parser rodando, imagens passam pelo Docling. Caso contrário, requer `OPENAI_API_KEY` válida (Vision API).

### Parser Docling não sobe / pip falha

1. Use **Python 3.11 ou 3.12** — Docling ainda não suporta 3.14. O script `parser:setup` tenta `py -3.12` no Windows automaticamente.
2. Primeira subida baixa modelos (~1 GB) — aguarde alguns minutos.
3. Docker: `pnpm parser:docker` — exige Docker Desktop com espaço em disco suficiente.
4. Health: `curl http://localhost:8000/health` — retorna `{"status":"ok"}` quando o serviço está pronto.

### `Page backend was unloaded` / `Stage table failed`

Incompatibilidade conhecida: backend **pypdfium2** (`PARSER_LOW_MEMORY=true`) + **TableFormer** no pipeline threaded do Docling. O estágio de tabelas reabre a imagem da página (scale 2.0) após o layout, mas o backend já foi descarregado.

**Correção automática (desde a versão atual):** com `PARSER_DO_TABLE_STRUCTURE=true` (padrão), o parser usa **Docling-Parse** em vez de pypdfium2.

Se ainda ocorrer:

1. Reinicie `pnpm parser:dev`
2. Reduza `PARSER_PAGE_BATCH_SIZE=8` se houver OOM (`std::bad_alloc`)
3. Em máquinas com ≥16 GB RAM: `PARSER_LOW_MEMORY=false` no ambiente do parser
4. Desative tabelas só como último recurso: `PARSER_DO_TABLE_STRUCTURE=false`

### `std::bad_alloc` / Docling OOM na página X

Falta de RAM ao renderizar páginas pesadas (comum em normas NBR com **100+ páginas** e tabelas).

1. **Reinicie o parser** após ajustar o `.env` (ou variáveis do terminal)
2. Garanta **`PARSER_PARALLEL_WORKERS=1`** — paralelo multiplica RAM (~2–3 GB por worker)
3. Reduza lotes:
   ```env
   PARSER_PAGE_BATCH_SIZE=4
   PARSER_IMAGES_SCALE=1.0
   ```
4. PDFs **>150 páginas** reduzem o lote automaticamente para 4; **>60** para 6
5. Modo tabela mais leve: `PARSER_TABLE_MODE=fast`
6. Feche Ollama/Docker extras; reinicie `pnpm parser:dev`
7. Último recurso: `PARSER_DO_TABLE_STRUCTURE=false` — usa `table_image_recovery` via texto do PDF

### Docker não está rodando

Erros de conexão MongoDB/Redis. Inicie o Docker Desktop e rode:

```bash
docker compose -f infra/docker-compose.dev.yml up -d
```

### Múltiplos `pnpm dev`

Execute **apenas uma** instância de `pnpm dev` por vez.

## Variáveis de ambiente principais

Ver `.env.example` na raiz.

| Variável | Uso |
| --- | --- |
| `PORT` | Porta da API (default: 3100) |
| `MONGODB_URI` | Conexão MongoDB |
| `REDIS_URL` | Conexão Redis / BullMQ |
| `JWT_SECRET` | Assinatura dos tokens JWT |
| `NEXT_PUBLIC_API_URL` | URL da API consumida pelo admin/web |
| `SEED_ADMIN_*` | Usuário admin inicial (dev) |
| `SEED_KNOWLEDGE_ENABLED` | Procedimentos piloto NBR (dev) |
| `OPENAI_API_KEY` | Embeddings (se `openai`), OCR (fallback sem Docling), LLM (se `openai`) |
| `EMBEDDING_PROVIDER` | `ollama` (local/grátis) ou `openai` (pago) |
| `EMBEDDING_CONCURRENCY` | Jobs paralelos de embedding (default: 2 ollama, 5 openai) |
| `OLLAMA_BASE_URL` | URL do Ollama (default: `http://localhost:11434`) |
| `EMBEDDING_MODEL` | `nomic-embed-text` (Ollama) ou `text-embedding-3-small` (OpenAI) |
| `LLM_PROVIDER` | `anthropic` ou `openai` — auto-detecta pela key se omitido |
| `ANTHROPIC_API_KEY` | LLM Anthropic (default em dev: `claude-haiku-4-5`) |
| `LLM_MODEL` | Modelo chat (default: `claude-haiku-4-5` ou `gpt-4o-mini` conforme provedor) |
| `STORAGE_PATH` | Diretório de uploads (default: `./storage`) |
| `MAX_UPLOAD_SIZE_MB` | Limite de upload (default: 150) |
| `PARSER_SERVICE_URL` | URL do parser Docling (default: `http://localhost:8000`) |
| `PARSER_SERVICE_TIMEOUT_MS` | Timeout HTTP para o parser (default: 7200000 = 2 h) |
| `PARSER_MAX_UPLOAD_MB` | Limite no serviço parser (default: 150) |
| `PARSER_DO_OCR` | OCR global no parser — deixe `false` salvo PDFs escaneados |
| `PARSER_PROFILE` | `default` \| `low_memory` \| `high_memory` — ver tabela abaixo |

### Perfil do parser (`PARSER_PROFILE`)

Lido pelo `apps/parser` (via `pnpm parser:dev`, que carrega o `.env` da raiz).

| Perfil | RAM típica | Workers | Lote | PDF 279 págs |
|--------|------------|---------|------|----------------|
| `default` | 8–16 GB | 1 (auto) | 8 → 4 | 1 worker, lote 4 |
| `low_memory` | ≤8 GB | 1 | 4 → 3 | 1 worker, lote 3 |
| `high_memory` | 16–32 GB | 2 | 12 → 8 | 2 workers, lote 8 |

Variáveis explícitas (`PARSER_PARALLEL_WORKERS`, `PARSER_PAGE_BATCH_SIZE`) **sobrescrevem** o perfil.

## Produção

- Defina `SEED_ADMIN_ENABLED=false` e `SEED_KNOWLEDGE_ENABLED=false`
- Troque `JWT_SECRET` e senhas do seed
- Configure `OPENAI_API_KEY` (embeddings) e `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY` (LLM)
- Não commite o arquivo `.env`
