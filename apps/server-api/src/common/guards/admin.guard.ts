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
 * Guard that restricts access to platform administrators.
 *
 * A platform admin is any user who holds the ADMIN role in at
 * least one organisation. This is used for the admin dashboard
 * endpoints which provide platform-wide visibility.
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

    const adminMembership = await this.prisma.orgMember.findFirst({
      where: {
        userId: user.id,
        role: 'ADMIN',
      },
    });

    if (!adminMembership) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
