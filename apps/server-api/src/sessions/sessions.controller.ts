import {
  Controller,
  Get,
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
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { SessionsService } from './sessions.service';
import {
  CreateSessionDto,
  SessionResponseDto,
  SessionConnectionInfoDto,
} from './dto/sessions.dto';

@ApiTags('sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /**
   * Create a new streaming session (request to connect to a host).
   */
  @Post()
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
}
