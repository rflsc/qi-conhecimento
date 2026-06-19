# Qi Conhecimento — Documentação

## Estado do projeto

| Fase | Escopo | Status |
| --- | --- | --- |
| **Fase 1** | Admin conectado à API — CMS, listagem, busca texto | Concluída |
| **Fase 2** | Upload PDF/imagem/link, parsers, embeddings, RAG + LLM | Concluída |
| **Fase 3** | WhatsApp completo, Whisper, Telegram, histórico no admin | Planejada |

## Mapa rápido

| Situação | Onde ir |
| --- | --- |
| **Deploy produção (Atlas + Render + Vercel)** | [deployment/production.md](./deployment/production.md) |
| **Deploy 100% grátis (sem cartão)** | [deployment/free-tier.md](./deployment/free-tier.md) |
| **Subir o projeto localmente** | [development/local-setup.md](./development/local-setup.md) |
| **Fluxo completo Docling + Ollama** | [development/phase-2.md](./development/phase-2.md) |
| **Fase 1 — admin conectado à API** | [development/phase-1.md](./development/phase-1.md) |
| **Fase 2 — ingestão multimodal + RAG** | [development/phase-2.md](./development/phase-2.md) |
| Entender o produto e escopo de negócio | [scope/product-vision.md](./scope/product-vision.md) |
| Arquitetura da API e módulos NestJS | [architecture/api.md](./architecture/api.md) |
| Autenticação, seed e login no admin | [architecture/auth.md](./architecture/auth.md) |
| Frontends (web/admin) | [architecture/frontend.md](./architecture/frontend.md) |
| Hub de conhecimento e RAG | [architecture/knowledge-rag.md](./architecture/knowledge-rag.md) |
| **Eval RAG (regressão)** | `pnpm --filter @qi-conhecimento/api eval:rag` — [knowledge-rag.md#suite-de-eval-rag](./architecture/knowledge-rag.md#suite-de-eval-rag) |
| **Docling — evolução e roadmap** | [architecture/docling.md](./architecture/docling.md) |
| Parser service (FastAPI + Docling) | [architecture/parser-service.md](./architecture/parser-service.md) |
| Assistente de campo (WhatsApp/Telegram) | [architecture/messaging.md](./architecture/messaging.md) |
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
3. **Interface de Campo** — módulo `messaging` + integrações WhatsApp/Telegram (parcial)
