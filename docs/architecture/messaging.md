# Mensageria — Interface de Campo

## Objetivo

Entregar respostas técnicas no WhatsApp/Telegram com **citação rastreável** da norma ou documento de origem.

## Fluxo

1. Mensagem recebida (texto ou áudio → transcrição)
2. `MessagingService.handleFieldQuery()` chama busca híbrida
3. Resposta formatada: `"Conforme NBR 5410, item 6.2.1: ..."`
4. Registro em `field_queries` com array de `citations`
5. (Futuro) envio assíncrono via fila `messaging`

## Endpoints

| Método | Path | Descrição |
| --- | --- | --- |
| POST | `/messaging/query` | Consulta RAG simulando canal de campo |
| GET | `/messaging/whatsapp/webhook` | Verificação Meta |
| POST | `/messaging/whatsapp/webhook` | Recebimento de mensagens |

## Variáveis de ambiente

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `TELEGRAM_BOT_TOKEN`
