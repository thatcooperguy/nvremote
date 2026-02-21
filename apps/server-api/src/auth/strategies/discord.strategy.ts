import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-discord';
import { OAuthProfile } from '../dto/auth.dto';

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, 'discord') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('DISCORD_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('DISCORD_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('DISCORD_CALLBACK_URL'),
      scope: ['identify', 'email'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: Error | null, user?: OAuthProfile) => void,
  ): void {
    const avatarHash = profile.avatar;
    const avatarUrl = avatarHash
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${avatarHash}.png`
      : undefined;

    const oauthProfile: OAuthProfile = {
      provider: 'discord',
      providerId: profile.id,
      email: profile.email ?? '',
      name: profile.global_name || profile.username,
      avatarUrl,
    };

    done(null, oauthProfile);
  }
}
