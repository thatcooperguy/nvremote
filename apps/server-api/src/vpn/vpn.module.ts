import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { VpnController } from './vpn.controller';
import { VpnService } from './vpn.service';

@Module({
  controllers: [VpnController],
  providers: [VpnService, PrismaService],
  exports: [VpnService],
})
export class VpnModule {}
