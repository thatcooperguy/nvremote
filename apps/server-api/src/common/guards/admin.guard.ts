import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * Guard that restricts access to platform super-administrators ONLY.
 *
 * A super-admin is a user with `isSuperAdmin = true` in the database.
 * This flag is ONLY set via direct DB update or migration — it cannot
 * be self-assigned through any API endpoint.
 *
 * SECURITY FIX: Previously, any user who held ADMIN in any org was
 * treated as a platform admin, which meant anyone who created an org
 * could see ALL customers' data. Now only the platform owner(s) with
 * the isSuperAdmin flag can access platform-wide dashboards.
 *
 * Protected endpoints:
 *   - GET /admin/stats — platform-wide statistics
 *   - GET /admin/sessions — all sessions across all orgs
 *   - GET /admin/hosts — all hosts across all orgs
 *   - GET /admin/qos — QoS analytics
 *   - GET /admin/clients — client insights
 *   - GET /admin/errors — error dashboard
 *   - GET /admin/infra — infrastructure status (STUN/TURN)
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { isSuperAdmin: true },
    });

    if (!dbUser?.isSuperAdmin) {
      throw new ForbiddenException(
        'Platform admin access required. This area is restricted to platform operators.',
      );
    }

    return true;
  }
}
