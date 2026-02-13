import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
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
   * No JWT required -- the bootstrap token serves as the credential.
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
   */
  @Get('hosts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List hosts in user's org" })
  @ApiQuery({ name: 'orgId', required: true })
  @ApiOkResponse({ type: [HostResponseDto] })
  async list(
    @Query('orgId', ParseUUIDPipe) orgId: string,
  ): Promise<HostResponseDto[]> {
    return this.hostsService.getHostsForOrg(orgId);
  }

  /**
   * Get a single host by ID.
   */
  @Get('hosts/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get host by ID' })
  @ApiOkResponse({ type: HostResponseDto })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HostResponseDto> {
    return this.hostsService.getHost(id);
  }

  /**
   * Host agent heartbeat.
   */
  @Post('hosts/:id/heartbeat')
  @Public()
  @ApiOperation({ summary: 'Host agent heartbeat' })
  @ApiOkResponse({ type: HostResponseDto })
  async heartbeat(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HeartbeatDto,
  ): Promise<HostResponseDto> {
    return this.hostsService.heartbeat(id, dto);
  }

  /**
   * Update host metadata (name, status, etc.).
   */
  @Patch('hosts/:id')
  @UseGuards(JwtAuthGuard)
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
   */
  @Delete('hosts/:id')
  @UseGuards(JwtAuthGuard)
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
   */
  @Post('orgs/:orgId/hosts/bootstrap-token')
  @UseGuards(JwtAuthGuard)
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
