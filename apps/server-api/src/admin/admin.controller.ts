import {
  Controller,
  Get,
  Query,
  UseGuards,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminService } from './admin.service';
import { IceConfigService } from '../common/gateway.service';
import {
  PlatformStatsDto,
  AdminSessionListDto,
  AdminSessionQueryDto,
  AdminHostDto,
  AdminHostQueryDto,
  QosAnalyticsDto,
  ClientInsightsDto,
  ErrorSummaryDto,
} from './dto/admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly iceConfig: IceConfigService,
  ) {}

  /**
   * Get platform-wide statistics for the admin dashboard.
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get platform statistics (admin only)' })
  @ApiOkResponse({ type: PlatformStatsDto })
  async getStats(): Promise<PlatformStatsDto> {
    return this.adminService.getPlatformStats();
  }

  /**
   * List all sessions across the platform with filtering and pagination.
   */
  @Get('sessions')
  @ApiOperation({ summary: 'List all sessions (admin only)' })
  @ApiOkResponse({ type: AdminSessionListDto })
  async getSessions(
    @Query() query: AdminSessionQueryDto,
  ): Promise<AdminSessionListDto> {
    return this.adminService.getAdminSessions(query);
  }

  /**
   * List all registered hosts across the platform.
   */
  @Get('hosts')
  @ApiOperation({ summary: 'List all hosts (admin only)' })
  @ApiOkResponse({ type: [AdminHostDto] })
  async getHosts(
    @Query() query: AdminHostQueryDto,
  ): Promise<AdminHostDto[]> {
    return this.adminService.getAdminHosts(query);
  }

  /**
   * Get QoS analytics across sessions.
   */
  @Get('qos')
  @ApiOperation({ summary: 'Get QoS analytics (admin only)' })
  @ApiOkResponse({ type: QosAnalyticsDto })
  async getQosAnalytics(): Promise<QosAnalyticsDto> {
    return this.adminService.getQosAnalytics();
  }

  /**
   * Get client/device insights.
   */
  @Get('clients')
  @ApiOperation({ summary: 'Get client insights (admin only)' })
  @ApiOkResponse({ type: ClientInsightsDto })
  async getClientInsights(): Promise<ClientInsightsDto> {
    return this.adminService.getClientInsights();
  }

  /**
   * Get error summary and recent failures.
   */
  @Get('errors')
  @ApiOperation({ summary: 'Get error summary (admin only)' })
  @ApiOkResponse({ type: ErrorSummaryDto })
  async getErrorSummary(): Promise<ErrorSummaryDto> {
    return this.adminService.getErrorSummary();
  }

  /**
   * Get infrastructure status (TURN server, STUN servers).
   */
  @Get('infra')
  @ApiOperation({ summary: 'Get infrastructure status (admin only)' })
  async getInfraStatus() {
    return {
      stunServers: this.iceConfig.getStunServers(),
      turnEnabled: this.iceConfig.isTurnEnabled(),
      turnServers: this.iceConfig.isTurnEnabled()
        ? this.iceConfig.getTurnServers('health-check').map((t) => ({
            urls: t.urls,
            // Don't expose credentials in the admin dashboard
            hasCredentials: !!t.username && !!t.credential,
          }))
        : [],
    };
  }
}
