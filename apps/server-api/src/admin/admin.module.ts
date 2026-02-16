import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from '../common/prisma.service';
import { IceConfigService } from '../common/gateway.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService, PrismaService, IceConfigService],
})
export class AdminModule {}
