import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';
import { SessionsService } from '../sessions/sessions.service';
import { SessionConnectionInfoDto } from '../sessions/dto/sessions.dto';

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

export class ConnectDto {
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
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * Handles POST /hosts/:id/connect -- the primary endpoint the client app
 * calls to establish a streaming session with a host.
 *
 * The server creates a session, returns STUN/TURN server configuration,
 * and notifies the host agent via WebSocket signaling.  The actual P2P
 * connection is negotiated asynchronously through ICE candidates relayed
 * over the signaling channel.
 */
@ApiTags('hosts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('hosts')
export class ConnectController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post(':id/connect')
  @ApiOperation({
    summary: 'Connect to a host and start a streaming session',
    description:
      'Creates a session and returns the ICE server configuration. ' +
      'P2P negotiation proceeds asynchronously via the signaling WebSocket.',
  })
  @ApiCreatedResponse({
    type: SessionConnectionInfoDto,
    description: 'Session ID and ICE server configuration for P2P setup',
  })
  async connect(
    @Param('id', ParseUUIDPipe) hostId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConnectDto,
  ): Promise<SessionConnectionInfoDto> {
    return this.sessionsService.createSession(user.sub, {
      hostId,
      codecs: dto.codecs,
      gamingMode: dto.gamingMode,
      maxBitrate: dto.maxBitrate,
      targetFps: dto.targetFps,
      resolution: dto.resolution,
    });
  }
}
