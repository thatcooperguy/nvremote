import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class TokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  expiresIn!: number;
}

export class UserProfileDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ required: false })
  name?: string | null;

  @ApiProperty({ required: false })
  avatarUrl?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ description: 'Whether the user is a platform super-admin' })
  isSuperAdmin!: boolean;

  @ApiPropertyOptional({ description: 'User streaming preferences' })
  preferences?: Record<string, unknown> | null;
}

export class UpdatePreferencesDto {
  @ApiProperty({ description: 'Streaming preferences object' })
  @IsObject()
  @IsOptional()
  preferences?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Display name' })
  @IsString()
  @IsOptional()
  name?: string;
}

export class AuthCallbackResultDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  expiresIn!: number;

  @ApiProperty()
  user!: UserProfileDto;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}
