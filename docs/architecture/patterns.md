# Padrões Transversais

## Backend (API)

- Soft delete via `deletedAt` — nunca `deleteOne()`
- Logger: `nestjs-pino` — nunca `console.log`
- Eventos: `DomainEvents.*` via EventEmitter2
- ValidationPipe global: `whitelist` + `forbidNonWhitelisted`
- Erros: `HttpExceptionFilter` com formato padronizado
- Swagger obrigatório em endpoints da API
- TypeScript strict — sem `any`
- `.env` da raiz carregado via `ConfigModule` com path absoluto a partir de `dist/`
- CORS habilitado para frontends locais (3101, 3102)

## Seed admin

- `SEED_ADMIN_ENABLED=true` cria usuário admin na primeira subida (`AdminSeedService`)
- Idempotente — não sobrescreve usuário existente
- Desative em produção: `SEED_ADMIN_ENABLED=false`

## Monorepo / Dev

- Gerenciador: pnpm workspaces + Turborepo
- **`pnpm dev`** executa `predev` antes de subir os apps
- `scripts/kill-dev-ports.mjs` libera portas 3100–3102 (evita `EADDRINUSE`)
- Variáveis compartilhadas no `.env` da raiz — não duplicar por app
- Next.js apps carregam root `.env` via `loadEnvConfig` no `next.config.js`
- Artefatos `.js` compilados em `apps/api/src/` são ignorados no git e não devem existir (quebram `nest start --watch`)

## Frontend

- Tema escuro slate/emerald — ver [design-system.md](./design-system.md)
- i18n obrigatório — 4 idiomas (pt, en, fr, es)
- Texto visível sempre via `t()` — nunca hardcoded no JSX

## Git

- Nunca commitar `.env` — apenas `.env.example`
- `node_modules`, `dist`, `.next`, `storage/`, `infra/data/` ignorados
