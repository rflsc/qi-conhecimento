# Setup local

Guia para rodar o monorepo **qi-conhecimento** em desenvolvimento.

## Pré-requisitos

- Node.js 20+
- pnpm 9+
- Docker Desktop (MongoDB + Redis)

## 1. Instalação

```bash
pnpm install
cp .env.example .env   # Windows: copy .env.example .env
```

Todas as variáveis ficam no **`.env` da raiz** do monorepo. Tanto a API quanto os apps Next.js (`web`, `admin`) leem esse arquivo.

## 2. Infraestrutura

```bash
docker compose -f infra/docker-compose.dev.yml up -d
```

| Serviço | Porta | Variável |
| --- | --- | --- |
| MongoDB | 27017 | `MONGODB_URI` |
| Redis | 6379 | `REDIS_URL` |

## 3. Desenvolvimento

```bash
pnpm dev
```

O script `predev` libera automaticamente as portas **3100, 3101 e 3102** antes de subir os apps (evita `EADDRINUSE` ao reiniciar).

| App | Porta | Comando individual |
| --- | --- | --- |
| API | 3100 | `pnpm --filter @qi-conhecimento/api dev` |
| Web | 3101 | `pnpm --filter @qi-conhecimento/web dev` |
| Admin | 3102 | `pnpm --filter @qi-conhecimento/admin dev` |

## 4. Primeiro acesso (admin)

Com `SEED_ADMIN_ENABLED=true` (padrão em dev), a API cria um usuário admin na primeira subida:

| Campo | Valor |
| --- | --- |
| URL | http://localhost:3102/login |
| E-mail | `admin@altoqi.com.br` |
| Senha | `AdminQi123!` |

O seed **não recria** o usuário se o e-mail já existir. Para alterar credenciais, edite as variáveis `SEED_ADMIN_*` no `.env` **antes** da primeira subida, ou use `POST /auth/register` no Swagger.

## 5. Verificação rápida

```bash
# API saudável
curl http://localhost:3100/health

# Swagger
open http://localhost:3100/api
```

## Troubleshooting

### `EADDRINUSE` na porta 3100

Há uma instância antiga da API ainda rodando. Soluções:

1. Rode `pnpm dev` de novo — o `predev` mata processos nessas portas automaticamente
2. Manual (Windows):
   ```powershell
   netstat -ano | findstr ":3100"
   Stop-Process -Id <PID> -Force
   ```

### `Configuration key "MONGODB_URI" does not exist`

A API não encontrou o `.env` da raiz. Verifique que `apps/api/src/app.module.ts` aponta para `../../../.env` e que o arquivo existe na raiz do monorepo.

### Login no admin não faz nada / erro de conexão

1. Confirme que a API está em http://localhost:3100/health
2. Verifique `NEXT_PUBLIC_API_URL=http://localhost:3100` no `.env` da raiz
3. Reinicie `pnpm dev` após alterar variáveis `NEXT_PUBLIC_*` (Next.js as embute no build)
4. A API precisa de CORS habilitado para `localhost:3102` (já configurado em `main.ts`)

### Docker não está rodando

Erros de conexão MongoDB/Redis. Inicie o Docker Desktop e rode:

```bash
docker compose -f infra/docker-compose.dev.yml up -d
```

### Múltiplos `pnpm dev`

Execute **apenas uma** instância de `pnpm dev` por vez. Instâncias duplicadas competem pelas mesmas portas.

## Variáveis de ambiente principais

Ver `.env.example` na raiz. Destaques:

| Variável | Uso |
| --- | --- |
| `PORT` | Porta da API (default: 3100) |
| `MONGODB_URI` | Conexão MongoDB |
| `REDIS_URL` | Conexão Redis / BullMQ |
| `JWT_SECRET` | Assinatura dos tokens JWT |
| `NEXT_PUBLIC_API_URL` | URL da API consumida pelo admin/web |
| `SEED_ADMIN_*` | Usuário admin inicial (dev) |

## Produção

- Defina `SEED_ADMIN_ENABLED=false`
- Troque `JWT_SECRET` e senhas do seed
- Não commite o arquivo `.env`
