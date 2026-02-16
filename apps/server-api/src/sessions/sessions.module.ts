import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { WebRtcRelayService } from './webrtc-relay.service';
import { PrismaService } from '../common/prisma.service';
import { IceConfigService } from '../common/gateway.service';
import { SignalingModule } from '../signaling/signaling.module';

@Module({
  imports: [
    SignalingModule, // provides SignalingGatewayWs to SessionsService & WebRtcRelayService
  ],
  controllers: [SessionsController],
  providers: [SessionsService, WebRtcRelayService, PrismaService, IceConfigService],
  exports: [SessionsService, WebRtcRelayService],
})
export class SessionsModule {}
