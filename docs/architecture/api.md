# Arquitetura da API

## Stack

- NestJS 11 · MongoDB (Mongoose) · Redis (BullMQ) · Passport JWT · nestjs-pino · Swagger `/api`
- Porta padrão: **3100** (`PORT` no `.env`)

## Configuração de ambiente

A API carrega variáveis do **`.env` na raiz do monorepo**, não de `apps/api/.env`:

```typescript
// apps/api/src/app.module.ts
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: [join(__dirname, '../../../.env'), '.env'],
}),
```

Isso garante que `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET` e `SEED_ADMIN_*` sejam encontrados quando o Turbo executa a API com cwd em `apps/api`.

## CORS

Habilitado em `main.ts` para os frontends locais:

- `http://localhost:3101` (web)
- `http://localhost:3102` (admin)

## Módulos

| Módulo | Responsabilidade |
| --- | --- |
| `auth` | Register, login, refresh, logout, `/auth/me` |
| `users` | CRUD com soft delete, RBAC e seed admin |
| `health` | Health check (`GET /health`) |
| `knowledge` | Documentos, chunks, busca híbrida (Pilar 1 + 2) |
| `ingestion` | Processadores BullMQ — PDF, OCR, embeddings |
| `messaging` | Assistente de campo, webhooks WhatsApp (Pilar 3) |

## Seed admin (`AdminSeedService`)

Executado em `OnModuleInit` quando `SEED_ADMIN_ENABLED=true`:

1. Lê `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` do `.env`
2. Se o e-mail **não existir**, cria usuário com role `admin`
3. Se já existir, registra log e segue (idempotente)

## Fluxo por camada

`Request → Controller (DTO) → Service (lógica) → Repository (query) → MongoDB`

## Filas

| Fila | Jobs |
| --- | --- |
| `ingestion` | `process-document`, `generate-embeddings` |
| `messaging` | `send-field-response` (futuro) |

## Collections MongoDB

- `users`
- `knowledge_documents`
- `knowledge_chunks` (text index para busca híbrida MVP)
- `field_queries`

## Endpoints úteis

| Método | Path | Descrição |
| --- | --- | --- |
| GET | `/health` | Status da API |
| GET | `/api` | Swagger UI |
| POST | `/auth/login` | Login email/senha |
| POST | `/auth/register` | Criar conta |
