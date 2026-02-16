import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface AuditLogEntry {
  orgId: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogResponseDto {
  id: string;
  orgId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  user?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an audit log entry.
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          orgId: entry.orgId,
          userId: entry.userId ?? null,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId ?? null,
          metadata: (entry.metadata ?? undefined) as Record<string, unknown> | undefined,
        },
      });
    } catch (error) {
      // Audit logging should never break the primary operation
      this.logger.error(
        `Failed to write audit log: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * List audit log entries for an organisation.
   */
  async listForOrg(
    orgId: string,
    options?: {
      limit?: number;
      offset?: number;
      action?: string;
      resourceType?: string;
    },
  ): Promise<AuditLogResponseDto[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const where: Record<string, unknown> = { orgId };

    if (options?.action) {
      where.action = options.action;
    }

    if (options?.resourceType) {
      where.resourceType = options.resourceType;
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return logs.map((log) => ({
      id: log.id,
      orgId: log.orgId,
      userId: log.userId,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      metadata: log.metadata as Record<string, unknown> | null,
      createdAt: log.createdAt,
      user: log.user,
    }));
  }
}
