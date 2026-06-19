import { Injectable } from '@nestjs/common';
import { EngineeringSpecialty } from '@qi-conhecimento/shared-types';
import { buildCitationLabel, cosineSimilarity } from '@qi-conhecimento/shared-utils';
import { PinoLogger } from 'nestjs-pino';
import { KnowledgeRepository } from '../repositories/knowledge.repository';
import { KnowledgeChunkDocument } from '../schemas/knowledge-chunk.schema';
import { mapSearchResult } from '../interfaces/knowledge.mapper';
import { EmbeddingService } from './embedding.service';
import { LlmService } from './llm.service';

const RRF_K = 60;
/** Chunks enviados ao LLM no assistente (busca + resposta). */
const RAG_ASK_CONTEXT_CHUNKS = 10;
const RAG_ASK_SEARCH_LIMIT = 15;
const RAG_CONTEXT_CHARS_PER_CHUNK = 1500;

const RAG_SYSTEM_PROMPT =
  'Você é um assistente técnico de engenharia civil e instalações. Responda de forma curta e objetiva (máx. 3 parágrafos). Sempre cite a norma ou fonte (ex: "Conforme NBR 5410, item 6.2.1..."). Use apenas o contexto fornecido. ' +
  'Se o contexto trazer tabelas com colunas distintas (ex.: "K teórico" e "K recomendado"), respeite a coluna pedida na pergunta — não confunda teórico com recomendado. ' +
  'Na NBR 8800 Tabela H.1 (barras isoladas), use a coluna K recomendado e identifique o caso (a)–(f) pela condição de apoio descrita na tabela — não invente. ' +
  'Mapeamento usual: (a) ambas extremidades fixas → K≈0,65; (b) rotação livre e translação impedida → K≈0,80 — típico de engastado-rotulado / bi-apoiado; ' +
  '(c) rotação impedida e translação livre → K≈1,2 — não confundir com engastado-rotulado; (d) rotação e translação livres → K≈2,0; (e) e (f) ver tabela. ' +
  'Se a pergunta disser "engastada-rotulada" ou "engastado-rotulado", responda com o caso (b) salvo indicação contrária no contexto. ' +
  'Se não houver informação suficiente, diga claramente.';

@Injectable()
export class RagService {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly embeddingService: EmbeddingService,
    private readonly llmService: LlmService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RagService.name);
  }

  async hybridSearch(query: string, specialty?: EngineeringSpecialty, limit = 10) {
    const textChunks = await this.knowledgeRepository.searchByText(query, specialty, limit);
    const textIds = textChunks.map((c) => c._id.toString());

    let vectorIds: string[] = [];
    if (this.embeddingService.isAvailable) {
      const queryEmbedding = await this.embeddingService.embed(query);
      if (queryEmbedding) {
        const vectorChunks = await this.searchByVector(queryEmbedding, specialty, limit);
        vectorIds = vectorChunks.map((c) => c._id.toString());
      }
    }

    const mergedIds = this.reciprocalRankFusion(textIds, vectorIds, limit);
    const chunks = await this.knowledgeRepository.findChunksByIds(mergedIds);
    const ordered = mergedIds
      .map((id) => chunks.find((c) => c._id.toString() === id))
      .filter((c): c is KnowledgeChunkDocument => c !== undefined);

    return ordered.map(mapSearchResult);
  }

  /** Busca ampliada para o assistente — funde múltiplas consultas (ex.: tabela de K + pergunta original). */
  async retrieveChunksForAnswer(
    query: string,
    specialty?: EngineeringSpecialty,
  ): Promise<KnowledgeChunkDocument[]> {
    const queries = this.expandSearchQueries(query);
    const scores = new Map<string, number>();

    for (const expandedQuery of queries) {
      const results = await this.hybridSearch(expandedQuery, specialty, RAG_ASK_SEARCH_LIMIT);
      results.forEach((result, rank) => {
        scores.set(result.chunkId, (scores.get(result.chunkId) ?? 0) + 1 / (RRF_K + rank + 1));
      });
    }

    const mergedIds = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, RAG_ASK_CONTEXT_CHUNKS)
      .map(([id]) => id);

    if (mergedIds.length === 0) return [];

    const chunks = await this.knowledgeRepository.findChunksByIds(mergedIds);
    const ordered = mergedIds
      .map((id) => chunks.find((chunk) => chunk._id.toString() === id))
      .filter((chunk): chunk is KnowledgeChunkDocument => chunk !== undefined);

    return this.rankChunksForAnswer(ordered, query, scores);
  }

  /** Reordena chunks: tabelas e trechos citáveis sobem; melhora contexto do LLM e citações na UI. */
  rankChunksForAnswer(
    chunks: KnowledgeChunkDocument[],
    query: string,
    retrievalScores: Map<string, number>,
  ): KnowledgeChunkDocument[] {
    const isKQuery = /coeficiente|flambagem|\bk\b|engastad|rotulad|esbeltez/i.test(query);

    return [...chunks].sort((a, b) => {
      const scoreA = this.chunkAnswerScore(a, query, isKQuery, retrievalScores.get(a._id.toString()) ?? 0);
      const scoreB = this.chunkAnswerScore(b, query, isKQuery, retrievalScores.get(b._id.toString()) ?? 0);
      return scoreB - scoreA;
    });
  }

  private chunkAnswerScore(
    chunk: KnowledgeChunkDocument,
    query: string,
    isKQuery: boolean,
    retrievalScore: number,
  ): number {
    let score = retrievalScore * 100;
    const text = chunk.markdownContent.toLowerCase();
    const caption = (chunk.tableCaption ?? '').toLowerCase();

    if (chunk.contentType === 'table') score += 25;
    if (/tabela\s+h\.?\s*1/.test(caption) || /tabela\s+h\.?\s*1/.test(text)) score += 40;
    if (isKQuery && /k recomendado|k teórico|coeficiente de flambagem/.test(text)) score += 20;
    if (isKQuery && /engastad|rotulad|bi-?apoiad/i.test(chunk.markdownContent + query)) score += 15;
    if (isKQuery && /caso\s*\(b\)|rotação livre.*translação impedida/i.test(text)) score += 25;
    if (chunk.pageStart) score += 3;
    if (chunk.tableCaption) score += 5;

    return score;
  }

  /** Citações exibidas na UI — prioriza tabelas H.1/H.2 em perguntas sobre K. */
  selectCitationsForDisplay(
    chunks: KnowledgeChunkDocument[],
    query: string,
    limit = 5,
  ): KnowledgeChunkDocument[] {
    const isKQuery = /coeficiente|flambagem|\bk\b|engastad|rotulad|esbeltez/i.test(query);
    if (!isKQuery) return chunks.slice(0, limit);

    const wantsH1 =
      /barras?\s+isoladas?|engastad|rotulad|bi-?apoiad/i.test(query) &&
      !/treli[çc]a|treliça/i.test(query);

    const isRelevantTable = (chunk: KnowledgeChunkDocument): boolean => {
      const text = chunk.markdownContent;
      const caption = chunk.tableCaption ?? '';
      const hasTableBody = /\|.+\|/.test(text);
      const mentionsH1 = /tabela\s+h\.?\s*1/i.test(caption) || /tabela\s+h\.?\s*1/i.test(text);
      const mentionsH2 = /tabela\s+h\.?\s*2/i.test(caption) || /tabela\s+h\.?\s*2/i.test(text);

      if (wantsH1) return hasTableBody && mentionsH1;
      if (mentionsH1 || mentionsH2) return hasTableBody;
      return chunk.contentType === 'table' && hasTableBody;
    };

    const tableChunks = chunks.filter(isRelevantTable);
    const pool = tableChunks.length > 0 ? tableChunks : chunks.filter((c) => /\|.+\|/.test(c.markdownContent));

    const seen = new Set<string>();
    const deduped: KnowledgeChunkDocument[] = [];
    for (const chunk of pool) {
      const key = (chunk.tableCaption ?? chunk.markdownContent.slice(0, 120)).toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(chunk);
    }

    return deduped.slice(0, limit);
  }

  private expandSearchQueries(query: string): string[] {
    const trimmed = query.trim();
    const queries = [trimmed];

    if (/coeficiente|flambagem|\bk\b|engastad|rotulad|esbeltez/i.test(trimmed)) {
      queries.push('Tabela H.1 coeficiente de flambagem K recomendado barras isoladas');
      queries.push('tabela coeficiente de flambagem condições de apoio K recomendado');
      queries.push('valores teóricos e recomendados K barras comprimidas NBR 8800');
    }

    return [...new Set(queries)];
  }

  async generateAnswer(
    query: string,
    chunks: KnowledgeChunkDocument[],
  ): Promise<string> {
    if (!chunks.length) {
      return `Não encontrei referência técnica para "${query}". Verifique a especialidade ou consulte o administrador.`;
    }

    if (!this.llmService.isAvailable) {
      return this.fallbackAnswer(chunks);
    }

    const context = chunks
      .map((chunk, i) => {
        const doc = chunk.documentId as { title?: string; normReference?: string };
        const label = buildCitationLabel(
          doc.normReference,
          chunk.normItem,
          chunk.pageStart,
          chunk.tableCaption,
        );
        const tableHint =
          chunk.contentType === 'table' && chunk.tableSource === 'text_recovery'
            ? '\n[Nota: tabela recuperada da camada de texto do PDF — confira o original.]'
            : '';
        return `[${i + 1}] ${doc.title ?? 'Documento'} (${label})${tableHint}\n${chunk.markdownContent.slice(0, RAG_CONTEXT_CHARS_PER_CHUNK)}`;
      })
      .join('\n\n---\n\n');

    try {
      const answer = await this.llmService.complete(
        RAG_SYSTEM_PROMPT,
        `Contexto técnico:\n${context}\n\nPergunta: ${query}`,
      );

      return answer ?? this.fallbackAnswer(chunks);
    } catch (error) {
      this.logger.warn({ error }, 'LLM indisponível — usando resposta template');
      return this.fallbackAnswer(chunks);
    }
  }

  private fallbackAnswer(chunks: KnowledgeChunkDocument[]): string {
    const primary = chunks[0]!;
    const doc = primary.documentId as { normReference?: string };
    const label = buildCitationLabel(
      doc.normReference,
      primary.normItem,
      primary.pageStart,
      primary.tableCaption,
    );
    return `Conforme ${label}: ${primary.markdownContent.slice(0, 280)}`;
  }

  private async searchByVector(
    queryEmbedding: number[],
    specialty?: EngineeringSpecialty,
    limit = 10,
  ): Promise<KnowledgeChunkDocument[]> {
    const candidates = await this.knowledgeRepository.findChunksWithEmbeddings(specialty);
    const scored = candidates
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding ?? []),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((item) => item.chunk);
  }

  private reciprocalRankFusion(textIds: string[], vectorIds: string[], limit: number): string[] {
    const scores = new Map<string, number>();

    textIds.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1));
    });
    vectorIds.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1));
    });

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
  }
}
