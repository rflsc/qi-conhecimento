# Qi Conhecimento — Documentação

## Estado do projeto

| Fase | Escopo | Status |
| --- | --- | --- |
| **Fase 1** | Admin conectado à API — CMS, listagem, busca texto | Concluída |
| **Fase 2** | Upload PDF/imagem/link, parsers, embeddings, RAG + LLM | Concluída |
| **Fase 2b** | Importação web em lote + extrator HTML (Readability) | Concluída |
| **Fase 3** | Canais via Qi Agents + service key + histórico `/queries` no admin | Quase concluída — falta teste ponta-a-ponta no canal |

## Mapa rápido

| Situação | Onde ir |
| --- | --- |
| **Deploy produção (Atlas + Render + Vercel)** | [deployment/production.md](./deployment/production.md) |
| **Deploy 100% grátis (sem cartão)** | [deployment/free-tier.md](./deployment/free-tier.md) |
| **Subir o projeto localmente** | [development/local-setup.md](./development/local-setup.md) |
| **Fluxo completo Docling + Ollama** | [development/phase-2.md](./development/phase-2.md) |
| **Fase 1 — admin conectado à API** | [development/phase-1.md](./development/phase-1.md) |
| **Fase 2 — ingestão multimodal + RAG** | [development/phase-2.md](./development/phase-2.md) |
| **Fase 3 — assistente de campo (Qi Agents)** | [development/phase-3.md](./development/phase-3.md) |
| **Integração Qi Agents ↔ API** | [integrations/qi-agents.md](./integrations/qi-agents.md) |
| **Histórico consultas de campo (`/queries`)** | [architecture/messaging.md](./architecture/messaging.md) · `GET /messaging/queries` · alimentado por `public-ask`, `/messaging/query` e admin |
| Entender o produto e escopo de negócio | [scope/product-vision.md](./scope/product-vision.md) |
| Arquitetura da API e módulos NestJS | [architecture/api.md](./architecture/api.md) |
| Autenticação, seed e login no admin | [architecture/auth.md](./architecture/auth.md) |
| Frontends (web/admin) | [architecture/frontend.md](./architecture/frontend.md) |
| Hub de conhecimento e RAG | [architecture/knowledge-rag.md](./architecture/knowledge-rag.md) |
| **Importação web em lote** | [architecture/web-import.md](./architecture/web-import.md) |
| **Parar filas BullMQ** | `pnpm purge:queues` — ver [web-import.md#operação-e-troubleshooting](./architecture/web-import.md#operação-e-troubleshooting) |
| **Redis / Upstash (filas BullMQ)** | [patterns.md#filas-bullmq-upstash](./architecture/patterns.md#filas-bullmq-upstash) |
| **Índice vetorial Atlas (M0)** | [knowledge-rag.md#atlas-vector-search](./architecture/knowledge-rag.md#atlas-vector-search) · `node scripts/create-vector-index.mjs` |
| **Eval RAG (regressão)** | `pnpm --filter @qi-conhecimento/api eval:rag` — [knowledge-rag.md#suite-de-eval-rag](./architecture/knowledge-rag.md#suite-de-eval-rag) |
| **Docling — evolução e roadmap** | [architecture/docling.md](./architecture/docling.md) |
| Parser service (FastAPI + Docling) | [architecture/parser-service.md](./architecture/parser-service.md) |
| Assistente de campo (RAG + Qi Agents) | [architecture/messaging.md](./architecture/messaging.md) |
| Design system (tema escuro) | [architecture/design-system.md](./architecture/design-system.md) |
| Padrões transversais | [architecture/patterns.md](./architecture/patterns.md) |
| Decisões arquiteturais (ADRs) | [decisions/000-template.md](./decisions/000-template.md) |

## URLs locais (dev)

| App | URL |
| --- | --- |
| API + Swagger | http://localhost:3100/api |
| Parser service | http://localhost:8000/docs |
| Web (landing) | http://localhost:3101 |
| Admin (login) | http://localhost:3102/login |
| Admin (importar) | http://localhost:3102/import |
| Health check | http://localhost:3100/health |

## Pilares do produto

1. **Hub de Entrada Multimodal** — `apps/admin` + módulos `knowledge` e `ingestion` na API
2. **Esteira RAG** — filas BullMQ, parsers Docling, embeddings Ollama/OpenAI, busca híbrida + LLM Anthropic/OpenAI
3. **Interface de Campo** — `POST /messaging/query` (RAG); canais WhatsApp/Telegram no **Qi Agents**
