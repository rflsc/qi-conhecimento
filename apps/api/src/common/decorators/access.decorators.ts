import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@qi-conhecimento/shared-types';

export const IS_PUBLIC_KEY = 'isPublic';
export const PublicAccess = () => SetMetadata(IS_PUBLIC_KEY, true);

export const IS_SERVICE_KEY = 'isServiceAccess';
/**
 * Marca rotas de integração serviço-a-serviço (ex.: Qi Agents).
 * O acesso é liberado por header `X-Service-Key` (igual a `SERVICE_API_KEY`)
 * ou, em fallback, por JWT de usuário autenticado (admin testando no painel).
 * Sem `SERVICE_API_KEY` configurado, a rota fica aberta (conveniência de dev).
 */
export const ServiceAccess = () => SetMetadata(IS_SERVICE_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
