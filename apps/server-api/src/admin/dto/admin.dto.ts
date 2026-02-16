import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SessionStatus, HostStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Platform Stats
// ---------------------------------------------------------------------------

export class PlatformStatsDto {
  @ApiProperty({ description: 'Currently active sessions' })
  activeSessions!: number;

  @ApiProperty({ description: 'Peak sessions today' })
  peakSessionsToday!: number;

  @ApiProperty({ description: 'Total sessions in the last 24h' })
  sessionsLast24h!: number;

  @ApiProperty({ description: 'Total sessions in the last 7 days' })
  sessionsLast7d!: number;

  @ApiProperty({ description: 'Session success rate (ended / total) last 24h' })
  successRate24h!: number;

  @ApiProperty({ description: 'Session success rate last 7 days' })
  successRate7d!: number;

  @ApiProperty({ description: 'Hosts currently online' })
  hostsOnline!: number;

  @ApiProperty({ description: 'Hosts currently offline' })
  hostsOffline!: number;

  @ApiProperty({ description: 'Total registered hosts' })
  hostsTotal!: number;

  @ApiProperty({ description: 'Total registered users' })
  totalUsers!: number;

  @ApiProperty({ description: 'Total organisations' })
  totalOrgs!: number;

  @ApiProperty({ description: 'Sessions using P2P connection' })
  p2pSessions!: number;

  @ApiProperty({ description: 'Sessions using TURN relay' })
  relaySessions!: number;
}

// ---------------------------------------------------------------------------
// Admin Session List
// ---------------------------------------------------------------------------

export class AdminSessionQueryDto {
  @ApiPropertyOptional({ enum: SessionStatus })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @ApiPropertyOptional({ description: 'Filter by host ID' })
  @IsOptional()
  @IsString()
  hostId?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Page size', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class AdminSessionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional()
  userName?: string | null;

  @ApiPropertyOptional()
  userEmail?: string | null;

  @ApiProperty()
  hostId!: string;

  @ApiPropertyOptional()
  hostName?: string | null;

  @ApiProperty({ enum: SessionStatus })
  status!: SessionStatus;

  @ApiProperty()
  startedAt!: Date;

  @ApiPropertyOptional()
  endedAt?: Date | null;

  @ApiPropertyOptional()
  durationMs?: number | null;

  @ApiPropertyOptional()
  clientIp?: string | null;

  @ApiPropertyOptional()
  codec?: string | null;

  @ApiPropertyOptional()
  connectionType?: string | null;

  @ApiPropertyOptional()
  gamingMode?: boolean | null;

  @ApiPropertyOptional()
  resolution?: string | null;

  @ApiPropertyOptional()
  targetFps?: number | null;

  @ApiPropertyOptional()
  maxBitrate?: number | null;

  @ApiPropertyOptional()
  metadata?: Record<string, unknown> | null;
}

export class AdminSessionListDto {
  @ApiProperty({ type: [AdminSessionDto] })
  data!: AdminSessionDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}

// ---------------------------------------------------------------------------
// Admin Host List
// ---------------------------------------------------------------------------

export class AdminHostQueryDto {
  @ApiPropertyOptional({ enum: HostStatus })
  @IsOptional()
  @IsEnum(HostStatus)
  status?: HostStatus;

  @ApiPropertyOptional({ description: 'Filter by org ID' })
  @IsOptional()
  @IsString()
  orgId?: string;
}

export class AdminHostDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orgId!: string;

  @ApiPropertyOptional()
  orgName?: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  hostname!: string;

  @ApiProperty({ enum: HostStatus })
  status!: HostStatus;

  @ApiPropertyOptional()
  publicIp?: string | null;

  @ApiPropertyOptional()
  gpuInfo?: string | null;

  @ApiPropertyOptional()
  nvstreamerVersion?: string | null;

  @ApiPropertyOptional()
  lastSeenAt?: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ description: 'Number of active sessions on this host' })
  activeSessions!: number;

  @ApiProperty({ description: 'Total sessions this host has served' })
  totalSessions!: number;
}
