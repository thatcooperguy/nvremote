import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../common/prisma.service';

@Controller('api/v1/waitlist')
export class WaitlistController {
  private readonly logger = new Logger(WaitlistController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Post()
  async join(@Body() body: { email?: string }): Promise<{ success: boolean }> {
    const email = body.email?.trim().toLowerCase();

    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('Invalid email address');
    }

    try {
      await this.prisma.waitlistEntry.upsert({
        where: { email },
        create: { email },
        update: {}, // Already exists — no-op
      });

      this.logger.log(`Waitlist signup: ${email}`);
    } catch (error) {
      this.logger.error(
        `Waitlist signup failed: ${(error as Error).message}`,
      );
    }

    return { success: true };
  }
}
