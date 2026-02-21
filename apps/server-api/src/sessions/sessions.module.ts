import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { WebRtcRelayService } from './webrtc-relay.service';
import { PrismaService } from '../common/prisma.service';
import { IceConfigService } from '../common/gateway.service';
import { SignalingModule } from '../signaling/signaling.module';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    SignalingModule, // provides SignalingGatewayWs to SessionsService & WebRtcRelayService
    AuditModule,     // provides AuditService for session event logging
    BillingModule,   // provides BillingService for usage-based billing
  ],
  controllers: [SessionsController],
  providers: [SessionsService, WebRtcRelayService, PrismaService, IceConfigService],
  exports: [SessionsService, WebRtcRelayService],
})
export class SessionsModule {}
