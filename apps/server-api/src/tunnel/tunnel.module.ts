import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { TunnelController } from './tunnel.controller';
import { TunnelService } from './tunnel.service';

@Module({
  controllers: [TunnelController],
  providers: [TunnelService, PrismaService],
  exports: [TunnelService],
})
export class TunnelModule {}
