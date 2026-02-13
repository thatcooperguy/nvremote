import { Module } from '@nestjs/common';
import { SignalingGatewayWs } from './signaling.gateway';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [SignalingGatewayWs, PrismaService],
  exports: [SignalingGatewayWs],
})
export class SignalingModule {}
