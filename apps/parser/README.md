# Parser Service (`apps/parser`)

Microserviço Python (FastAPI + [Docling](https://github.com/docling-project/docling)) para converter PDFs e imagens em **Markdown estruturado**.

A API NestJS chama via `DoclingClient` quando `PARSER_SERVICE_URL` está no `.env`. Sem o serviço, usa fallback `pdf-parse` (PDF) ou Vision API (imagem).

## Contrato HTTP

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/health` | `{ "status": "ok", "engine": "docling" }` |
| `POST` | `/v1/parse` | `multipart/form-data` com campo `file` |

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

## Integração com a API

```env
PARSER_SERVICE_URL=http://localhost:8000
PARSER_SERVICE_TIMEOUT_MS=120000
```

Documentação: [docs/architecture/parser-service.md](../../docs/architecture/parser-service.md)
