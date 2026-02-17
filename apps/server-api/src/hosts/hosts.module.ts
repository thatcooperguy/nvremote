import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HostsController } from './hosts.controller';
import { ConnectController } from './connect.controller';
import { HostsService } from './hosts.service';
import { PrismaService } from '../common/prisma.service';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    SessionsModule, // provides SessionsService to ConnectController
  ],
  controllers: [HostsController, ConnectController],
  providers: [HostsService, PrismaService],
  exports: [HostsService],
})
export class HostsModule {}
