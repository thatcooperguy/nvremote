import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { PrismaService } from '../common/prisma.service';
import { GatewayService } from '../common/gateway.service';
import { SignalingModule } from '../signaling/signaling.module';

@Module({
  imports: [
    SignalingModule, // provides SignalingGatewayWs to SessionsService
  ],
  controllers: [SessionsController],
  providers: [SessionsService, PrismaService, GatewayService],
  exports: [SessionsService],
})
export class SessionsModule {}
