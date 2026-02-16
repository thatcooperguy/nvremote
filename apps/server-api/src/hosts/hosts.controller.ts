import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Headers,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { HostsService } from './hosts.service';
import {
  RegisterHostDto,
  HeartbeatDto,
  UpdateHostDto,
  GenerateBootstrapTokenDto,
  HostResponseDto,
  BootstrapTokenResponseDto,
} from './dto/hosts.dto';

@ApiTags('hosts')
@Controller()
export class HostsController {
  constructor(private readonly hostsService: HostsService) {}

  /**
   * Host agent calls this to register itself using a bootstrap token.
   * No JWT required — the bootstrap token serves as the credential.
   */
  @Post('hosts/register')
  @Public()
  @ApiOperation({ summary: 'Register a host agent with a bootstrap token' })
  @ApiCreatedResponse({ type: HostResponseDto })
  async register(@Body() dto: RegisterHostDto): Promise<HostResponseDto> {
    return this.hostsService.registerHost(dto);
  }

  /**
   * List all registered hosts in the given organisation.
   * SECURITY: Verifies the requesting user is a member of the org.
   */
  @Get('hosts')
  @ApiBearerAuth()
  @ApiOperation({ summary: "List hosts in user's org" })
  @ApiQuery({ name: 'orgId', required: true })
  @ApiOkResponse({ type: [HostResponseDto] })
  async list(
    @Query('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<HostResponseDto[]> {
    return this.hostsService.getHostsForOrg(orgId, user.sub);
  }

  /**
   * Get a single host by ID.
   * SECURITY: Verifies the requesting user is a member of the host's org.
   */
  @Get('hosts/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get host by ID' })
  @ApiOkResponse({ type: HostResponseDto })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<HostResponseDto> {
    return this.hostsService.getHost(id, user.sub);
  }

  /**
   * Host agent heartbeat.
   * SECURITY: Authenticated via X-Host-API-Token header (issued during registration).
   * This uses @Public() to bypass JWT (host agents don't have user JWTs),
   * but the service validates the host-specific API token.
   */
  @Post('hosts/:id/heartbeat')
  @Public()
  @ApiOperation({ summary: 'Host agent heartbeat' })
  @ApiHeader({ name: 'X-Host-API-Token', required: true, description: 'Host API token from registration' })
  @ApiOkResponse({ type: HostResponseDto })
  async heartbeat(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-host-api-token') apiToken: string,
    @Body() dto: HeartbeatDto,
  ): Promise<HostResponseDto> {
    return this.hostsService.heartbeat(id, apiToken, dto);
  }

  /**
   * Update host metadata (name, status, etc.).
   * SECURITY: Verifies user is a member of the host's org (checked in service).
   */
  @Patch('hosts/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update host metadata' })
  @ApiOkResponse({ type: HostResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateHostDto,
  ): Promise<HostResponseDto> {
    return this.hostsService.updateHost(id, user.sub, dto);
  }

  /**
   * Deregister (delete) a host.
   * SECURITY: Requires org ADMIN role (checked in service).
   */
  @Delete('hosts/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deregister a host' })
  async deregister(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.hostsService.deregisterHost(id, user.sub);
  }

  /**
   * Admin generates a bootstrap token for the organisation.
   * SECURITY: Requires org ADMIN role (checked in service).
   */
  @Post('orgs/:orgId/hosts/bootstrap-token')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a bootstrap token for host registration' })
  @ApiCreatedResponse({ type: BootstrapTokenResponseDto })
  async generateBootstrapToken(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
    @Body() _dto: GenerateBootstrapTokenDto,
  ): Promise<BootstrapTokenResponseDto> {
    return this.hostsService.generateBootstrapToken(orgId, user.sub);
  }
}
