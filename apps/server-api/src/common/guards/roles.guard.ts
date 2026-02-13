import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

interface AuthenticatedUser {
  id: string;
  email: string;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<OrgRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles are specified the endpoint is open to any authenticated user
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Resolve the org ID from route params (supports :orgId and :id for org routes)
    const orgId: string | undefined =
      request.params.orgId ?? request.params.id;

    if (!orgId) {
      throw new ForbiddenException(
        'Organisation context required for role-based access',
      );
    }

    const membership = await this.prisma.orgMember.findUnique({
      where: {
        userId_orgId: {
          userId: user.id,
          orgId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organisation',
      );
    }

    if (!requiredRoles.includes(membership.role)) {
      throw new ForbiddenException(
        `Requires one of the following roles: ${requiredRoles.join(', ')}`,
      );
    }

    // Attach membership to request for downstream use
    request.orgMembership = membership;

    return true;
  }
}
