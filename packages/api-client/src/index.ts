import type {
  AuthTokens,
  FieldQuery,
  KnowledgeDocument,
  PaginatedResponse,
  User,
} from '@qi-conhecimento/shared-types';
import type {
  CreateKnowledgeDocumentInput,
  FieldQueryInput,
  LoginInput,
  RegisterInput,
} from '@qi-conhecimento/shared-validators';

export interface QiConhecimentoClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null;
}

export class QiConhecimentoClient {
  constructor(private readonly options: QiConhecimentoClientOptions) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set('Content-Type', 'application/json');

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

  askFieldAssistant(input: FieldQueryInput) {
    return this.request<FieldQuery>('/messaging/query', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}
