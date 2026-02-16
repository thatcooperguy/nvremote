import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from './common/prisma.service';
import { SessionTimeoutService } from './common/session-timeout.service';
import { AuthModule } from './auth/auth.module';
import { OrgsModule } from './orgs/orgs.module';
import { HostsModule } from './hosts/hosts.module';
import { SessionsModule } from './sessions/sessions.module';
import { SignalingModule } from './signaling/signaling.module';
import { AuditModule } from './audit/audit.module';
import { AdminModule } from './admin/admin.module';
import { VpnModule } from './vpn/vpn.module';
import { TunnelModule } from './tunnel/tunnel.module';

@Module({
  imports: [
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
  ],
  providers: [
    PrismaService,
    SessionTimeoutService,

    // Apply rate limiting globally to all HTTP endpoints
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [PrismaService],
})
export class AppModule {}
