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

const RAG_SYSTEM_PROMPT =
  'Você é um assistente técnico de engenharia civil e instalações. Responda de forma curta e objetiva (máx. 3 parágrafos). Sempre cite a norma ou fonte (ex: "Conforme NBR 5410, item 6.2.1..."). Use apenas o contexto fornecido. Se não houver informação suficiente, diga claramente.';

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
        return `[${i + 1}] ${doc.title ?? 'Documento'} (${doc.normReference ?? 'fonte interna'})\n${chunk.markdownContent.slice(0, 600)}`;
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
    const label = buildCitationLabel(doc.normReference, primary.normItem);
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
