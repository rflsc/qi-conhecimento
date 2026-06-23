import { Injectable } from '@nestjs/common';
import { KnowledgeRetrievalScope } from '@qi-conhecimento/shared-types';
import { buildCitationLabel, cosineSimilarity } from '@qi-conhecimento/shared-utils';
import { PinoLogger } from 'nestjs-pino';
import { KnowledgeRepository } from '../repositories/knowledge.repository';
import { KnowledgeChunkDocument } from '../schemas/knowledge-chunk.schema';
import { KnowledgeDocumentEntity } from '../schemas/knowledge-document.schema';
import { mapSearchResult } from '../interfaces/knowledge.mapper';
import {
  chunkMatchesScopeTags,
  isRetrievalScopeRestricted,
} from '../utils/retrieval-scope.util';
import { resolveChunkSourceUrl } from '../utils/source-url.util';
import { EmbeddingService } from './embedding.service';
import { LlmService } from './llm.service';

const RRF_K = 60;
/** Chunks enviados ao LLM no assistente (busca + resposta). */
const RAG_ASK_CONTEXT_CHUNKS = 10;
const RAG_ASK_SEARCH_LIMIT = 15;
const RAG_CONTEXT_CHARS_PER_CHUNK = 1500;

const RAG_SYSTEM_PROMPT =
  'Você é um assistente técnico de engenharia civil e instalações. Responda de forma curta e objetiva (máx. 3 parágrafos). Sempre cite a norma ou fonte (ex: "Conforme NBR 5410, item 6.2.1...") ou o manual AltoQi Eberick quando a pergunta for sobre uso do software. Use apenas o contexto fornecido. ' +
  'Quando o contexto incluir "Fonte:" com URL https, inclua essa URL completa (texto plano) ao final da resposta, em linha separada, para o usuário abrir o manual ou artigo de ajuda. ' +
  'Dúvidas normativas: NBR 6118 (concreto) e NBR 8800 (aço). Dúvidas de software estrutural: manual AltoQi Eberick (central de ajuda). Não invente conteúdo de NBR 8681 (ações) nem NBR 7190 (madeira) se não estiver no contexto. ' +
  'Se o contexto trazer tabelas com colunas distintas (ex.: "K teórico" e "K recomendado"), respeite a coluna pedida na pergunta — não confunda teórico com recomendado. ' +
  'Na NBR 8800 Tabela H.1 (barras isoladas), use a coluna K recomendado e identifique o caso (a)–(f) pela condição de apoio descrita na tabela — não invente. ' +
  'Mapeamento usual: (a) ambas extremidades fixas → K≈0,65; (b) rotação livre e translação impedida → K≈0,80 — típico de engastado-rotulado / bi-apoiado; ' +
  '(c) rotação impedida e translação livre → K≈1,2 — não confundir com engastado-rotulado; (d) rotação e translação livres → K≈2,0; (e) e (f) ver tabela. ' +
  'Se a pergunta disser "engastada-rotulada" ou "engastado-rotulado", responda com o caso (b) salvo indicação contrária no contexto. ' +
  'Se não houver informação suficiente, diga claramente.';

@Injectable()
export class RagService {
  /** Liga após a 1ª falha do índice nativo; evita reprovar o $vectorSearch a cada query. */
  private vectorIndexFallbackActive = false;

  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly embeddingService: EmbeddingService,
    private readonly llmService: LlmService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RagService.name);
  }

  async hybridSearch(
    query: string,
    scope?: KnowledgeRetrievalScope,
    limit = 10,
    candidateLoader?: () => Promise<KnowledgeChunkDocument[]>,
  ) {
    const t0 = performance.now();
    const textChunks = await this.knowledgeRepository.searchByText(query, scope, limit);
    const textIds = textChunks.map((c) => c._id.toString());
    const tText = performance.now();

    let vectorIds: string[] = [];
    let tEmbed = tText;
    let tVector = tText;
    if (await this.embeddingService.isAvailable()) {
      const queryEmbedding = await this.embeddingService.embed(query);
      tEmbed = performance.now();
      if (queryEmbedding) {
        vectorIds = await this.searchByVector(queryEmbedding, scope, limit, candidateLoader);
      }
      tVector = performance.now();
    }

    this.logger.info(
      {
        query: query.slice(0, 48),
        textMs: Math.round(tText - t0),
        embedMs: Math.round(tEmbed - tText),
        vectorMs: Math.round(tVector - tEmbed),
        totalMs: Math.round(performance.now() - t0),
      },
      'timing:hybridSearch',
    );

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
    scope?: KnowledgeRetrievalScope,
  ): Promise<KnowledgeChunkDocument[]> {
    const t0 = performance.now();
    const queries = this.expandSearchQueries(query, scope);
    const scores = new Map<string, number>();

    let candidatesPromise: Promise<KnowledgeChunkDocument[]> | null = null;
    const candidateLoader = () => {
      if (!candidatesPromise) {
        candidatesPromise = this.knowledgeRepository.findChunksWithEmbeddings(scope);
      }
      return candidatesPromise;
    };

    for (const expandedQuery of queries) {
      const results = await this.hybridSearch(
        expandedQuery,
        scope,
        RAG_ASK_SEARCH_LIMIT,
        candidateLoader,
      );
      results.forEach((result, rank) => {
        scores.set(result.chunkId, (scores.get(result.chunkId) ?? 0) + 1 / (RRF_K + rank + 1));
      });
    }

    this.logger.info(
      { queryCount: queries.length, totalMs: Math.round(performance.now() - t0) },
      'timing:retrieveChunksForAnswer',
    );

    const mergedIds = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, RAG_ASK_CONTEXT_CHUNKS)
      .map(([id]) => id);

    if (mergedIds.length === 0) return [];

    const chunks = await this.knowledgeRepository.findChunksByIds(mergedIds);
    const ordered = mergedIds
      .map((id) => chunks.find((chunk) => chunk._id.toString() === id))
      .filter((chunk): chunk is KnowledgeChunkDocument => chunk !== undefined);

    return this.rankChunksForAnswer(ordered, query, scores, scope);
  }

  /** Reordena chunks: tabelas e trechos citáveis sobem; melhora contexto do LLM e citações na UI. */
  rankChunksForAnswer(
    chunks: KnowledgeChunkDocument[],
    query: string,
    retrievalScores: Map<string, number>,
    scope?: KnowledgeRetrievalScope,
  ): KnowledgeChunkDocument[] {
    const scoped = isRetrievalScopeRestricted(scope);
    const isKQuery =
      !scoped && /coeficiente|flambagem|\bk\b|engastad|rotulad|esbeltez/i.test(query);

    return [...chunks].sort((a, b) => {
      const scoreA = this.chunkAnswerScore(
        a,
        query,
        isKQuery,
        scope,
        retrievalScores.get(a._id.toString()) ?? 0,
      );
      const scoreB = this.chunkAnswerScore(
        b,
        query,
        isKQuery,
        scope,
        retrievalScores.get(b._id.toString()) ?? 0,
      );
      return scoreB - scoreA;
    });
  }

  private chunkAnswerScore(
    chunk: KnowledgeChunkDocument,
    query: string,
    isKQuery: boolean,
    scope: KnowledgeRetrievalScope | undefined,
    retrievalScore: number,
  ): number {
    let score = retrievalScore * 100;
    const text = chunk.markdownContent.toLowerCase();
    const caption = (chunk.tableCaption ?? '').toLowerCase();

    if (scope?.tags?.length && chunkMatchesScopeTags(chunk.tags, scope.tags)) {
      score += 40;
    }

    if (isRetrievalScopeRestricted(scope)) {
      if (chunk.contentType === 'table') score += 10;
      if (chunk.pageStart) score += 3;
      return score;
    }

    if (chunk.contentType === 'table') score += 25;
    if (/tabela\s+h\.?\s*1/.test(caption) || /tabela\s+h\.?\s*1/.test(text)) score += 40;
    if (isKQuery && /k recomendado|k teórico|coeficiente de flambagem/.test(text)) score += 20;
    if (isKQuery && /engastad|rotulad|bi-?apoiad/i.test(chunk.markdownContent + query)) score += 15;
    if (isKQuery && /caso\s*\(b\)|rotação livre.*translação impedida/i.test(text)) score += 25;
    if (chunk.pageStart) score += 3;
    if (chunk.tableCaption) score += 5;

    return score;
  }

  /** Citações exibidas na UI — respeita tagFilter; heurísticas de tabela só em busca aberta. */
  selectCitationsForDisplay(
    chunks: KnowledgeChunkDocument[],
    query: string,
    limit = 5,
    scope?: KnowledgeRetrievalScope,
  ): KnowledgeChunkDocument[] {
    if (scope?.tags?.length) {
      const scoped = chunks.filter((chunk) => chunkMatchesScopeTags(chunk.tags, scope.tags));
      if (scoped.length > 0) return scoped.slice(0, limit);
    }

    if (isRetrievalScopeRestricted(scope)) {
      return chunks.slice(0, limit);
    }

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

  private expandSearchQueries(query: string, scope?: KnowledgeRetrievalScope): string[] {
    const trimmed = query.trim();
    if (isRetrievalScopeRestricted(scope)) {
      return [trimmed];
    }

    const queries = [trimmed];

    // Heurística legada para busca aberta em normas de aço — omitida quando tagFilter/documentIds restringem o corpus.
    if (/coeficiente|flambagem|\bk\b|engastad|rotulad|esbeltez/i.test(trimmed)) {
      queries.push(
        'Tabela H.1 coeficiente de flambagem K recomendado barras isoladas condições de apoio NBR 8800',
      );
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

    if (!(await this.llmService.isAvailable())) {
      return this.fallbackAnswer(chunks);
    }

    const tCtx = performance.now();
    const context = chunks
      .map((chunk, i) => {
        const doc = chunk.documentId as unknown as KnowledgeDocumentEntity;
        const label = buildCitationLabel(
          doc.normReference,
          chunk.normItem,
          chunk.pageStart,
          chunk.tableCaption,
        );
        const sourceUrl = resolveChunkSourceUrl(chunk, doc);
        const sourceHint = sourceUrl ? `\nFonte: ${sourceUrl}` : '';
        const tableHint =
          chunk.contentType === 'table' && chunk.tableSource === 'text_recovery'
            ? '\n[Nota: tabela recuperada da camada de texto do PDF — confira o original.]'
            : '';
        return `[${i + 1}] ${doc.title ?? 'Documento'} (${label})${sourceHint}${tableHint}\n${chunk.markdownContent.slice(0, RAG_CONTEXT_CHARS_PER_CHUNK)}`;
      })
      .join('\n\n---\n\n');
    const tContextBuilt = performance.now();

    try {
      const answer = await this.llmService.complete(
        RAG_SYSTEM_PROMPT,
        `Contexto técnico:\n${context}\n\nPergunta: ${query}`,
      );

      this.logger.info(
        {
          chunkCount: chunks.length,
          contextChars: context.length,
          contextBuildMs: Math.round(tContextBuilt - tCtx),
          llmMs: Math.round(performance.now() - tContextBuilt),
        },
        'timing:generateAnswer',
      );

      return answer ?? this.fallbackAnswer(chunks);
    } catch (error) {
      this.logger.warn({ error }, 'LLM indisponível — usando resposta template');
      return this.fallbackAnswer(chunks);
    }
  }

  private fallbackAnswer(chunks: KnowledgeChunkDocument[]): string {
    const primary = chunks[0]!;
    const doc = primary.documentId as unknown as KnowledgeDocumentEntity;
    const label = buildCitationLabel(
      doc.normReference,
      primary.normItem,
      primary.pageStart,
      primary.tableCaption,
    );
    const sourceUrl = resolveChunkSourceUrl(primary, doc);
    const linkLine = sourceUrl ? `\n\n${sourceUrl}` : '';
    return `Conforme ${label}: ${primary.markdownContent.slice(0, 280)}${linkLine}`;
  }

  /**
   * Top-K por similaridade. Tenta o índice nativo Atlas Vector Search ($vectorSearch)
   * e, se indisponível (índice não criado), faz fallback para cosseno em memória.
   * Retorna ids ordenados por relevância.
   */
  private async searchByVector(
    queryEmbedding: number[],
    scope?: KnowledgeRetrievalScope,
    limit = 10,
    candidateLoader?: () => Promise<KnowledgeChunkDocument[]>,
  ): Promise<string[]> {
    if (!this.vectorIndexFallbackActive) {
      const tIdx = performance.now();
      try {
        const ids = await this.knowledgeRepository.vectorSearch(queryEmbedding, scope, limit);
        if (ids.length > 0) {
          this.logger.info(
            { hits: ids.length, vectorSearchMs: Math.round(performance.now() - tIdx) },
            'timing:searchByVector:index',
          );
          return ids;
        }
        // Resultado vazio: índice provavelmente ainda não existe/indexou — usa fallback.
        this.vectorIndexFallbackActive = true;
        this.logger.warn('Atlas Vector Search retornou vazio — ativando fallback brute-force');
      } catch (error) {
        this.vectorIndexFallbackActive = true;
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Atlas Vector Search indisponível — ativando fallback brute-force',
        );
      }
    }

    const tLoad = performance.now();
    const candidates = candidateLoader
      ? await candidateLoader()
      : await this.knowledgeRepository.findChunksWithEmbeddings(scope);
    const tLoaded = performance.now();
    const scored = candidates
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding ?? []),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    this.logger.info(
      {
        candidateCount: candidates.length,
        loadMs: Math.round(tLoaded - tLoad),
        cosineMs: Math.round(performance.now() - tLoaded),
      },
      'timing:searchByVector:bruteforce',
    );

    return scored.slice(0, limit).map((item) => item.chunk._id.toString());
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
