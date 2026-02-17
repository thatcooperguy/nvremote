import { Module } from '@nestjs/common';
import { WaitlistController } from './waitlist.controller';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [WaitlistController],
  providers: [PrismaService],
})
export class WaitlistModule {}
