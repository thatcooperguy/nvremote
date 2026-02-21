import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import Strategy from 'passport-apple';
import { OAuthProfile } from '../dto/auth.dto';

@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('APPLE_CLIENT_ID'),
      teamID: configService.getOrThrow<string>('APPLE_TEAM_ID'),
      keyID: configService.getOrThrow<string>('APPLE_KEY_ID'),
      privateKeyLocation: configService.getOrThrow<string>('APPLE_PRIVATE_KEY_PATH'),
      callbackURL: configService.getOrThrow<string>('APPLE_CALLBACK_URL'),
      scope: ['name', 'email'],
      passReqToCallback: false,
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    idToken: { sub: string; email?: string },
    profile: { name?: { firstName?: string; lastName?: string } },
    done: (err: Error | null, user?: OAuthProfile) => void,
  ): void {
    // Apple only sends name on the FIRST authorization — subsequent logins
    // return only the subject ID and email from the id_token.
    const firstName = profile?.name?.firstName ?? '';
    const lastName = profile?.name?.lastName ?? '';
    const name = [firstName, lastName].filter(Boolean).join(' ') || undefined;

    const oauthProfile: OAuthProfile = {
      provider: 'apple',
      providerId: idToken.sub,
      email: idToken.email ?? '',
      name,
    };

    done(null, oauthProfile);
  }
}
