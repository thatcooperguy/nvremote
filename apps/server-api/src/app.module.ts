import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from './common/prisma.service';
import { SessionTimeoutService } from './common/session-timeout.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';
import { AuthModule } from './auth/auth.module';
import { OrgsModule } from './orgs/orgs.module';
import { HostsModule } from './hosts/hosts.module';
import { SessionsModule } from './sessions/sessions.module';
import { SignalingModule } from './signaling/signaling.module';
import { AuditModule } from './audit/audit.module';
import { AdminModule } from './admin/admin.module';
import { VpnModule } from './vpn/vpn.module';
import { TunnelModule } from './tunnel/tunnel.module';
import { HealthModule } from './health/health.module';
import { WaitlistModule } from './waitlist/waitlist.module';

@Module({
  imports: [
    // Sentry error tracking (must be first import)
    SentryModule.forRoot(),

    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting — global defaults, overridden per-endpoint as needed.
    // Default: 100 requests per 60 seconds per IP.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
          {
            name: 'strict',
            ttl: 60 * 1000, // 1 minute
            limit: 10,       // 10 requests per minute (auth endpoints)
          },
        ],
      }),
    }),

    // JWT – configured globally so other modules can inject JwtService
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_ACCESS_EXPIRY', '15m'),
        },
      }),
    }),

    // Task scheduling for session timeout cleanup
    ScheduleModule.forRoot(),

    // Feature modules
    AuthModule,
    OrgsModule,
    HostsModule,
    SessionsModule,
    SignalingModule,
    AuditModule,
    AdminModule,
    VpnModule,
    TunnelModule,
    HealthModule,
    WaitlistModule,
  ],
  providers: [
    // Sentry global exception filter — captures all unhandled exceptions
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },

    PrismaService,
    SessionTimeoutService,

    // SECURITY: Global JWT authentication — ALL endpoints require a valid JWT
    // unless explicitly marked with @Public(). This is "default-closed" security:
    // any new endpoint is automatically protected. Use @Public() decorator only
    // for truly public routes (OAuth callbacks, host registration, health checks).
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },

    // Apply rate limiting globally to all HTTP endpoints
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [PrismaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
