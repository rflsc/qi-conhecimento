# Setup local

Guia para rodar o monorepo **qi-conhecimento** em desenvolvimento.

## Pré-requisitos

- Node.js 20+
- pnpm 9+
- Docker Desktop (MongoDB + Redis)
- [Ollama](https://ollama.com) *(recomendado para embeddings locais — grátis)*
- Python 3.12 *(opcional — parser Docling local)*
- Chave OpenAI *(opcional — LLM e OCR sem Docling)*

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
PARSER_SERVICE_TIMEOUT_MS=120000
```

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
5. Swagger → `POST /messaging/query` *(resposta LLM exige `OPENAI_API_KEY`)*

### Cancelar ingestão travada

Admin → **Documentos** → botão **Cancelar** em linhas **Pendente** ou **Processando**.

Remove jobs da fila, apaga pílulas parciais e marca status **Cancelado**. API: `POST /knowledge/documents/{id}/cancel-ingestion`.

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

### Docling indisponível — fallback para pdf-parse

`PARSER_SERVICE_URL` está definido mas o parser não responde na porta 8000. Suba `pnpm parser:dev` ou comente a variável no `.env`.

### OCR de imagem falha

Com `PARSER_SERVICE_URL` e o parser rodando, imagens passam pelo Docling. Caso contrário, requer `OPENAI_API_KEY` válida (Vision API).

### Parser Docling não sobe / pip falha

1. Use **Python 3.11 ou 3.12** — Docling ainda não suporta 3.14. O script `parser:setup` tenta `py -3.12` no Windows automaticamente.
2. Primeira subida baixa modelos (~1 GB) — aguarde alguns minutos.
3. Docker: `pnpm parser:docker` — exige Docker Desktop com espaço em disco suficiente.
4. Health: `curl http://localhost:8000/health` — retorna `{"status":"ok"}` quando o serviço está pronto.

4. Health: `curl http://localhost:8000/health` — retorna `{"status":"ok"}` quando o serviço está pronto.

### `std::bad_alloc` / Docling OOM na página X

Falta de RAM ao processar página com imagem/tabela pesada (comum em normas NBR longas).

1. Feche apps pesados (Ollama, Docker extra) ou reinicie o parser
2. No `.env` ou ambiente do parser (padrão já otimizado):
   ```env
   PARSER_LOW_MEMORY=true
   PARSER_PAGE_BATCH_SIZE=10
   ```
3. Reinicie `pnpm parser:dev`
4. Se persistir: comente `PARSER_SERVICE_URL` — a API usa `pdf-parse` (menos qualidade, zero Docling)

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
| `OPENAI_API_KEY` | LLM, OCR (fallback sem Docling) |
| `EMBEDDING_PROVIDER` | `ollama` (local/grátis) ou `openai` (pago) |
| `OLLAMA_BASE_URL` | URL do Ollama (default: `http://localhost:11434`) |
| `EMBEDDING_MODEL` | `nomic-embed-text` (Ollama) ou `text-embedding-3-small` (OpenAI) |
| `LLM_MODEL` | Modelo chat (default: `gpt-4o-mini`) |
| `STORAGE_PATH` | Diretório de uploads (default: `./storage`) |
| `MAX_UPLOAD_SIZE_MB` | Limite de upload (default: 50) |
| `PARSER_SERVICE_URL` | URL do parser Docling (default: `http://localhost:8000`) |
| `PARSER_SERVICE_TIMEOUT_MS` | Timeout HTTP para o parser (default: 120000) |

## Produção

- Defina `SEED_ADMIN_ENABLED=false` e `SEED_KNOWLEDGE_ENABLED=false`
- Troque `JWT_SECRET` e senhas do seed
- Configure `OPENAI_API_KEY` de produção
- Não commite o arquivo `.env`
