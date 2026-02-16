import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { SessionsService } from './sessions.service';
import { WebRtcRelayService } from './webrtc-relay.service';
import {
  CreateSessionDto,
  SessionResponseDto,
  SessionConnectionInfoDto,
} from './dto/sessions.dto';
import {
  SdpOfferDto,
  SdpAnswerResponseDto,
  IceCandidateDto,
  IceCandidatesResponseDto,
} from './dto/webrtc-signaling.dto';

@ApiTags('sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly webRtcRelay: WebRtcRelayService,
  ) {}

  /**
   * Create a new streaming session (request to connect to a host).
   * Rate limited to 5 per minute to prevent session abuse.
   */
  @Post()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Create a new streaming session' })
  @ApiCreatedResponse({ type: SessionConnectionInfoDto })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSessionDto,
  ): Promise<SessionConnectionInfoDto> {
    return this.sessionsService.createSession(user.sub, dto);
  }

  /**
   * List the current user's sessions.
   */
  @Get()
  @ApiOperation({ summary: "List user's sessions" })
  @ApiOkResponse({ type: [SessionResponseDto] })
  async list(
    @CurrentUser() user: JwtPayload,
  ): Promise<SessionResponseDto[]> {
    return this.sessionsService.listSessions(user.sub);
  }

  /**
   * Get a specific session by ID.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get session by ID' })
  @ApiOkResponse({ type: SessionResponseDto })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SessionResponseDto> {
    return this.sessionsService.getSession(id, user.sub);
  }

  /**
   * End an active session.
   */
  @Post(':id/end')
  @ApiOperation({ summary: 'End an active session' })
  @ApiOkResponse({ type: SessionResponseDto })
  async end(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SessionResponseDto> {
    return this.sessionsService.endSession(id, user.sub);
  }

  // -----------------------------------------------------------------------
  // WebRTC signaling relay (REST-based, for web client)
  // -----------------------------------------------------------------------

  /**
   * Send an SDP offer for a session (web client → host).
   * The API relays the offer to the host via Socket.IO and waits for
   * the SDP answer, which is returned synchronously.
   * Rate limited: 5 per minute (one offer per session is typical).
   */
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post(':id/offer')
  @ApiOperation({
    summary: 'Send SDP offer (web client)',
    description:
      'Relays the SDP offer to the host and returns the SDP answer. ' +
      'Used by the browser-based web client for WebRTC negotiation.',
  })
  @ApiOkResponse({ type: SdpAnswerResponseDto })
  async sendOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SdpOfferDto,
  ): Promise<SdpAnswerResponseDto> {
    return this.webRtcRelay.handleOffer(id, user.sub, dto);
  }

  /**
   * Send an ICE candidate for a session (web client → host).
   */
  @Post(':id/ice-candidate')
  @ApiOperation({
    summary: 'Send ICE candidate (web client)',
    description:
      'Relays a trickled ICE candidate from the web client to the host.',
  })
  @ApiOkResponse({ description: 'Candidate accepted' })
  async sendIceCandidate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: IceCandidateDto,
  ): Promise<{ success: boolean }> {
    return this.webRtcRelay.addClientCandidate(id, user.sub, dto);
  }

  /**
   * Poll for host ICE candidates (web client polls for new candidates).
   */
  @Get(':id/ice-candidates')
  @ApiOperation({
    summary: 'Get host ICE candidates (web client)',
    description:
      'Returns ICE candidates from the host that the web client has not yet seen. ' +
      'The web client should poll this endpoint until gatheringComplete is true.',
  })
  @ApiOkResponse({ type: IceCandidatesResponseDto })
  async getIceCandidates(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<IceCandidatesResponseDto> {
    return this.webRtcRelay.getHostCandidates(id, user.sub);
  }
}
