import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { PrismaService } from '../common/prisma.service';
import { IceConfigService } from '../common/gateway.service';
import { SignalingModule } from '../signaling/signaling.module';

@Module({
  imports: [
    SignalingModule, // provides SignalingGatewayWs to SessionsService
  ],
  controllers: [SessionsController],
  providers: [SessionsService, PrismaService, IceConfigService],
  exports: [SessionsService],
})
export class SessionsModule {}
