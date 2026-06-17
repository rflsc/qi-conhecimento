# Qi Conhecimento

Ecossistema de Conhecimento Técnico para Engenharia Civil e Instalações — Hub multimodal com RAG e assistente de campo via mensageria.

> Produto alinhado ao ecossistema AltoQi (prefixo **Qi**).

## Pilares

1. **Hub de Entrada Multimodal** — backoffice admin para ingestão (PDF, imagem, link, CMS)
2. **Motor RAG** — padronização Markdown, chunking, metadados, busca híbrida
3. **Assistente de Obra** — WhatsApp/Telegram com respostas citadas

## Stack

| App | Tecnologia | Porta |
| --- | --- | --- |
| `apps/api` | NestJS 11, MongoDB, Redis, BullMQ | 3100 |
| `apps/web` | Next.js 15 | 3101 |
| `apps/admin` | Next.js 15 (painel) | 3102 |

## Pré-requisitos

- Node.js 20+
- pnpm 9+
- Docker Desktop (MongoDB + Redis)

## Setup rápido

```bash
pnpm install
copy .env.example .env          # Windows
docker compose -f infra/docker-compose.dev.yml up -d
pnpm dev
```

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

## Comandos

```bash
pnpm dev                                          # todos os apps
pnpm --filter @qi-conhecimento/api dev            # só API
pnpm --filter @qi-conhecimento/web dev            # só web
pnpm --filter @qi-conhecimento/admin dev          # só admin
pnpm build                                        # build completo
pnpm lint                                         # lint
pnpm typecheck                                    # typecheck
pnpm test                                         # testes
```

## Documentação

Mapa completo: [docs/index.md](./docs/index.md)

| Tópico | Arquivo |
| --- | --- |
| Setup local e troubleshooting | [docs/development/local-setup.md](./docs/development/local-setup.md) |
| Visão de produto | [docs/scope/product-vision.md](./docs/scope/product-vision.md) |
| Autenticação e seed | [docs/architecture/auth.md](./docs/architecture/auth.md) |
| Frontends | [docs/architecture/frontend.md](./docs/architecture/frontend.md) |

## Estrutura do monorepo

```
qi-conhecimento/
├── apps/
│   ├── api/       → Backend NestJS + RAG + mensageria
│   ├── web/       → Landing pública
│   └── admin/     → Hub de entrada multimodal
├── packages/      → Tipos, validators, utils, api-client
├── scripts/       → kill-dev-ports.mjs (predev)
├── infra/         → docker-compose (Mongo + Redis)
└── docs/          → Arquitetura e escopo de negócio
```

## Próximos passos

- Implementar parsers PDF/HTML e OCR
- Integrar embeddings e vector store
- Conectar WhatsApp Cloud API e transcrição de áudio
- Popular base com NBRs e procedimentos internos
