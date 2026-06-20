# Deploy 100% gratuito — Atlas + Upstash + Render Free + Vercel

Sem cartão de crédito. Ideal para MVP e validação.

| Serviço | Plataforma | Custo |
| --- | --- | --- |
| MongoDB | Atlas M0 | Grátis |
| Redis (filas BullMQ) | **Upstash** | Grátis (10k cmds/dia) |
| API | **Render Free** | Grátis |
| Web + Admin | Vercel Hobby | Grátis |

### O Render diz "Port scan timeout" / "no open ports detected"

A API não chegou a abrir a porta. Causas comuns:

1. **`MONGODB_URI` ou `REDIS_URL` ausentes/errados** — app cai antes de subir
2. **`REDIS_URL=redis://localhost:6379`** — no Render não existe Redis local; use **Upstash**
3. **Start Command errado** — use:
   ```bash
   node apps/api/dist/main.js
   ```

Confira os **Logs** do serviço no Render — se aparecer `ECONNREFUSED 127.0.0.1:6379`, corrija `REDIS_URL`.

### `ECONNRESET` no Redis (Upstash)

Significa **TLS ausente ou URL mal copiada**.

1. `REDIS_URL` deve ser **`rediss://`** (dois s), não `redis://`
2. Sem prefixos `redis-cli`, `--tls`, `-u` — só a URL pura
3. No Upstash: **Connect → Node.js → ioredis** e copie a URL gerada
4. Salve no Render → Redeploy

Variáveis **obrigatórias** no Render:

| Variável | Exemplo |
| --- | --- |
| `MONGODB_URI` | `mongodb+srv://...` |
| `REDIS_URL` | `rediss://default:...@....upstash.io:6379` |
| `JWT_SECRET` | string aleatória 32+ chars |

---

## Limitações do tier grátis

- API **hiberna** após ~15 min sem uso — 1ª requisição demora ~30–60s (cold start)
- `POST /knowledge/public-ask` pode levar **~45–90s** no Render free (CPU + LLM); com índice vetorial Atlas e ack no Qi Agents, o usuário vê feedback imediato enquanto processa
- **Uploads de PDF** não persistem entre redeploys (sem disco pago)
- Upstash free tem limite diário de comandos — suficiente para testes
- OpenAI/Anthropic são pay-as-you-go *(só paga se usar as keys)*

---

## Passo 1 — MongoDB Atlas (grátis)

1. [mongodb.com/atlas](https://www.mongodb.com/atlas) → cluster **M0 Free**
2. Usuário + senha → Network Access `0.0.0.0/0`
3. Copie a URI:
   ```
   mongodb+srv://USER:PASS@cluster.mongodb.net/qi-conhecimento?retryWrites=true&w=majority
   ```

4. **Índice Vector Search** (recomendado — acelera muito o RAG no tier M0 grátis):

   Com embeddings já gerados no banco:

   ```bash
   node scripts/create-vector-index.mjs
   ```

   Aguarde status `READY` (`db.knowledge_chunks.aggregate([{ $listSearchIndexes: {} }])`) e **reinicie a API** após a indexação. Detalhes: [knowledge-rag.md#atlas-vector-search](../architecture/knowledge-rag.md#atlas-vector-search).

---

## Passo 2 — Upstash Redis (grátis)

1. [console.upstash.com](https://console.upstash.com) → **Create database**
2. Região próxima ao Render (ex: `us-east-1`)
3. Aba **Details** → clique **Connect** → **Node.js** → **ioredis**
4. Copie **somente** a URL (começa com `rediss://`, com dois **s**):
   ```
   rediss://default:...@darling-frog-xxxxx.upstash.io:6379
   ```
   **Não** copie `redis-cli --tls -u ...` — isso quebra a conexão.
5. Se a URL vier com `redis://`, troque para `rediss://` (Upstash exige TLS).

> Não use Redis do Render — exige plano pago.

---

## Passo 3 — Vercel (web + admin)

### Web (`apps/web`)

1. [vercel.com/new](https://vercel.com/new) → repo `rflsc/qi-conhecimento`
2. **Root Directory:** `apps/web`
3. Env *(preencha depois de ter a URL da API)*:
   - `NEXT_PUBLIC_API_URL` = URL Render (passo 4)
   - `NEXT_PUBLIC_ADMIN_URL` = URL Vercel do admin

### Admin (`apps/admin`)

1. Novo projeto Vercel, mesmo repo
2. **Root Directory:** `apps/admin`
3. Env: `NEXT_PUBLIC_API_URL` = URL Render

Anote as URLs geradas (ex: `https://qi-conhecimento-web.vercel.app`).

---

## Passo 4 — Render API (grátis, SEM Blueprint pago)

**Não use Blueprint** se pedir cartão. Crie manualmente:

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Web Service**
2. Conecte `rflsc/qi-conhecimento`
3. Configuração:

| Campo | Valor |
| --- | --- |
| Name | `qi-conhecimento-api` |
| Region | Oregon (US West) |
| Branch | `main` |
| Root Directory | *(vazio)* |
| Runtime | **Node** |
| Build Command | `pnpm install --frozen-lockfile && pnpm --filter @qi-conhecimento/api... build` |
| Start Command | `node apps/api/dist/main.js` |
| Instance Type | **Free** |

4. **Environment Variables:**

| Variável | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | URI do Atlas (passo 1) |
| `REDIS_URL` | URL Upstash (passo 2) |
| `JWT_SECRET` | string aleatória longa (32+ chars) |
| `SEED_ADMIN_ENABLED` | `false` |
| `SEED_KNOWLEDGE_ENABLED` | `false` |
| `EMBEDDING_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | sua key *(ou deixe vazio — busca texto funciona, embeddings não)* |
| `LLM_PROVIDER` | `anthropic` |
| `ANTHROPIC_API_KEY` | sua key *(ou vazio — RAG usa fallback sem LLM)* |
| `STORAGE_PATH` | `./storage` |
| `CORS_ORIGINS` | URLs Vercel separadas por vírgula |

Exemplo `CORS_ORIGINS`:
```
https://qi-conhecimento-web.vercel.app,https://qi-conhecimento-admin.vercel.app
```

5. **Create Web Service** → aguarde deploy (~5–10 min)

6. Teste:
   ```bash
   curl https://qi-conhecimento-api.onrender.com/health
   ```

7. Volte na Vercel e atualize `NEXT_PUBLIC_API_URL` com a URL Render → **Redeploy** web e admin.

---

## Passo 5 — Primeiro admin

```bash
curl -X POST https://SUA-API.onrender.com/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@empresa.com\",\"password\":\"SenhaForte123!\",\"name\":\"Admin\"}"
```

Acesse o admin Vercel → `/login`.

---

## Blueprint gratuito (alternativa)

O [`render.yaml`](../../render.yaml) na raiz já está no **tier free** (sem Redis/disco).

Se o Render ainda pedir cartão no Blueprint, ignore e use o **passo 4 manual** acima — Web Service Free não exige pagamento.

---

## Quando quiser upgrade (pago)

Use [`render.paid.yaml`](../../render.paid.yaml) para Redis Render + disco persistente + plano Starter.

Guia completo: [production.md](./production.md)
