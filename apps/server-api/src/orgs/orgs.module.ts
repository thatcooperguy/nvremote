import { Module } from '@nestjs/common';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [OrgsController],
  providers: [OrgsService, PrismaService],
  exports: [OrgsService],
})
export class OrgsModule {}
