import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { BillingService } from './billing.service';

@ApiTags('billing')
@Controller('billing')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(private readonly billingService: BillingService) {}

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.warn('Stripe webhook received without raw body');
      return { received: false };
    }

    let event;
    try {
      event = this.billingService.constructWebhookEvent(rawBody, signature);
    } catch (err) {
      this.logger.warn(
        `Stripe webhook signature verification failed: ${err instanceof Error ? err.message : err}`,
      );
      return { received: false };
    }

    switch (event.type) {
      case 'invoice.paid': {
        const invoice = event.data.object;
        await this.billingService.handleInvoicePaid(invoice.id);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await this.billingService.handleInvoiceFailed(invoice.id);
        break;
      }
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }

    return { received: true };
  }
}
