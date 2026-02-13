import { SetMetadata } from '@nestjs/common';
import { OrgRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restrict an endpoint to specific organisation roles.
 *
 * Usage:
 *   @Roles(OrgRole.ADMIN)
 *   @Roles(OrgRole.ADMIN, OrgRole.MEMBER)
 */
export const Roles = (...roles: OrgRole[]) => SetMetadata(ROLES_KEY, roles);
