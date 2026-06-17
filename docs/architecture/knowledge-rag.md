# Conhecimento e RAG

## Entidades

### KnowledgeDocument

Metadados da fonte ingerida: título, especialidade, tipo (PDF/imagem/link/texto), referência de norma, status de ingestão.

### KnowledgeChunk

Pílula de conhecimento pós-chunking: conteúdo plain + Markdown, tags, capítulo, item de norma, `embeddingId`.

## Pipeline (Pilar 2)

1. **Padronização** — qualquer entrada → Markdown
2. **Chunking** — divisão por tópico/subcapítulo
3. **Enriquecimento** — tags automáticas (tipo, norma, capítulo, área, autor)
4. **Indexação** — embeddings + text index MongoDB (MVP) → vector store (futuro)
5. **Busca híbrida** — `$text` + filtros de especialidade + embeddings (futuro)

## API

| Método | Path | Descrição |
| --- | --- | --- |
| GET | `/knowledge/documents` | Lista documentos |
| POST | `/knowledge/documents` | Registra nova fonte |
| POST | `/knowledge/documents/manual-content` | CMS interno |
| POST | `/knowledge/search` | Busca híbrida |

## Especialidades (`EngineeringSpecialty`)

- `civil`
- `hidraulica`
- `eletrica`
- `seguranca_trabalho`
