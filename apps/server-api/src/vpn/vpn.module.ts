import { Module } from '@nestjs/common';
import { VpnController } from './vpn.controller';
import { VpnService } from './vpn.service';

@Module({
  controllers: [VpnController],
  providers: [VpnService],
  exports: [VpnService],
})
export class VpnModule {}
