# Qi Conhecimento

Ecossistema de Conhecimento Técnico para Engenharia Civil e Instalações — Hub multimodal com RAG e assistente de campo via mensageria.

> Produto alinhado ao ecossistema AltoQi (prefixo **Qi**).

## Pilares

1. **Hub de Entrada Multimodal** — backoffice admin para ingestão (PDF, imagem, link, CMS)
2. **Motor RAG** — padronização Markdown, chunking, embeddings, busca híbrida + LLM
3. **Assistente de Obra** — RAG via `POST /messaging/query`; canais WhatsApp/Telegram no **[Qi Agents](docs/integrations/qi-agents.md)**

## Stack

| App | Tecnologia | Porta |
| --- | --- | --- |
| `apps/api` | NestJS 11, MongoDB, Redis, BullMQ, OpenAI/Ollama | 3100 |
| `apps/web` | Next.js 15 | 3101 |
| `apps/admin` | Next.js 15, RTK Query | 3102 |
| `apps/parser` | Python, FastAPI, Docling *(opcional)* | 8000 |

## Pré-requisitos

- Node.js 20+
- pnpm 9+
- Docker Desktop (MongoDB + Redis)
- Python 3.12 *(opcional — parser Docling local)*
- [Ollama](https://ollama.com) *(opcional — embeddings locais gratuitos)*
- Chave OpenAI *(opcional — LLM e OCR sem Docling)*

## Setup rápido

```bash
pnpm install
copy .env.example .env          # Windows
pnpm infra:up                     # MongoDB + Redis
pnpm parser:setup && pnpm parser:dev   # Docling — terminal separado (opcional)
# Ollama: instale e rode `ollama pull nomic-embed-text` (embeddings grátis)
pnpm dev
```

Para subir **API + admin + web + parser** juntos: `pnpm dev:all`.

O `predev` libera as portas 3100–3102 automaticamente antes de subir os apps.

## Primeiro acesso (admin)

| | |
| --- | --- |
| URL | http://localhost:3102/login |
| E-mail | `admin@altoqi.com.br` |
| Senha | `AdminQi123!` |

Criado automaticamente pelo seed (`SEED_ADMIN_ENABLED=true`). Detalhes em [docs/development/local-setup.md](./docs/development/local-setup.md).

## URLs locais

| Serviço | URL |
| --- | --- |
| Swagger | http://localhost:3100/api |
| Health | http://localhost:3100/health |
| Web | http://localhost:3101 |
| Admin | http://localhost:3102/login |
| Importar | http://localhost:3102/import |
| Importar site | http://localhost:3102/web-import |

| Parser (Docling) | http://localhost:8000/docs |

## Comandos

```bash
pnpm infra:up                                     # MongoDB + Redis (Docker)
pnpm dev                                          # API + web + admin
pnpm dev:all                                      # + parser Docling
pnpm parser:setup                                 # venv Python + Docling (1ª vez)
pnpm parser:dev                                   # parser na porta 8000
pnpm parser:docker                                # parser via Docker (profile)
pnpm --filter @qi-conhecimento/shared-types build # após alterar shared-types
pnpm build                                        # build completo
pnpm lint
pnpm typecheck
pnpm test
```

## Documentação

Mapa completo: [docs/index.md](./docs/index.md)

| Tópico | Arquivo |
| --- | --- |
| **Deploy produção (Atlas + Render + Vercel)** | [docs/deployment/production.md](./docs/deployment/production.md) |
| Setup local e troubleshooting | [docs/development/local-setup.md](./docs/development/local-setup.md) |
| Fase 1 — admin + CMS + busca | [docs/development/phase-1.md](./docs/development/phase-1.md) |
| Fase 2 — ingestão + RAG + LLM | [docs/development/phase-2.md](./docs/development/phase-2.md) |
| Fase 3 — assistente de campo (Qi Agents) | [docs/development/phase-3.md](./docs/development/phase-3.md) |
| Integração Qi Agents ↔ API | [docs/integrations/qi-agents.md](./docs/integrations/qi-agents.md) |
| Visão de produto | [docs/scope/product-vision.md](./docs/scope/product-vision.md) |
| Conhecimento e RAG | [docs/architecture/knowledge-rag.md](./docs/architecture/knowledge-rag.md) |
| Importação web | [docs/architecture/web-import.md](./docs/architecture/web-import.md) |
| API (módulos e endpoints) | [docs/architecture/api.md](./docs/architecture/api.md) |
| Autenticação e seed | [docs/architecture/auth.md](./docs/architecture/auth.md) |
| Frontends | [docs/architecture/frontend.md](./docs/architecture/frontend.md) |
| Mensageria / RAG de campo | [docs/architecture/messaging.md](./docs/architecture/messaging.md) |

## Estrutura do monorepo

```
qi-conhecimento/
├── apps/
│   ├── api/       → Backend NestJS + RAG (`/messaging/query` para Qi Agents)
│   ├── web/       → Landing pública
│   └── admin/     → Hub de entrada multimodal
├── packages/      → Tipos, validators, utils, api-client
├── scripts/       → kill-dev-ports, setup/dev parser
├── infra/         → docker-compose (Mongo + Redis)
├── storage/       → uploads multimodais (gitignored)
└── docs/          → Arquitetura e escopo de negócio
```

## Estado das fases

| Fase | Entrega | Status |
| --- | --- | --- |
| 1 | Admin conectado à API — CMS, listagem, busca texto | Concluída |
| 2 | Upload PDF/imagem/link, parsers, embeddings, RAG + LLM | Concluída |
| 3 | Canais via Qi Agents + histórico no admin | Quase concluída |

## Próximos passos (Fase 3)

Canais WhatsApp/Telegram ficam no **[Qi Agents](docs/integrations/qi-agents.md)** — este projeto expõe o RAG em `POST /messaging/query`.

**Qi Agents:** conectar canal → `/messaging/query` (header `X-Service-Key`); áudio, webhooks e envio.

**Qi Conhecimento:** service key (`X-Service-Key`) e admin `/queries` entregues; ver [phase-3.md](docs/development/phase-3.md).
