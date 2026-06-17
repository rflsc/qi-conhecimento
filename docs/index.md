# Qi Conhecimento — Documentação

## Mapa rápido

| Situação | Onde ir |
| --- | --- |
| Entender o produto e escopo de negócio | [scope/product-vision.md](./scope/product-vision.md) |
| Arquitetura da API e módulos NestJS | [architecture/api.md](./architecture/api.md) |
| Autenticação e tokens | [architecture/auth.md](./architecture/auth.md) |
| Hub de conhecimento e RAG | [architecture/knowledge-rag.md](./architecture/knowledge-rag.md) |
| Assistente de campo (WhatsApp/Telegram) | [architecture/messaging.md](./architecture/messaging.md) |
| Design system (tema escuro) | [architecture/design-system.md](./architecture/design-system.md) |
| Padrões transversais | [architecture/patterns.md](./architecture/patterns.md) |
| Decisões arquiteturais (ADRs) | [decisions/000-template.md](./decisions/000-template.md) |

## Pilares do produto

1. **Hub de Entrada Multimodal** — `apps/admin` + módulo `knowledge` na API
2. **Esteira RAG** — filas BullMQ + módulo `ingestion` + busca híbrida
3. **Interface de Campo** — módulo `messaging` + integrações WhatsApp/Telegram
