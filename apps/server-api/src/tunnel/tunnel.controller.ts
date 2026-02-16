import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { TunnelService } from './tunnel.service';
import {
  CreateTunnelDto,
  TunnelResponseDto,
  TunnelStatusDto,
  TunnelAuditEntryDto,
} from './dto/tunnel.dto';

@ApiTags('tunnel')
@ApiBearerAuth()
@Controller('tunnel')
export class TunnelController {
  constructor(private readonly tunnelService: TunnelService) {}

  /**
   * Create a per-session zero-trust tunnel.
   * The tunnel provides authenticated, session-scoped connectivity.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a zero-trust tunnel for a session' })
  @ApiCreatedResponse({ type: TunnelResponseDto })
  async createTunnel(
    @Req() req: any,
    @Body() dto: CreateTunnelDto,
  ): Promise<TunnelResponseDto> {
    return this.tunnelService.createTunnel(req.user.sub, dto);
  }

  /**
   * Destroy (revoke) an active tunnel.
   */
  @Delete(':tunnelId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Destroy a zero-trust tunnel' })
  async destroyTunnel(
    @Req() req: any,
    @Param('tunnelId') tunnelId: string,
  ): Promise<{ success: boolean }> {
    return this.tunnelService.destroyTunnel(req.user.sub, tunnelId);
  }

  /**
   * Validate a tunnel token (called by the tunnel proxy).
   * This endpoint is public (no auth guard) since the proxy calls it
   * with the tunnel token in the request body.
   */
  @Post('validate')
  @ApiOperation({ summary: 'Validate a tunnel token (for proxy use)' })
  async validateToken(
    @Body() body: { token: string },
  ) {
    return this.tunnelService.validateTunnelToken(body.token);
  }

  /**
   * Get tunnel status.
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get zero-trust tunnel status' })
  @ApiOkResponse({ type: TunnelStatusDto })
  async getStatus(): Promise<TunnelStatusDto> {
    return this.tunnelService.getStatus();
  }

  /**
   * Get tunnel audit log (admin only).
   */
  @Get('audit')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Get tunnel audit log (admin only)' })
  @ApiOkResponse({ type: [TunnelAuditEntryDto] })
  async getAuditLog(
    @Query('limit') limit?: number,
  ): Promise<TunnelAuditEntryDto[]> {
    return this.tunnelService.getAuditLog(limit ?? 50);
  }
}
