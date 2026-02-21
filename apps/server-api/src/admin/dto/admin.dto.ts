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
  hostVersion?: string | null;

  @ApiPropertyOptional()
  lastSeenAt?: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ description: 'Number of active sessions on this host' })
  activeSessions!: number;

  @ApiProperty({ description: 'Total sessions this host has served' })
  totalSessions!: number;
}

// ---------------------------------------------------------------------------
// QoS Analytics
// ---------------------------------------------------------------------------

export class QosAnalyticsDto {
  @ApiProperty({ description: 'Codec distribution across recent sessions' })
  codecDistribution!: Record<string, number>;

  @ApiProperty({ description: 'Resolution distribution across recent sessions' })
  resolutionDistribution!: Record<string, number>;

  @ApiProperty({ description: 'Profile distribution across recent sessions' })
  profileDistribution!: Record<string, number>;

  @ApiProperty({ description: 'Connection type distribution' })
  connectionTypeDistribution!: Record<string, number>;

  @ApiProperty({ description: 'Average bitrate across active sessions (kbps)' })
  avgBitrateKbps!: number;

  @ApiProperty({ description: 'Average packet loss across active sessions (%)' })
  avgPacketLossPercent!: number;

  @ApiProperty({ description: 'Average RTT across active sessions (ms)' })
  avgRttMs!: number;

  @ApiProperty({ description: 'Average jitter across active sessions (ms)' })
  avgJitterMs!: number;

  @ApiProperty({ description: 'Total sessions analyzed' })
  totalSessionsAnalyzed!: number;
}

// ---------------------------------------------------------------------------
// Client Insights
// ---------------------------------------------------------------------------

export class ClientInsightsDto {
  @ApiProperty({ description: 'Platform distribution (Android, Windows, etc.)' })
  platformDistribution!: Record<string, number>;

  @ApiProperty({ description: 'Failure rate by platform (%)' })
  failureRateByPlatform!: Record<string, number>;

  @ApiProperty({ description: 'Decoder support matrix' })
  decoderSupport!: Record<string, number>;

  @ApiProperty({ description: 'Average session duration by platform (seconds)' })
  avgSessionDurationByPlatform!: Record<string, number>;

  @ApiProperty({ description: 'Total unique clients' })
  totalClients!: number;
}

// ---------------------------------------------------------------------------
// Error Dashboard
// ---------------------------------------------------------------------------

export class ErrorEntryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiPropertyOptional()
  hostName?: string | null;

  @ApiPropertyOptional()
  gpuInfo?: string | null;

  @ApiProperty()
  errorType!: string;

  @ApiPropertyOptional()
  errorMessage?: string | null;

  @ApiProperty()
  occurredAt!: Date;

  @ApiPropertyOptional()
  platform?: string | null;

  @ApiPropertyOptional()
  codec?: string | null;
}

export class ErrorSummaryDto {
  @ApiProperty({ description: 'Total errors in the time window' })
  totalErrors!: number;

  @ApiProperty({ description: 'Errors grouped by type' })
  errorsByType!: Record<string, number>;

  @ApiProperty({ description: 'Errors grouped by GPU model' })
  errorsByGpu!: Record<string, number>;

  @ApiProperty({ description: 'Recent errors' })
  recentErrors!: ErrorEntryDto[];
}

// ---------------------------------------------------------------------------
// Infrastructure Health
// ---------------------------------------------------------------------------

export class ServiceHealthDto {
  @ApiProperty({ enum: ['ok', 'degraded', 'down'] })
  status!: 'ok' | 'degraded' | 'down';

  @ApiProperty({ description: 'Response time in milliseconds' })
  responseTimeMs!: number;
}

export class InfraHealthDto {
  @ApiProperty({ description: 'API server health' })
  api!: ServiceHealthDto & {
    uptimeSeconds: number;
    version: string;
  };

  @ApiProperty({ description: 'Database health' })
  database!: ServiceHealthDto & {
    activeConnections: number;
    databaseSizeMb: number;
  };

  @ApiProperty({ description: 'Website health' })
  website!: ServiceHealthDto & {
    url: string;
  };

  @ApiProperty({ description: 'TURN server status' })
  turn!: {
    enabled: boolean;
    serverCount: number;
    hasCredentials: boolean;
  };

  @ApiProperty({ description: 'STUN server status' })
  stun!: {
    serverCount: number;
    servers: string[];
  };

  @ApiProperty({ description: 'Timestamp of the check' })
  checkedAt!: string;
}

// ---------------------------------------------------------------------------
// Platform Billing Overview (Admin)
// ---------------------------------------------------------------------------

export class OrgRevenueDto {
  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  orgName!: string;

  @ApiProperty()
  totalCents!: number;

  @ApiProperty()
  currentMonthCents!: number;

  @ApiProperty()
  totalBandwidthBytes!: string;
}

export class MonthlyTrendDto {
  @ApiProperty({ description: 'Month in YYYY-MM format' })
  month!: string;

  @ApiProperty()
  revenueCents!: number;

  @ApiProperty()
  bandwidthBytes!: string;
}

export class PlatformBillingDto {
  @ApiProperty({ description: 'All-time revenue from PAID periods (cents)' })
  totalRevenueCents!: number;

  @ApiProperty({ description: 'Current month projected revenue (cents)' })
  currentMonthCents!: number;

  @ApiProperty({ description: 'Monthly recurring revenue — avg of last 3 months (cents)' })
  mrrCents!: number;

  @ApiProperty({ description: 'Total billing accounts' })
  totalBillingAccounts!: number;

  @ApiProperty({ description: 'All-time bandwidth in bytes' })
  totalBandwidthBytes!: string;

  @ApiProperty({ description: 'Revenue breakdown by organization' })
  revenueByOrg!: OrgRevenueDto[];

  @ApiProperty({ description: 'Monthly revenue trend (last 6 months)' })
  monthlyTrend!: MonthlyTrendDto[];

  @ApiProperty({ description: 'Period count by status' })
  periodsByStatus!: Record<string, number>;
}

// ---------------------------------------------------------------------------
// User Management (Admin)
// ---------------------------------------------------------------------------

export class AdminUserQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsOptional()
  @IsString()
  search?: string;

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

export class AdminUserOrgDto {
  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  orgName!: string;

  @ApiProperty()
  orgSlug!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty()
  joinedAt!: Date;
}

export class AdminUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional()
  name?: string | null;

  @ApiPropertyOptional()
  avatarUrl?: string | null;

  @ApiProperty()
  isSuperAdmin!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  totalSessions!: number;

  @ApiProperty({ description: 'Org memberships' })
  orgs!: AdminUserOrgDto[];

  @ApiProperty({ description: 'Auth providers (google, microsoft, apple, discord)' })
  authProviders!: string[];
}

export class AdminUserListDto {
  @ApiProperty({ type: [AdminUserDto] })
  data!: AdminUserDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
