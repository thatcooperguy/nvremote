import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
} from '@nestjs/swagger';
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

/**
 * Platform administration endpoints.
 *
 * SECURITY: ALL endpoints here are protected by:
 *   1. Global JwtAuthGuard (APP_GUARD) — requires valid JWT
 *   2. AdminGuard — requires isSuperAdmin=true (platform owner only)
 *
 * These endpoints expose platform-wide data across ALL organisations.
 * Regular users (including org admins) CANNOT access these endpoints.
 * Only the platform owner (you) can see all sessions, hosts, QoS data,
 * errors, and infrastructure status.
 *
 * End users will NEVER see GCP costs, infrastructure details, or
 * other customers' data through these endpoints.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly iceConfig: IceConfigService,
  ) {}

  /**
   * Get platform-wide statistics for the admin dashboard.
   * Only visible to super-admins (platform owner).
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get platform statistics (super-admin only)' })
  @ApiOkResponse({ type: PlatformStatsDto })
  async getStats(): Promise<PlatformStatsDto> {
    return this.adminService.getPlatformStats();
  }

  /**
   * List all sessions across the platform with filtering and pagination.
   * Only visible to super-admins (platform owner).
   */
  @Get('sessions')
  @ApiOperation({ summary: 'List all sessions (super-admin only)' })
  @ApiOkResponse({ type: AdminSessionListDto })
  async getSessions(
    @Query() query: AdminSessionQueryDto,
  ): Promise<AdminSessionListDto> {
    return this.adminService.getAdminSessions(query);
  }

  /**
   * List all registered hosts across the platform.
   * Only visible to super-admins (platform owner).
   */
  @Get('hosts')
  @ApiOperation({ summary: 'List all hosts (super-admin only)' })
  @ApiOkResponse({ type: [AdminHostDto] })
  async getHosts(
    @Query() query: AdminHostQueryDto,
  ): Promise<AdminHostDto[]> {
    return this.adminService.getAdminHosts(query);
  }

  /**
   * Get QoS analytics across sessions.
   * Only visible to super-admins (platform owner).
   */
  @Get('qos')
  @ApiOperation({ summary: 'Get QoS analytics (super-admin only)' })
  @ApiOkResponse({ type: QosAnalyticsDto })
  async getQosAnalytics(): Promise<QosAnalyticsDto> {
    return this.adminService.getQosAnalytics();
  }

  /**
   * Get client/device insights.
   * Only visible to super-admins (platform owner).
   */
  @Get('clients')
  @ApiOperation({ summary: 'Get client insights (super-admin only)' })
  @ApiOkResponse({ type: ClientInsightsDto })
  async getClientInsights(): Promise<ClientInsightsDto> {
    return this.adminService.getClientInsights();
  }

  /**
   * Get error summary and recent failures.
   * Only visible to super-admins (platform owner).
   */
  @Get('errors')
  @ApiOperation({ summary: 'Get error summary (super-admin only)' })
  @ApiOkResponse({ type: ErrorSummaryDto })
  async getErrorSummary(): Promise<ErrorSummaryDto> {
    return this.adminService.getErrorSummary();
  }

  /**
   * Get infrastructure status (TURN server, STUN servers).
   * Only visible to super-admins (platform owner).
   * This exposes internal infrastructure details that end users must never see.
   */
  @Get('infra')
  @ApiOperation({ summary: 'Get infrastructure status (super-admin only)' })
  async getInfraStatus() {
    return {
      stunServers: this.iceConfig.getStunServers(),
      turnEnabled: this.iceConfig.isTurnEnabled(),
      turnServers: this.iceConfig.isTurnEnabled()
        ? this.iceConfig.getTurnServers('health-check').map((t) => ({
            urls: t.urls,
            hasCredentials: !!t.username && !!t.credential,
          }))
        : [],
    };
  }
}
