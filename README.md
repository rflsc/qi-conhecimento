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
- Docker (MongoDB + Redis)

## Setup

```bash
# Instalar dependências
pnpm install

# Copiar variáveis de ambiente
cp .env.example .env

# Subir infraestrutura local
docker compose -f infra/docker-compose.dev.yml up -d

# Desenvolvimento (todos os apps)
pnpm dev
```

## Comandos individuais

```bash
pnpm --filter @qi-conhecimento/api dev
pnpm --filter @qi-conhecimento/web dev
pnpm --filter @qi-conhecimento/admin dev
```

## Documentação

Ver [docs/index.md](./docs/index.md) — inclui visão de produto completa em [docs/scope/product-vision.md](./docs/scope/product-vision.md).

## Swagger

Com a API rodando: http://localhost:3100/api

## Estrutura do monorepo

```
qi-conhecimento/
├── apps/
│   ├── api/       → Backend NestJS + RAG + mensageria
│   ├── web/       → Landing pública
│   └── admin/     → Hub de entrada multimodal
├── packages/      → Tipos, validators, utils, api-client
├── infra/         → docker-compose (Mongo + Redis)
└── docs/          → Arquitetura e escopo de negócio
```

## Próximos passos

- Implementar parsers PDF/HTML e OCR
- Integrar embeddings e vector store
- Conectar WhatsApp Cloud API e transcrição de áudio
- Popular base com NBRs e procedimentos internos
