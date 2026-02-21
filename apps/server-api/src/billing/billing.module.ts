import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, PrismaService],
  exports: [BillingService],
})
export class BillingModule {}
