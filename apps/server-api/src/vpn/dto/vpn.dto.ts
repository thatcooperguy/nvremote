import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max } from 'class-validator';

// ---------------------------------------------------------------------------
// Register Peer — Host agent registers as a WireGuard peer on startup
// ---------------------------------------------------------------------------

export class RegisterPeerDto {
  @ApiProperty({ description: 'Public key of the WireGuard peer (base64)' })
  @IsString()
  @IsNotEmpty()
  publicKey!: string;

  @ApiPropertyOptional({
    description: 'Preferred endpoint for the peer (host:port). Auto-detected if omitted.',
  })
  @IsOptional()
  @IsString()
  endpoint?: string;

  @ApiPropertyOptional({
    description: 'Keepalive interval in seconds',
    default: 25,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  keepalive?: number;
}

export class PeerRegistrationResponseDto {
  @ApiProperty({ description: 'Assigned VPN IP address for the peer' })
  assignedIp!: string;

  @ApiProperty({ description: 'WireGuard relay server public key' })
  serverPublicKey!: string;

  @ApiProperty({ description: 'WireGuard relay server endpoint (host:port)' })
  serverEndpoint!: string;

  @ApiProperty({ description: 'VPN subnet CIDR (e.g. 10.100.0.0/16)' })
  subnet!: string;

  @ApiProperty({ description: 'DNS server for the VPN tunnel' })
  dns!: string;
}

// ---------------------------------------------------------------------------
// VPN Config — Client requests VPN tunnel config for a session
// ---------------------------------------------------------------------------

export class VpnConfigRequestDto {
  @ApiProperty({ description: 'Public key of the WireGuard client (base64)' })
  @IsString()
  @IsNotEmpty()
  publicKey!: string;

  @ApiPropertyOptional({ description: 'Session ID to route through VPN' })
  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class VpnConfigResponseDto {
  @ApiProperty({ description: 'Assigned VPN IP address for the client' })
  assignedIp!: string;

  @ApiProperty({ description: 'WireGuard relay server public key' })
  serverPublicKey!: string;

  @ApiProperty({ description: 'WireGuard relay server endpoint (host:port)' })
  serverEndpoint!: string;

  @ApiProperty({ description: 'VPN subnet CIDR' })
  subnet!: string;

  @ApiProperty({ description: 'DNS server for the VPN tunnel' })
  dns!: string;

  @ApiPropertyOptional({
    description: 'Allowed IPs to route through the tunnel (CIDR list)',
  })
  allowedIps?: string[];

  @ApiPropertyOptional({
    description: 'VPN IP of the target host (for session-based routing)',
  })
  hostVpnIp?: string;
}

// ---------------------------------------------------------------------------
// VPN Status — Admin view of VPN infrastructure
// ---------------------------------------------------------------------------

export class VpnRelayStatusDto {
  @ApiProperty({ description: 'Whether VPN relay is configured and available' })
  available!: boolean;

  @ApiPropertyOptional({ description: 'Relay server endpoint' })
  serverEndpoint?: string;

  @ApiPropertyOptional({ description: 'Number of registered peers' })
  registeredPeers?: number;

  @ApiPropertyOptional({ description: 'VPN subnet' })
  subnet?: string;

  @ApiPropertyOptional({ description: 'Relay server region' })
  region?: string;
}
