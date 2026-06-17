# Fase 1 — Admin conectado à API

Entrega concluída: ciclo mínimo **Pilar 1 → Pilar 2** funcional via painel admin.

## O que foi implementado

### API (`apps/api`)

| Endpoint | Descrição |
| --- | --- |
| `GET /knowledge/stats` | Totais de documentos e chunks |
| `GET /knowledge/documents` | Listagem paginada |
| `GET /knowledge/chunks` | Listagem de pílulas de conhecimento |
| `POST /knowledge/cms` | CMS — documento + Markdown em uma operação |
| `POST /knowledge/search` | Busca híbrida (text index MongoDB) |

- Respostas serializadas com `id` (não `_id`)
- Seed piloto: `SEED_KNOWLEDGE_ENABLED=true` — 3 procedimentos (NBR 8160, NBR 5410)

### Admin (`apps/admin`)

- **Redux Toolkit + RTK Query** (`src/store/api.ts`)
- **JWT** via cookie `access_token` em todas as chamadas
- **Dashboard** — stats ao vivo + atalho para busca
- **Documentos** — abas Documentos / Pílulas
- **CMS interno** — formulário com validação Zod + toast
- **Busca** — consulta com filtro de especialidade e citações

## Como testar

1. `pnpm dev` (API + admin)
2. Login: http://localhost:3102/login (`admin@altoqi.com.br` / `AdminQi123!`)
3. **Documentos** — ver 3 entradas piloto (se seed rodou)
4. **CMS interno** — criar novo procedimento
5. **Busca** — ex.: `recuo tubo esgoto` com filtro Hidráulica

## Variáveis de ambiente

```env
SEED_KNOWLEDGE_ENABLED=true   # procedimentos piloto na 1ª subida
SEED_ADMIN_ENABLED=true       # usuário admin
NEXT_PUBLIC_API_URL=http://localhost:3100
```

## Próxima fase

Ver [phase-2.md](./phase-2.md) — ingestão multimodal, embeddings e RAG com LLM.
