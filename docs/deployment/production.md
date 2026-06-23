# Deploy em produção — Atlas + Render + Vercel

> **Sem cartão de crédito?** Siga o guia **[Deploy 100% gratuito](./free-tier.md)** — Render Free + Upstash + Atlas M0 + Vercel.

Guia para colocar o Qi Conhecimento no ar com:

| Componente | Plataforma |
| --- | --- |
| MongoDB | **MongoDB Atlas** |
| API NestJS + filas BullMQ | **Render** |
| Redis (filas) | **Render Redis** ou **Upstash** |
| Landing + busca pública (`apps/web`) | **Vercel** |
| Painel admin (`apps/admin`) | **Vercel** (projeto separado) |

O parser Docling (`apps/parser`) é **opcional** — sem ele, PDFs usam `pdf-parse` na API.

---

## Visão geral

```
┌─────────────┐     ┌─────────────┐
│  Vercel     │     │  Vercel     │
│  apps/web   │     │  apps/admin │
└──────┬──────┘     └──────┬──────┘
       │  HTTPS              │  HTTPS
       └──────────┬──────────┘
                  ▼
         ┌────────────────┐
         │  Render        │
         │  apps/api      │
         └───────┬────────┘
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
┌─────────────┐     ┌─────────────┐
│ Atlas       │     │ Redis       │
│ MongoDB     │     │ (Render /   │
│             │     │  Upstash)   │
└─────────────┘     └─────────────┘
```

---

## 1. MongoDB Atlas

1. Crie uma conta em [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. **Create cluster** → M0 (free) ou M10+ para produção.
3. **Database Access** → usuário com senha forte (role `readWrite` no database).
4. **Network Access** → `Allow Access from Anywhere` (`0.0.0.0/0`) para o Render conseguir conectar. Em produção madura, restrinja aos IPs do Render.
5. **Connect** → copie a connection string:
   ```
   mongodb+srv://USER:PASSWORD@cluster.mongodb.net/qi-conhecimento?retryWrites=true&w=majority
   ```

### Migrar dados locais (opcional)

Com MongoDB local rodando e dump existente:

```bash
# Gerar dump local
pnpm dump:local

# Restaurar no Atlas (MONGODB_URI no .env apontando para Atlas)
MONGODB_URI="mongodb+srv://..." pnpm restore:atlas
```

---

## 2. Render — API

> **Tier gratuito:** não use Blueprint se pedir cartão. Veja [free-tier.md](./free-tier.md).

O repositório inclui:
- [`render.yaml`](../../render.yaml) — **grátis** (API only; Redis via Upstash externo)
- [`render.paid.yaml`](../../render.paid.yaml) — pago (Redis Render + disco persistente)

### Opção A — Blueprint gratuito (`render.yaml`)

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
2. Conecte o repositório GitHub/GitLab.
3. Render cria **qi-conhecimento-api** (Web Service Free).
4. Preencha variáveis **sync: false**:

| Variável | Valor |
| --- | --- |
| `MONGODB_URI` | Connection string do Atlas |
| `REDIS_URL` | URL **Upstash** ([upstash.com](https://upstash.com) — grátis) |
| `API_CREDENTIALS_ENCRYPTION_KEY` | Gerada automaticamente no Blueprint *(ou `openssl rand -base64 32`)* |
| `CORS_ORIGINS` | URLs Vercel |

`JWT_SECRET` é gerado automaticamente. **LLM e embeddings** — configure em **Admin → Configurações** após o deploy.

> Se o Blueprint pedir cartão, cancele e use a **Opção B** ou [free-tier.md](./free-tier.md).

### Opção B — Web Service manual (recomendado no free tier)

1. **New → Web Service** → conecte o repo (não precisa de Redis no Render).
2. **Instance Type: Free**
3. Configuração:
   - **Root Directory:** *(vazio — raiz do monorepo)*
   - **Build Command:**
     ```bash
     pnpm install --frozen-lockfile && pnpm --filter @qi-conhecimento/api... build
     ```
   - **Start Command:**
     ```bash
     pnpm --filter @qi-conhecimento/api start
     ```
   - **Health Check Path:** `/health`
4. **Redis:** use [Upstash](https://upstash.com) grátis → cole `REDIS_URL`.
5. **Sem disco** no free tier — `STORAGE_PATH=./storage` (uploads efêmeros).
6. Configure variáveis de [`.env.production.example`](../../.env.production.example).

### Redis — Upstash (grátis, recomendado no free tier)

1. Crie database em [upstash.com](https://upstash.com).
2. Use a URL `rediss://...` em `REDIS_URL` no serviço da API.

### Verificar API

Após deploy:

```bash
curl https://qi-conhecimento-api.onrender.com/health
```

Resposta esperada:

```json
{
  "status": "ok",
  "checks": { "mongodb": "up" }
}
```

> `/health` valida apenas MongoDB (evita consumir comandos Redis no health check do Render). Filas BullMQ: monitore via logs e Upstash dashboard.

> **Cold start:** plano free/starter do Render hiberna após inatividade. A primeira requisição pode levar ~30s.

---

## 3. Vercel — Web (LP pública)

1. [vercel.com/new](https://vercel.com/new) → importe o repositório.
2. **Root Directory:** `apps/web`
3. Framework detectado: **Next.js** (usa [`apps/web/vercel.json`](../../apps/web/vercel.json)).
4. **Environment Variables:**

| Variável | Exemplo |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://qi-conhecimento-api.onrender.com` |
| `NEXT_PUBLIC_ADMIN_URL` | `https://qi-admin.vercel.app` |

5. Deploy.

---

## 4. Vercel — Admin

1. **Novo projeto** Vercel no **mesmo repositório**.
2. **Root Directory:** `apps/admin`
3. **Environment Variables:**

| Variável | Exemplo |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://qi-conhecimento-api.onrender.com` |

4. Deploy.

---

## 5. CORS — checklist final

Depois que as URLs Vercel existirem, atualize `CORS_ORIGINS` no Render:

```
CORS_ORIGINS=https://qi-web.vercel.app,https://qi-admin.vercel.app
```

Inclua também domínios customizados, se configurados. **Sem barra final.**

Redeploy da API após alterar.

---

## 6. Primeiro usuário admin

Com `SEED_ADMIN_ENABLED=false` (padrão em produção):

**Opção 1 — Registro via API**

```bash
curl -X POST https://SUA-API.onrender.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com","password":"SenhaForte123!","name":"Admin"}'
```

**Opção 2 — Seed único**

1. Defina temporariamente no Render:
   ```
   SEED_ADMIN_ENABLED=true
   SEED_ADMIN_EMAIL=admin@empresa.com
   SEED_ADMIN_PASSWORD=SenhaForte123!
   ```
2. Redeploy → admin criado.
3. Volte `SEED_ADMIN_ENABLED=false` e redeploy.

---

## 7. Domínios customizados (opcional)

| Serviço | Sugestão |
| --- | --- |
| Web | `www.seudominio.com` |
| Admin | `admin.seudominio.com` |
| API | `api.seudominio.com` (Custom Domain no Render) |

Atualize `CORS_ORIGINS`, `NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_ADMIN_URL` com os domínios finais.

---

## 8. Custos estimados (referência)

| Serviço | Plano mínimo |
| --- | --- |
| Atlas M0 | Grátis |
| Render API Starter | ~$7/mês |
| Render Redis | ~$10/mês (ou Upstash free tier) |
| Render disco 1 GB | ~$0.25/GB/mês |
| Vercel (2 projetos) | Hobby grátis |
| OpenAI embeddings | Pay-as-you-go |
| Anthropic LLM | Pay-as-you-go |

---

## 9. Limitações conhecidas

- **Uploads** ficam no disco Render — sobrevivem redeploys, mas não a troca de região. Para escala, migre para S3/R2.
- **Ollama** não roda no Render — use embedding **OpenAI** em **Admin → Configurações**.
- **Parser Docling** é pesado (~2 GB RAM) — deploy separado no Render (Docker) ou omita.
- **Swagger** desabilitado em `NODE_ENV=production`.
- Endpoints públicos (`/knowledge/public-ask`) não têm rate limit — considere adicionar antes de tráfego alto.

---

## 10. Troubleshooting

| Problema | Causa provável | Solução |
| --- | --- | --- |
| CORS error no browser | `CORS_ORIGINS` incompleto | Adicione URL exata da Vercel |
| 503 em `/health` | Mongo down | Verifique `MONGODB_URI` e Network Access Atlas |
| Busca RAG sem resposta LLM | Chaves ausentes no painel | **Admin → Configurações** — provedor LLM + chave |
| Upload some após redeploy | Disco não montado | Confirme `STORAGE_PATH=/var/data/storage` + disco no Render |
| Build Vercel falha | Workspace packages | Confirme Root Directory `apps/web` ou `apps/admin` |
| Admin login OK mas API 401 | `NEXT_PUBLIC_API_URL` errada | Verifique env na Vercel (rebuild necessário) |

---

## Referências

- [`.env.production.example`](../../.env.production.example) — template de variáveis
- [`render.yaml`](../../render.yaml) — Blueprint Render
- [`apps/web/vercel.json`](../../apps/web/vercel.json)
- [`apps/admin/vercel.json`](../../apps/admin/vercel.json)
