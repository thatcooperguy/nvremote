import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max } from 'class-validator';

// ---------------------------------------------------------------------------
// Tunnel Creation — per-session authenticated tunnel
// ---------------------------------------------------------------------------

export class CreateTunnelDto {
  @ApiProperty({ description: 'Session ID to create a tunnel for' })
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @ApiPropertyOptional({
    description: 'Requested tunnel protocol (wss or https)',
    default: 'wss',
  })
  @IsOptional()
  @IsString()
  protocol?: 'wss' | 'https';

  @ApiPropertyOptional({
    description: 'Requested tunnel duration in seconds',
    default: 86400,
  })
  @IsOptional()
  @IsNumber()
  @Min(60)
  @Max(604800) // max 7 days
  ttl?: number;
}

export class TunnelResponseDto {
  @ApiProperty({ description: 'Unique tunnel identifier' })
  tunnelId!: string;

  @ApiProperty({ description: 'Tunnel endpoint URL' })
  endpoint!: string;

  @ApiProperty({ description: 'Bearer token for tunnel authentication' })
  tunnelToken!: string;

  @ApiProperty({ description: 'Tunnel expiration time (ISO 8601)' })
  expiresAt!: string;

  @ApiProperty({ description: 'Session ID this tunnel is bound to' })
  sessionId!: string;

  @ApiProperty({ description: 'Target host ID' })
  hostId!: string;

  @ApiPropertyOptional({ description: 'Target host VPN IP (if available)' })
  hostVpnIp?: string;

  @ApiPropertyOptional({ description: 'Protocol used for the tunnel' })
  protocol?: string;
}

// ---------------------------------------------------------------------------
// Tunnel Status
// ---------------------------------------------------------------------------

export class TunnelStatusDto {
  @ApiProperty({ description: 'Whether zero-trust tunnel is available' })
  available!: boolean;

  @ApiPropertyOptional({ description: 'Tunnel proxy endpoint' })
  proxyEndpoint?: string;

  @ApiPropertyOptional({ description: 'Active tunnel count' })
  activeTunnels?: number;

  @ApiPropertyOptional({ description: 'Tunnel proxy region' })
  region?: string;
}

// ---------------------------------------------------------------------------
// Tunnel Audit Entry — logged for every tunnel creation/destruction
// ---------------------------------------------------------------------------

export class TunnelAuditEntryDto {
  @ApiProperty()
  tunnelId!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  hostId!: string;

  @ApiProperty({ enum: ['created', 'destroyed', 'expired', 'revoked'] })
  action!: string;

  @ApiProperty()
  timestamp!: string;

  @ApiPropertyOptional()
  reason?: string;
}
