import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { BillingService } from './billing.service';
import {
  CreateBillingAccountDto,
  BillingAccountDto,
  UsageSummaryDto,
  BillingHistoryDto,
  PortalSessionDto,
} from './dto/billing.dto';

@ApiTags('billing')
@Controller('billing')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('account')
  @ApiOperation({ summary: 'Get billing account for an org' })
  async getAccount(
    @Query('orgId') orgId: string,
  ): Promise<BillingAccountDto | null> {
    return this.billingService.getBillingAccount(orgId);
  }

  @Post('account')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Create billing account (org admin only)' })
  async createAccount(
    @Body() dto: CreateBillingAccountDto,
  ): Promise<BillingAccountDto> {
    return this.billingService.ensureBillingAccount(dto.orgId, dto.billingEmail);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get current billing period usage' })
  async getCurrentUsage(
    @Query('orgId') orgId: string,
  ): Promise<UsageSummaryDto | null> {
    return this.billingService.getCurrentUsage(orgId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get billing history' })
  async getHistory(
    @Query('orgId') orgId: string,
  ): Promise<BillingHistoryDto> {
    return this.billingService.getBillingHistory(orgId);
  }

  @Post('portal')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Create Stripe Customer Portal session' })
  async createPortalSession(
    @Query('orgId') orgId: string,
    @Body('returnUrl') returnUrl: string,
  ): Promise<PortalSessionDto> {
    const url = await this.billingService.createPortalSession(
      orgId,
      returnUrl || 'https://nvremote.com/dashboard/billing',
    );
    return { url };
  }
}
