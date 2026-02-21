import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { SessionStatus } from '@prisma/client';

/**
 * Periodically checks for idle sessions and terminates them.
 *
 * A session is considered idle if it has been in ACTIVE status for longer
 * than the configured timeout without any heartbeat or QoS stat update.
 *
 * Configuration:
 *   SESSION_IDLE_TIMEOUT_MINUTES — minutes of inactivity before auto-end (default: 30)
 *   SESSION_MAX_DURATION_HOURS   — maximum session duration regardless of activity (default: 24)
 */
@Injectable()
export class SessionTimeoutService {
  private readonly logger = new Logger(SessionTimeoutService.name);
  private readonly idleTimeoutMs: number;
  private readonly maxDurationMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.idleTimeoutMs =
      this.config.get<number>('SESSION_IDLE_TIMEOUT_MINUTES', 30) * 60 * 1000;
    this.maxDurationMs =
      this.config.get<number>('SESSION_MAX_DURATION_HOURS', 24) * 60 * 60 * 1000;
  }

  /**
   * Run every 5 minutes to check for idle/expired sessions.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleSessionTimeouts(): Promise<void> {
    const now = new Date();

    // Find active sessions that have exceeded the idle timeout
    const idleCutoff = new Date(now.getTime() - this.idleTimeoutMs);
    const maxDurationCutoff = new Date(now.getTime() - this.maxDurationMs);

    try {
      // End sessions that have been idle too long.
      //
      // We check two things to determine "last activity":
      //   1. metadata.qosStats.updatedAt — set every ~2s by the host agent
      //   2. metadata.clientStats.reportedAt — set every ~5s by the client
      //
      // If neither timestamp exists (pre-streaming or broken pipeline), we
      // fall back to startedAt. This prevents zombie sessions from lingering
      // when the host agent crashes mid-stream.
      const activeSessions = await this.prisma.session.findMany({
        where: { status: SessionStatus.ACTIVE },
        select: { id: true, startedAt: true, metadata: true },
      });

      const sessionsToEnd: string[] = [];
      for (const session of activeSessions) {
        const meta = session.metadata as Record<string, unknown> | null;
        let lastActivity = session.startedAt.getTime();

        // Check QoS stats timestamp from host agent
        const qos = meta?.qosStats as Record<string, unknown> | undefined;
        if (qos?.updatedAt) {
          const qosTime = new Date(qos.updatedAt as string).getTime();
          if (!isNaN(qosTime) && qosTime > lastActivity) lastActivity = qosTime;
        }

        // Check client stats timestamp
        const client = meta?.clientStats as Record<string, unknown> | undefined;
        if (client?.reportedAt) {
          const clientTime = new Date(client.reportedAt as string).getTime();
          if (!isNaN(clientTime) && clientTime > lastActivity) lastActivity = clientTime;
        }

        if (lastActivity < idleCutoff.getTime()) {
          sessionsToEnd.push(session.id);
        }
      }

      let idleCount = 0;
      if (sessionsToEnd.length > 0) {
        const idleResult = await this.prisma.session.updateMany({
          where: { id: { in: sessionsToEnd } },
          data: { status: SessionStatus.ENDED, endedAt: now },
        });
        idleCount = idleResult.count;
      }

      if (idleCount > 0) {
        this.logger.warn(
          `Auto-ended ${idleCount} idle session(s) (no activity > ${this.idleTimeoutMs / 60000}min)`,
        );
      }

      // End sessions that have exceeded maximum duration
      const maxResult = await this.prisma.session.updateMany({
        where: {
          status: SessionStatus.ACTIVE,
          startedAt: { lt: maxDurationCutoff },
        },
        data: {
          status: SessionStatus.ENDED,
          endedAt: now,
        },
      });

      if (maxResult.count > 0) {
        this.logger.warn(
          `Auto-ended ${maxResult.count} session(s) exceeding max duration (${this.maxDurationMs / 3600000}h)`,
        );
      }

      // Clean up any PENDING sessions older than 5 minutes (never accepted)
      const pendingCutoff = new Date(now.getTime() - 5 * 60 * 1000);
      const pendingResult = await this.prisma.session.updateMany({
        where: {
          status: SessionStatus.PENDING,
          startedAt: { lt: pendingCutoff },
        },
        data: {
          status: SessionStatus.ENDED,
          endedAt: now,
        },
      });

      if (pendingResult.count > 0) {
        this.logger.log(
          `Cleaned up ${pendingResult.count} stale PENDING session(s)`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Session timeout check failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
