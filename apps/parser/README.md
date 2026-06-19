# Parser Service (`apps/parser`)

Microserviço Python (FastAPI + [Docling](https://github.com/docling-project/docling)) para converter PDFs e imagens em **Markdown estruturado**.

A API NestJS chama via `DoclingClient` quando `PARSER_SERVICE_URL` está no `.env`. Sem o serviço, usa fallback `pdf-parse` (PDF) ou Vision API (imagem).

## Contrato HTTP

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/health` | `{ "status": "ok", "engine": "docling" }` |
| `POST` | `/v1/parse` | `multipart/form-data` — `file`, opcional `do_ocr`, `job_id` |
| `GET` | `/v1/parse/progress/{job_id}` | Progresso (páginas, lote, mensagem) |

## Rodar localmente (recomendado)

Na **raiz do monorepo**:

```bash
pnpm parser:setup    # cria .venv + pip install (usa Python 3.12 no Windows)
pnpm parser:dev      # http://localhost:8000
```

Aguarde no log:

```
Parser service pronto
Application startup complete
```

Verifique: `curl http://localhost:8000/health`

## Docker (alternativa)

```bash
pnpm parser:docker
```

Imagem grande; preferível `parser:dev` em desenvolvimento.

## Python manual

```bash
cd apps/parser
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

> Docling **não** suporta Python 3.14. Use 3.11 ou 3.12.

## Variáveis de ambiente

| Variável | Default | Uso |
| --- | --- | --- |
| `PARSER_PROFILE` | `default` | `default` \| `low_memory` \| `high_memory` (32 GB → `high_memory`) |
| `PARSER_DO_OCR` | `false` | OCR em PDFs escaneados (lento, mais RAM) |
| `PARSER_PAGE_BATCH_SIZE` | conforme perfil | Sobrescreve páginas por lote |
| `PARSER_PARALLEL_WORKERS` | conforme perfil | `1` = sequencial; `2` no `high_memory` |
| `PARSER_IMAGES_SCALE` | `1.0` | Escala das imagens (2.0 ≈ 4× RAM) |
| `PARSER_THREADS_PER_WORKER` | `0` (auto) | Threads torch por worker |
| `PARSER_DO_TABLE_STRUCTURE` | `true` | TableFormer |
| `PARSER_TABLE_MODE` | `accurate` | `accurate` \| `fast` |
| `PARSER_TABLE_IMAGE_RECOVERY` | `true` | Recupera tabelas via texto do PDF |

### Perfis (`PARSER_PROFILE`)

| Perfil | Workers | Lote base | PDF longo (279 p.) |
| --- | --- | --- | --- |
| `default` | 1 | 8 | lote 4, 1 worker |
| `low_memory` | 1 | 4 | lote 3, 1 worker |
| `high_memory` | 2 | 12 | lote 8, 2 workers |

O `pnpm parser:dev` carrega `PARSER_PROFILE` do `.env` da raiz do monorepo.

PDFs longos são processados em lotes (`PARSER_PAGE_BATCH_SIZE`); o conversor Docling é reutilizado entre lotes. Envie `job_id` no POST e consulte `/v1/parse/progress/{job_id}` para acompanhar páginas processadas.

## Integração com a API

```env
PARSER_SERVICE_URL=http://localhost:8000
PARSER_SERVICE_TIMEOUT_MS=7200000
PARSER_MAX_UPLOAD_MB=150
```

Documentação: [docs/architecture/parser-service.md](../../docs/architecture/parser-service.md) · [docs/architecture/docling.md](../../docs/architecture/docling.md) (evolução e roadmap)
