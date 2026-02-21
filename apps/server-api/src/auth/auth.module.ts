import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { MicrosoftStrategy } from './strategies/microsoft.strategy';
import { AppleStrategy } from './strategies/apple.strategy';
import { DiscordStrategy } from './strategies/discord.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaService } from '../common/prisma.service';

/**
 * Conditionally register OAuth strategies based on which env vars are present.
 * This prevents the server from crashing when a provider isn't configured yet.
 */
const conditionalProviders = [
  {
    provide: 'GOOGLE_STRATEGY',
    useFactory: (config: ConfigService) => {
      if (config.get('GOOGLE_CLIENT_ID')) return new GoogleStrategy(config);
      Logger.warn('Google OAuth not configured — skipping', 'AuthModule');
      return null;
    },
    inject: [ConfigService],
  },
  {
    provide: 'MICROSOFT_STRATEGY',
    useFactory: (config: ConfigService) => {
      if (config.get('MICROSOFT_CLIENT_ID')) return new MicrosoftStrategy(config);
      Logger.warn('Microsoft OAuth not configured — skipping', 'AuthModule');
      return null;
    },
    inject: [ConfigService],
  },
  {
    provide: 'APPLE_STRATEGY',
    useFactory: (config: ConfigService) => {
      if (config.get('APPLE_CLIENT_ID')) return new AppleStrategy(config);
      Logger.warn('Apple OAuth not configured — skipping', 'AuthModule');
      return null;
    },
    inject: [ConfigService],
  },
  {
    provide: 'DISCORD_STRATEGY',
    useFactory: (config: ConfigService) => {
      if (config.get('DISCORD_CLIENT_ID')) return new DiscordStrategy(config);
      Logger.warn('Discord OAuth not configured — skipping', 'AuthModule');
      return null;
    },
    inject: [ConfigService],
  },
];

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    PrismaService,
    ...conditionalProviders,
  ],
  exports: [AuthService],
})
export class AuthModule {}
