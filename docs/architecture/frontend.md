# Frontends (Web e Admin)

## Apps

| App | Porta | Propósito |
| --- | --- | --- |
| `apps/web` | 3101 | Landing pública — apresentação dos 3 pilares |
| `apps/admin` | 3102 | Backoffice — Hub de Entrada Multimodal |

## Variáveis de ambiente

Ambos os apps leem o **`.env` da raiz** via `loadEnvConfig` no `next.config.js`:

```javascript
const path = require('path');
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(path.join(__dirname, '../..'));
```

Variável essencial:

```env
NEXT_PUBLIC_API_URL=http://localhost:3100
```

> Após alterar `NEXT_PUBLIC_*`, reinicie `pnpm dev`.

## Admin — estrutura de rotas

```
apps/admin/src/app/
├── (auth)/login/          → tela de login (pública)
├── (panel)/
│   ├── dashboard/         → hub multimodal (cards Pilar 1)
│   ├── import/            → upload PDF, imagem, link, Markdown
│   ├── web-import/        → importação web em lote + configurações globais
│   ├── documents/         → listagem de documentos técnicos
│   ├── manual-content/    → CMS interno (Markdown)
│   ├── search/            → busca híbrida de conhecimento
│   ├── specialties/       → módulos de especialidade
│   └── queries/           → histórico de consultas de campo
└── middleware.ts          → proteção JWT via cookie
```

## Admin — middleware

- Rotas públicas: `/login`
- Demais rotas exigem cookie `access_token`
- Usuário autenticado em `/login` → redirect para `/dashboard`

## Web — estrutura

```
apps/web/src/app/
├── page.tsx               → landing com pilares e especialidades
└── containers/HomePage.tsx
```

Link para o admin: http://localhost:3102/login

## i18n

Idiomas obrigatórios: `pt`, `en`, `fr`, `es`

Arquivos: `src/locales/{pt,en,fr,es}/common.json`

Idioma padrão: `pt`

## Design system

Tema escuro slate/emerald — ver [design-system.md](./design-system.md)

## Estado (Fase 2 — concluída)

Redux Toolkit + RTK Query em `src/store/api.ts`, com JWT via cookie `access_token`.

| Tela | Endpoint(s) | Notas |
| --- | --- | --- |
| Dashboard | `GET /knowledge/stats` | Inclui contagem de embeddings |
| Importar | `POST /knowledge/documents/upload`, `POST /knowledge/documents/import-link`, upload Markdown | |
| Importar site | `GET/PATCH /knowledge/web-imports/settings`, `POST /knowledge/web-imports`, SSE `…/stream` | Configurações globais no topo da tela |
| Documentos | `GET /knowledge/documents`, `GET /knowledge/chunks` | Badge `embedding ✓`; **Cancelar** enquanto embeddings pendentes |
| Documentos (ação) | `POST /knowledge/documents/{id}/cancel-ingestion` | Parse, chunking ou fila de embeddings |
| Console ingestão | `GET /knowledge/documents/{id}/ingestion-stream` | SSE — fases, progresso Docling, barra embeddings |
| Console (OCR) | `POST .../reprocess-with-ocr`, `POST .../dismiss-ocr-retry` | Oferta quando extração baixa |
| CMS interno | `POST /knowledge/cms` | |
| Busca | `POST /knowledge/search` | Híbrida com Ollama ou OpenAI |
| Assistente (teste) | `POST /messaging/query` | Modo assistente em `/search`; canal `admin` em `field_queries` |
| Histórico consultas | `GET /messaging/queries` | Painel `/queries` — WhatsApp, Telegram, web e admin |

Detalhes: [development/phase-1.md](../development/phase-1.md), [development/phase-2.md](../development/phase-2.md)

## Próximas entregas (Fase 3)

Canais via **[Qi Agents](../integrations/qi-agents.md)**; neste repo: API key em `/messaging/query`, admin `/queries` e auditoria de `public-ask` em `field_queries`. Ver [phase-3.md](../development/phase-3.md).
