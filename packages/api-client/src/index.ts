import type {
  AuthTokens,
  ChunkContentType,
  EngineeringSpecialty,
  FieldQuery,
  KnowledgeCitation,
  KnowledgeDocument,
  PaginatedResponse,
  TableExtractionSource,
  User,
} from '@qi-conhecimento/shared-types';
import type {
  CreateCmsEntryInput,
  CreateKnowledgeDocumentInput,
  FieldQueryInput,
  ImportLinkDocumentInput,
  LoginInput,
  RegisterInput,
  SearchKnowledgeInput,
  UploadDocumentInput,
  UploadMarkdownInput,
} from '@qi-conhecimento/shared-validators';

export interface KnowledgeStats {
  documents: number;
  chunks: number;
}

export interface KnowledgeChunkRow {
  id: string;
  documentId: string;
  documentTitle?: string;
  normReference?: string;
  markdownContent: string;
  specialty: EngineeringSpecialty;
  chapter?: string;
  tags: string[];
  pageStart?: number;
  pageEnd?: number;
  contentType?: ChunkContentType;
  tableCaption?: string;
  tableSource?: TableExtractionSource;
  createdAt: string;
}

export interface KnowledgeSearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  normReference?: string;
  normItem?: string;
  specialty: EngineeringSpecialty;
  excerpt: string;
  pageStart?: number;
  tableCaption?: string;
  contentType?: ChunkContentType;
  tags: string[];
}

export interface PublicKnowledgeAskResult {
  query: string;
  answer?: string;
  citations: KnowledgeCitation[];
}

export interface CmsEntryResponse {
  document: KnowledgeDocument;
}

export interface QiConhecimentoClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null;
}

export class QiConhecimentoClient {
  constructor(private readonly options: QiConhecimentoClientOptions) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    const isFormData = init?.body instanceof FormData;
    if (!isFormData) headers.set('Content-Type', 'application/json');

    const token = this.options.getAccessToken?.();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(`${this.options.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(error.message ?? `Request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  login(input: LoginInput) {
    return this.request<AuthTokens>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  register(input: RegisterInput) {
    return this.request<AuthTokens>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  me() {
    return this.request<User>('/auth/me');
  }

  listDocuments(page = 1, limit = 20) {
    return this.request<PaginatedResponse<KnowledgeDocument>>(
      `/knowledge/documents?page=${page}&limit=${limit}`,
    );
  }

  createDocument(input: CreateKnowledgeDocumentInput) {
    return this.request<KnowledgeDocument>('/knowledge/documents', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getStats() {
    return this.request<KnowledgeStats>('/knowledge/stats');
  }

  listChunks(page = 1, limit = 20, documentId?: string) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (documentId) params.set('documentId', documentId);
    return this.request<PaginatedResponse<KnowledgeChunkRow>>(`/knowledge/chunks?${params.toString()}`);
  }

  createCmsEntry(input: CreateCmsEntryInput) {
    return this.request<CmsEntryResponse>('/knowledge/cms', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  searchKnowledge(input: SearchKnowledgeInput) {
    return this.request<{ query: string; results: KnowledgeSearchResult[] }>('/knowledge/search', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  publicSearchKnowledge(input: SearchKnowledgeInput) {
    return this.request<{ query: string; results: KnowledgeSearchResult[] }>(
      '/knowledge/public-search',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  }

  publicAskKnowledge(input: SearchKnowledgeInput) {
    return this.request<PublicKnowledgeAskResult>('/knowledge/public-ask', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  uploadDocument(input: UploadDocumentInput & { file: Blob | File }) {
    const formData = new FormData();
    formData.append('file', input.file);
    Object.entries(input).forEach(([key, value]) => {
      if (key !== 'file' && value != null && value !== '') formData.append(key, String(value));
    });
    return this.request<KnowledgeDocument>('/knowledge/documents/upload', {
      method: 'POST',
      body: formData,
    });
  }

  uploadMarkdown(input: UploadMarkdownInput & { file: Blob | File }) {
    const formData = new FormData();
    formData.append('file', input.file);
    Object.entries(input).forEach(([key, value]) => {
      if (key === 'file' || value == null || value === '') return;
      if (key === 'tags' && Array.isArray(value)) {
        formData.append(key, value.join(','));
        return;
      }
      formData.append(key, String(value));
    });
    return this.request<KnowledgeDocument>('/knowledge/documents/upload-markdown', {
      method: 'POST',
      body: formData,
    });
  }

  importLink(input: ImportLinkDocumentInput) {
    return this.request<KnowledgeDocument>('/knowledge/documents/import-link', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  askFieldAssistant(input: FieldQueryInput) {
    return this.request<FieldQuery>('/messaging/query', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}
