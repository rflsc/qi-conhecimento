import { QiConhecimentoClient } from '@qi-conhecimento/api-client';
import { API_URL } from '@/lib/constants';

export const api = new QiConhecimentoClient({ baseUrl: API_URL });
