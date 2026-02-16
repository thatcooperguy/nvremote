import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsObject,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HostStatus } from '@prisma/client';

export class RegisterHostDto {
  @ApiProperty({ description: 'Bootstrap token issued by the org admin' })
  @IsString()
  @IsNotEmpty()
  bootstrapToken!: string;

  @ApiProperty({ description: 'Display name for the host' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: 'OS hostname of the machine' })
  @IsString()
  @IsNotEmpty()
  hostname!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publicIp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  privateIp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gpuInfo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nvstreamerVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  nvstreamerPorts?: Record<string, number>;
}

export class HeartbeatDto {
  @ApiPropertyOptional({ enum: HostStatus })
  @IsOptional()
  @IsEnum(HostStatus)
  status?: HostStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publicIp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gpuInfo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nvstreamerVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  nvstreamerPorts?: Record<string, number>;
}

export class UpdateHostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: HostStatus })
  @IsOptional()
  @IsEnum(HostStatus)
  status?: HostStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gpuInfo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  nvstreamerPorts?: Record<string, number>;
}

export class GenerateBootstrapTokenDto {
  @ApiPropertyOptional({
    description: 'Optional human-readable label for the token',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class HostResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  hostname!: string;

  @ApiProperty({ enum: HostStatus })
  status!: HostStatus;

  @ApiPropertyOptional()
  publicIp?: string | null;

  @ApiPropertyOptional()
  privateIp?: string | null;

  @ApiPropertyOptional()
  tunnelIp?: string | null;

  @ApiPropertyOptional()
  gpuInfo?: string | null;

  @ApiPropertyOptional()
  nvstreamerVersion?: string | null;

  @ApiPropertyOptional()
  nvstreamerPorts?: Record<string, number> | null;

  @ApiPropertyOptional()
  lastSeenAt?: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'Host API token (only returned during registration)' })
  apiToken?: string;
}

export class BootstrapTokenResponseDto {
  @ApiProperty()
  token!: string;

  @ApiProperty()
  orgId!: string;
}
