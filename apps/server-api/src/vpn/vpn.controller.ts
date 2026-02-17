import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { VpnService } from './vpn.service';
import {
  RegisterPeerDto,
  PeerRegistrationResponseDto,
  VpnConfigRequestDto,
  VpnConfigResponseDto,
  VpnRelayStatusDto,
} from './dto/vpn.dto';

@ApiTags('vpn')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vpn')
export class VpnController {
  constructor(private readonly vpnService: VpnService) {}

  /**
   * Register a host agent as a WireGuard peer.
   * Called by the host agent on startup when VPN mode is available.
   */
  @Post('register-peer')
  @ApiOperation({ summary: 'Register host as WireGuard VPN peer' })
  @ApiCreatedResponse({ type: PeerRegistrationResponseDto })
  async registerPeer(
    @Req() req: Request & { user: { sub: string; hostId?: string } },
    @Body() dto: RegisterPeerDto,
  ): Promise<PeerRegistrationResponseDto> {
    // The host agent authenticates with its API token; the hostId is
    // derived from the session or passed via the body. For now, use
    // the authenticated user's ID as a proxy.
    const hostId = req.user?.hostId ?? req.user?.sub ?? 'unknown';
    return this.vpnService.registerPeer(hostId, dto);
  }

  /**
   * Get WireGuard VPN configuration for a client.
   * The client uses this to establish a tunnel to the relay server.
   */
  @Post('config')
  @ApiOperation({ summary: 'Get VPN tunnel configuration for client' })
  @ApiOkResponse({ type: VpnConfigResponseDto })
  async getConfig(
    @Req() req: Request & { user: { sub: string } },
    @Body() dto: VpnConfigRequestDto,
  ): Promise<VpnConfigResponseDto> {
    const userId = req.user?.sub;
    return this.vpnService.getClientConfig(userId, dto);
  }

  /**
   * Get VPN relay status (available to authenticated users).
   */
  @Get('status')
  @ApiOperation({ summary: 'Get VPN relay status' })
  @ApiOkResponse({ type: VpnRelayStatusDto })
  async getStatus(): Promise<VpnRelayStatusDto> {
    return this.vpnService.getRelayStatus();
  }
}
