# Autenticação

## Estratégias Passport

| Strategy | Uso |
| --- | --- |
| `LocalStrategy` | `POST /auth/login` |
| `JwtStrategy` | Guard global (bypass via `@PublicAccess()` ou `@ServiceAccess()` com `X-Service-Key`) |

## Integração serviço-a-serviço (Qi Agents)

Rotas marcadas com `@ServiceAccess()` (ex.: `POST /messaging/query`):

- Com `SERVICE_API_KEY` no `.env` → exige header `X-Service-Key` **ou** JWT de admin (testes no painel).
- Sem `SERVICE_API_KEY` (dev) → rota aberta; log de aviso uma vez por processo.

`POST /knowledge/public-ask` permanece `@PublicAccess()` (landing web) e persiste consultas em `field_queries` (canal `web`).

Credenciais do qi-agents cadastram-se no **admin do qi-agent → Integrações** (API Key + header `X-Service-Key`), não em env por API.

## Tokens

- **Access:** JWT 15 min — payload `{ sub, email, role }`
- **Refresh:** UUID opaco, 7 dias, `bcrypt(10)` no User
- **Rotação:** refresh revoga token anterior e emite novo par

## Endpoints

| Método | Path | Guard |
| --- | --- | --- |
| POST | `/auth/register` | público |
| POST | `/auth/login` | LocalAuthGuard |
| POST | `/auth/refresh` | público |
| POST | `/auth/logout` | JwtAuthGuard |
| GET | `/auth/me` | JwtAuthGuard |

## Seed admin (dev)

Com `SEED_ADMIN_ENABLED=true` no `.env` da raiz, a API cria automaticamente um admin na **primeira subida** (serviço `AdminSeedService`):

| Variável | Default |
| --- | --- |
| `SEED_ADMIN_ENABLED` | `true` |
| `SEED_ADMIN_EMAIL` | `admin@altoqi.com.br` |
| `SEED_ADMIN_PASSWORD` | `AdminQi123!` |
| `SEED_ADMIN_NAME` | `Admin Qi` |

- Role criada: **`admin`** (acesso total ao painel)
- Idempotente: se o e-mail já existir, o seed é ignorado
- **Produção:** `SEED_ADMIN_ENABLED=false`

## Seed conhecimento (dev)

Com `SEED_KNOWLEDGE_ENABLED=true`, a API cria 3 procedimentos piloto (NBR 8160, NBR 5410) na primeira subida se não houver chunks. Idempotente.

## Login no admin (`apps/admin`)

### Fluxo

1. Usuário submete e-mail/senha em `/login`
2. Frontend faz `POST {NEXT_PUBLIC_API_URL}/auth/login` (porta 3100)
3. API retorna `{ accessToken, refreshToken }`
4. Frontend grava `access_token` em cookie (`path=/`, `max-age=900`)
5. Redireciona para `/dashboard`
6. Middleware Next.js (`middleware.ts`) valida cookie em rotas protegidas

### Requisitos

- `NEXT_PUBLIC_API_URL=http://localhost:3100` no `.env` da raiz
- CORS habilitado na API para `localhost:3102`
- Reiniciar `pnpm dev` após alterar variáveis `NEXT_PUBLIC_*`

### Feedback de erro

A tela de login exibe mensagens para:

- Credenciais inválidas (401)
- API inacessível (falha de rede / CORS / API offline)

## Frontend

- **Admin:** cookie `access_token` + middleware Next.js — http://localhost:3102
- **Web:** landing pública — http://localhost:3101

## RBAC

| Role | Acesso |
| --- | --- |
| `admin` | CRUD usuários, ingestão (upload/link/CMS), busca |
| `editor` | Ingestão, CMS, busca |
| `user` | Busca, consultas de campo (`/messaging/query`) |

Endpoints de conhecimento exigem `admin` ou `editor` para ingestão; busca permite `user`.
