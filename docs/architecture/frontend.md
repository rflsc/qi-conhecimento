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
│   ├── documents/         → listagem de documentos técnicos
│   ├── manual-content/    → CMS interno (Markdown)
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

## Estado (futuro)

Redux Toolkit + RTK Query conforme scaffold — estrutura base pronta nos `package.json`, integração com API pendente nas telas de ingestão.
