import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    // Non-blocking: connect in background so NestJS can start listening immediately.
    // Prisma auto-connects on first query, so this is just an eagerness optimization.
    this.logger.log('Scheduling database connection (non-blocking)...');
    this.connectWithRetry().catch(() => {
      // Swallow — the app will auto-connect on first query
    });
  }

  private async connectWithRetry(): Promise<void> {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Database connection established');
        return;
      } catch (error) {
        this.logger.warn(
          `Database connection attempt ${attempt}/5 failed: ${(error as Error).message}`,
        );
        if (attempt < 5) {
          const delay = attempt * 3000;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    this.logger.error('Failed to connect to database after 5 attempts — will auto-connect on first query');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
  }
}
