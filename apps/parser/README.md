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
| `PARSER_DO_OCR` | `false` | OCR em PDFs escaneados (lento, mais RAM) |
| `PARSER_LOW_MEMORY` | `true` | Backend pypdfium2 — evita `std::bad_alloc` |
| `PARSER_PAGE_BATCH_SIZE` | `15` | Páginas por lote (`0` = arquivo inteiro) |
| `PARSER_DO_TABLE_STRUCTURE` | `true` | Extrai estrutura de tabelas (linhas/colunas/células) |
| `PARSER_TABLE_MODE` | `accurate` | TableFormer: `accurate` (melhor) ou `fast` (mais rápido) |
| `PARSER_TABLE_CELL_MATCHING` | `true` | Casa células com texto do PDF (PDF com texto selecionável) |

PDFs longos são processados em lotes (`PARSER_PAGE_BATCH_SIZE`); o conversor Docling é reutilizado entre lotes. Envie `job_id` no POST e consulte `/v1/parse/progress/{job_id}` para acompanhar páginas processadas.

## Integração com a API

```env
PARSER_SERVICE_URL=http://localhost:8000
PARSER_SERVICE_TIMEOUT_MS=7200000
PARSER_MAX_UPLOAD_MB=150
```

Documentação: [docs/architecture/parser-service.md](../../docs/architecture/parser-service.md)
