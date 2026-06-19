# Fase 3 — Assistente de campo via Qi Agents

A Fase 3 entrega o **Pilar 3** (interface de campo) com arquitetura **distribuída**:

- **Qi Agents** — canais WhatsApp/Telegram, webhooks, áudio, envio
- **Qi Conhecimento** — RAG, citações, histórico (`field_queries`)

> Guia de integração: [integrations/qi-agents.md](../integrations/qi-agents.md)

## O que já está pronto (Qi Conhecimento)

| Entrega | Detalhe |
| --- | --- |
| `POST /messaging/query` | Busca híbrida + LLM + `citations[]` |
| Persistência | Collection `field_queries` |
| Contrato | `channel`, `externalUserId`, `specialtyFilter`, `transcribedFromAudio` |
| Evento interno | `FIELD_QUERY_ANSWERED` (para extensões futuras) |

## Escopo revisado

### Qi Agents (projeto externo)

- [ ] Canal WhatsApp → `POST /messaging/query`
- [ ] Canal Telegram → mesmo endpoint
- [ ] Transcrição de áudio antes da chamada (`transcribedFromAudio: true`)
- [ ] Formatação de `answer` + citações para o canal
- [ ] Retry / timeout na chamada HTTP (RAG pode levar 10–30 s)

### Qi Conhecimento (este repositório)

- [x] Endpoint RAG para canais
- [x] Documentação de integração
- [ ] API key serviço-a-serviço em `/messaging/query`
- [ ] Admin `/queries` — listagem de `field_queries`
- [ ] (Opcional) Endpoint com `messageText` pré-formatado para WhatsApp

### Explicitamente fora de escopo (Qi Conhecimento)

- Webhook WhatsApp POST
- Meta Cloud API / envio de mensagens
- Bot Telegram nativo
- Fila `messaging` / job `send-field-response`
- Whisper

## Como testar ponta a ponta

### 1. Validar o cérebro (qi-conhecimento)

```bash
pnpm dev
```

Swagger → `POST /messaging/query` ou:

```bash
curl -X POST http://localhost:3100/messaging/query \
  -H "Content-Type: application/json" \
  -d "{\"queryText\":\"Qual o K recomendado para barra engastada-rotulada?\",\"channel\":\"whatsapp\",\"externalUserId\":\"teste\"}"
```

Resposta esperada: `answer` citando NBR 8800 (se norma ingerida) + `citations[]`.

### 2. Conectar qi-agents

1. API qi-conhecimento acessível pelo qi-agents (local: `localhost:3100`; prod: URL pública).
2. Criar canal no qi-agents apontando para `/messaging/query`.
3. Enviar mensagem de teste pelo WhatsApp ou Telegram.
4. Confirmar registro em `field_queries` (MongoDB `qi-conhecimento`).

### 3. Regressão RAG (opcional)

```bash
pnpm --filter @qi-conhecimento/api eval:rag
```

Valida qualidade das respostas antes de expor no canal.

## Variáveis relevantes

No **qi-conhecimento** (`.env`):

```env
# LLM — respostas enriquecidas no /messaging/query
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=

# Embeddings — busca híbrida
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text

MONGODB_URI=.../qi-conhecimento
```

No **qi-agents**: URL da API de conhecimento + credenciais do canal (Meta, Telegram) — **não** misturar com variáveis WhatsApp do qi-conhecimento.

## Fases anteriores

- [phase-1.md](./phase-1.md) — admin + CMS + busca
- [phase-2.md](./phase-2.md) — ingestão multimodal + RAG
