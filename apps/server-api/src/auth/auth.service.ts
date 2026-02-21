import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../common/prisma.service';
import {
  GoogleProfile,
  OAuthProfile,
  OAuthProvider,
  TokenResponseDto,
  AuthCallbackResultDto,
  UserProfileDto,
  UpdatePreferencesDto,
} from './dto/auth.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshExpiryDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.refreshExpiryDays = parseInt(
      this.configService.get<string>('JWT_REFRESH_EXPIRY_DAYS', '7'),
      10,
    );
  }

  /**
   * Find or create a user from a Google OAuth profile.
   */
  async validateGoogleUser(
    profile: GoogleProfile,
  ): Promise<AuthCallbackResultDto> {
    let user = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });

    if (!user) {
      // Check if a user with the same email already exists (link accounts)
      user = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (user) {
        // Link Google account to existing user
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: profile.googleId,
            avatarUrl: user.avatarUrl ?? profile.avatarUrl,
            name: user.name ?? profile.name,
          },
        });
        this.logger.log(`Linked Google account to existing user ${user.id}`);
      } else {
        // Create a brand-new user
        user = await this.prisma.user.create({
          data: {
            email: profile.email,
            name: profile.name,
            avatarUrl: profile.avatarUrl,
            googleId: profile.googleId,
          },
        });
        this.logger.log(`Created new user ${user.id} for ${profile.email}`);
      }
    }

    const tokens = await this.generateTokens(user.id, user.email);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        isSuperAdmin: user.isSuperAdmin ?? false,
        preferences: user.preferences as Record<string, unknown> | null,
      },
    };
  }

  /**
   * Generic OAuth validation — works for Microsoft, Apple, Discord (and Google
   * if migrated in future). Maps each provider to its unique ID column on User.
   */
  async validateOAuthUser(
    profile: OAuthProfile,
  ): Promise<AuthCallbackResultDto> {
    const idField = this.providerIdField(profile.provider);

    // 1. Find by provider ID
    let user = await this.prisma.user.findUnique({
      where: { [idField]: profile.providerId } as unknown as Prisma.UserWhereUniqueInput,
    });

    if (!user) {
      // 2. Check if email already exists (account linking)
      user = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            [idField]: profile.providerId,
            avatarUrl: user.avatarUrl ?? profile.avatarUrl,
            name: user.name ?? profile.name,
          },
        });
        this.logger.log(`Linked ${profile.provider} to existing user ${user.id}`);
      } else {
        // 3. Create new user
        user = await this.prisma.user.create({
          data: {
            email: profile.email,
            name: profile.name,
            avatarUrl: profile.avatarUrl,
            [idField]: profile.providerId,
          },
        });
        this.logger.log(`Created new user ${user.id} via ${profile.provider} for ${profile.email}`);
      }
    }

    const tokens = await this.generateTokens(user.id, user.email);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        isSuperAdmin: user.isSuperAdmin ?? false,
        preferences: user.preferences as Record<string, unknown> | null,
      },
    };
  }

  private providerIdField(provider: OAuthProvider): string {
    const map: Record<OAuthProvider, string> = {
      google: 'googleId',
      microsoft: 'microsoftId',
      apple: 'appleId',
      discord: 'discordId',
    };
    return map[provider];
  }

  /**
   * Generate an access token (short-lived) and a refresh token (long-lived).
   */
  async generateTokens(
    userId: string,
    email: string,
  ): Promise<TokenResponseDto> {
    const accessToken = this.jwtService.sign(
      { sub: userId, email },
      { issuer: 'nvremote-api', audience: 'nvremote' },
    );

    const refreshTokenValue = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshExpiryDays);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshTokenValue,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  /**
   * Exchange a valid refresh token for a new token pair.
   */
  async refreshTokens(refreshToken: string): Promise<TokenResponseDto> {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.expiresAt < new Date()) {
      // Clean up expired token
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Rotate: delete old token, issue new pair
    await this.prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    return this.generateTokens(storedToken.userId, storedToken.user.email);
  }

  /**
   * Invalidate a refresh token on logout.
   */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken
      .delete({ where: { token: refreshToken } })
      .catch(() => {
        // Token may already be deleted or not exist; swallow error
      });
  }

  /**
   * Retrieve the current user's profile.
   */
  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      isSuperAdmin: user.isSuperAdmin ?? false,
      preferences: user.preferences as Record<string, unknown> | null,
    };
  }

  /**
   * Update the current user's profile (display name and/or streaming preferences).
   */
  async updateProfile(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<UserProfileDto> {
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.preferences !== undefined)
      data.preferences = dto.preferences as Prisma.InputJsonValue;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      isSuperAdmin: user.isSuperAdmin ?? false,
      preferences: user.preferences as Record<string, unknown> | null,
    };
  }
}
