# Qi Conhecimento — Documentação

## Mapa rápido

| Situação | Onde ir |
| --- | --- |
| **Subir o projeto localmente** | [development/local-setup.md](./development/local-setup.md) |
| Entender o produto e escopo de negócio | [scope/product-vision.md](./scope/product-vision.md) |
| Arquitetura da API e módulos NestJS | [architecture/api.md](./architecture/api.md) |
| Autenticação, seed e login no admin | [architecture/auth.md](./architecture/auth.md) |
| Frontends (web/admin) | [architecture/frontend.md](./architecture/frontend.md) |
| Hub de conhecimento e RAG | [architecture/knowledge-rag.md](./architecture/knowledge-rag.md) |
| Assistente de campo (WhatsApp/Telegram) | [architecture/messaging.md](./architecture/messaging.md) |
| Design system (tema escuro) | [architecture/design-system.md](./architecture/design-system.md) |
| Padrões transversais | [architecture/patterns.md](./architecture/patterns.md) |
| Decisões arquiteturais (ADRs) | [decisions/000-template.md](./decisions/000-template.md) |

## URLs locais (dev)

| App | URL |
| --- | --- |
| API + Swagger | http://localhost:3100/api |
| Web (landing) | http://localhost:3101 |
| Admin (login) | http://localhost:3102/login |
| Health check | http://localhost:3100/health |

## Pilares do produto

1. **Hub de Entrada Multimodal** — `apps/admin` + módulo `knowledge` na API
2. **Esteira RAG** — filas BullMQ + módulo `ingestion` + busca híbrida
3. **Interface de Campo** — módulo `messaging` + integrações WhatsApp/Telegram
