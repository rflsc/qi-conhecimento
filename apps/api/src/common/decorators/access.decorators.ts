import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@qi-conhecimento/shared-types';

export const IS_PUBLIC_KEY = 'isPublic';
export const PublicAccess = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
