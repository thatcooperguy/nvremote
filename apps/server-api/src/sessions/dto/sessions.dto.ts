import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsUUID,
  IsArray,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SessionStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

export class CreateSessionDto {
  @ApiProperty({ description: 'ID of the host to connect to' })
  @IsUUID()
  @IsNotEmpty()
  hostId!: string;

  @ApiPropertyOptional({
    description:
      'Ordered list of preferred codecs (e.g. ["h265", "h264", "av1"]). ' +
      'The host will pick the first mutually supported codec.',
    example: ['h265', 'h264'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  codecs?: string[];

  @ApiPropertyOptional({
    description:
      'Enable gaming mode (lower latency, disables B-frames, etc.)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  gamingMode?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum bitrate in kbps the client can receive',
    example: 20000,
  })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(150000)
  maxBitrate?: number;

  @ApiPropertyOptional({
    description: 'Target frames per second',
    example: 60,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(240)
  targetFps?: number;

  @ApiPropertyOptional({
    description: 'Desired resolution (e.g. "1920x1080")',
    example: '1920x1080',
  })
  @IsOptional()
  @IsString()
  resolution?: string;

  @ApiPropertyOptional({
    description: 'Client IP address (auto-detected if omitted)',
  })
  @IsOptional()
  @IsString()
  clientIp?: string;

  @ApiPropertyOptional({
    description: 'Arbitrary metadata about the session',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

export class SessionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  hostId!: string;

  @ApiProperty({ enum: SessionStatus })
  status!: SessionStatus;

  @ApiProperty()
  startedAt!: Date;

  @ApiPropertyOptional()
  endedAt?: Date | null;

  @ApiPropertyOptional()
  clientIp?: string | null;

  @ApiPropertyOptional()
  metadata?: Record<string, unknown> | null;
}

/**
 * ICE / STUN / TURN server configuration returned to the client so it can
 * establish a peer-to-peer connection with the host.
 */
export class IceServerDto {
  @ApiProperty({
    description: 'STUN or TURN server URL',
    example: 'stun:stun.l.google.com:19302',
  })
  urls!: string;

  @ApiPropertyOptional({ description: 'Username (TURN servers only)' })
  username?: string;

  @ApiPropertyOptional({ description: 'Credential (TURN servers only)' })
  credential?: string;
}

/**
 * Full connection payload returned by POST /hosts/:id/connect and
 * POST /sessions.
 *
 * The client uses the ICE servers to begin WebRTC peer connection
 * negotiation.  All further signaling (offer/answer/candidates) flows
 * through the WebSocket signaling gateway.
 */
export class SessionConnectionInfoDto {
  @ApiProperty({ description: 'Unique session identifier' })
  sessionId!: string;

  @ApiProperty({
    description: 'STUN servers for ICE candidate gathering',
    type: [String],
    example: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  })
  stunServers!: string[];

  @ApiPropertyOptional({
    description: 'TURN relay servers (optional, for fallback connectivity)',
    type: [IceServerDto],
  })
  turnServers?: IceServerDto[];
}
