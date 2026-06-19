import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type {
  EngineeringSpecialty,
  FieldQuery,
  IngestionProgress,
  IngestionStatus,
  PaginatedResponse,
} from '@qi-conhecimento/shared-types';
import type { CreateCmsEntryInput, ImportLinkDocumentInput, SearchKnowledgeInput, UploadDocumentInput } from '@qi-conhecimento/shared-validators';
import { API_URL } from '@/lib/constants';
import { clearAccessToken, getAccessToken } from '@/lib/auth';

export interface DocumentRow {
  id: string;
  title: string;
  specialty: EngineeringSpecialty;
  sourceType: string;
  normReference?: string;
  ingestionStatus: IngestionStatus;
  ingestionError?: string;
  createdAt: string;
}

export interface ChunkRow {
  id: string;
  documentId: string;
  documentTitle?: string;
  normReference?: string;
  markdownContent: string;
  specialty: EngineeringSpecialty;
  chapter?: string;
  tags: string[];
  hasEmbedding?: boolean;
  createdAt: string;
}

export interface SearchResultRow {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  normReference?: string;
  normItem?: string;
  specialty: EngineeringSpecialty;
  excerpt: string;
  tags: string[];
}

export interface KnowledgeStats {
  documents: number;
  chunks: number;
  chunksWithEmbeddings?: number;
  chunksWithoutEmbeddings?: number;
}

export interface ParserStatus {
  configured: boolean;
  reachable: boolean;
  engine?: string;
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  prepareHeaders: (headers) => {
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401 && typeof window !== 'undefined') {
    clearAccessToken();
    window.location.href = '/login';
  }
  return result;
};

export const knowledgeApi = createApi({
  reducerPath: 'knowledgeApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Documents', 'Chunks', 'Stats'],
  endpoints: (builder) => ({
    getStats: builder.query<KnowledgeStats, void>({
      query: () => '/knowledge/stats',
      providesTags: ['Stats'],
    }),
    getParserStatus: builder.query<ParserStatus, void>({
      query: () => '/knowledge/parser/status',
    }),
    listDocuments: builder.query<PaginatedResponse<DocumentRow>, { page?: number; limit?: number }>({
      query: ({ page = 1, limit = 20 }) => `/knowledge/documents?page=${page}&limit=${limit}`,
      providesTags: ['Documents'],
    }),
    listChunks: builder.query<
      PaginatedResponse<ChunkRow>,
      { page?: number; limit?: number; documentId?: string }
    >({
      query: ({ page = 1, limit = 20, documentId }) => {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (documentId) params.set('documentId', documentId);
        return `/knowledge/chunks?${params.toString()}`;
      },
      providesTags: ['Chunks'],
    }),
    createCmsEntry: builder.mutation<{ document: DocumentRow; chunk: ChunkRow }, CreateCmsEntryInput>({
      query: (body) => ({ url: '/knowledge/cms', method: 'POST', body }),
      invalidatesTags: ['Documents', 'Chunks', 'Stats'],
    }),
    searchKnowledge: builder.mutation<
      { query: string; results: SearchResultRow[] },
      SearchKnowledgeInput
    >({
      query: (body) => ({ url: '/knowledge/search', method: 'POST', body }),
    }),
    fieldQuery: builder.mutation<
      FieldQuery,
      { queryText: string; specialtyFilter?: EngineeringSpecialty }
    >({
      query: (body) => ({
        url: '/messaging/query',
        method: 'POST',
        body: {
          ...body,
          channel: 'whatsapp',
          externalUserId: 'admin-test',
        },
      }),
    }),
    uploadDocument: builder.mutation<
      DocumentRow,
      UploadDocumentInput & { file: File }
    >({
      query: ({ file, ...metadata }) => {
        const formData = new FormData();
        formData.append('file', file);
        Object.entries(metadata).forEach(([key, value]) => {
          if (value != null && value !== '') formData.append(key, String(value));
        });
        return { url: '/knowledge/documents/upload', method: 'POST', body: formData };
      },
      invalidatesTags: ['Documents', 'Chunks', 'Stats'],
    }),
    importLink: builder.mutation<DocumentRow, ImportLinkDocumentInput>({
      query: (body) => ({ url: '/knowledge/documents/import-link', method: 'POST', body }),
      invalidatesTags: ['Documents', 'Chunks', 'Stats'],
    }),
    cancelIngestion: builder.mutation<
      { document: DocumentRow; removedJobs: number; removedChunks: number },
      string
    >({
      query: (documentId) => ({
        url: `/knowledge/documents/${documentId}/cancel-ingestion`,
        method: 'POST',
      }),
      invalidatesTags: ['Documents', 'Chunks', 'Stats'],
    }),
    deleteDocument: builder.mutation<
      { documentId: string; deletedChunks: number; removedJobs: number; storageRemoved: boolean },
      string
    >({
      query: (documentId) => ({
        url: `/knowledge/documents/${documentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Documents', 'Chunks', 'Stats'],
    }),
    reprocessWithOcr: builder.mutation<DocumentRow, string>({
      query: (documentId) => ({
        url: `/knowledge/documents/${documentId}/reprocess-with-ocr`,
        method: 'POST',
      }),
      invalidatesTags: ['Documents', 'Chunks', 'Stats'],
    }),
    dismissOcrRetry: builder.mutation<DocumentRow, string>({
      query: (documentId) => ({
        url: `/knowledge/documents/${documentId}/dismiss-ocr-retry`,
        method: 'POST',
      }),
      invalidatesTags: ['Documents'],
    }),
    getIngestionProgress: builder.query<IngestionProgress, string>({
      query: (documentId) => `/knowledge/documents/${documentId}/ingestion-progress`,
    }),
  }),
});

export const {
  useGetStatsQuery,
  useGetParserStatusQuery,
  useListDocumentsQuery,
  useListChunksQuery,
  useCreateCmsEntryMutation,
  useSearchKnowledgeMutation,
  useFieldQueryMutation,
  useUploadDocumentMutation,
  useImportLinkMutation,
  useCancelIngestionMutation,
  useDeleteDocumentMutation,
  useReprocessWithOcrMutation,
  useDismissOcrRetryMutation,
  useGetIngestionProgressQuery,
} = knowledgeApi;
