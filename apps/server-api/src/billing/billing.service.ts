import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { BillingPeriodStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../common/prisma.service';
import {
  BillingAccountDto,
  UsageSummaryDto,
  BillingHistoryDto,
} from './dto/billing.dto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;
  private readonly egressCostPerGbCents: number;
  private readonly marginPercent: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, {
        apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion,
      });
    } else {
      this.stripe = null;
      this.logger.warn('STRIPE_SECRET_KEY not set — billing features disabled');
    }
    this.egressCostPerGbCents = parseInt(
      this.configService.get<string>('GCP_EGRESS_COST_PER_GB_CENTS', '12'),
      10,
    );
    this.marginPercent = parseInt(
      this.configService.get<string>('BILLING_MARGIN_PERCENT', '30'),
      10,
    );
  }

  // -----------------------------------------------------------------------
  // Billing Account
  // -----------------------------------------------------------------------

  async ensureBillingAccount(
    orgId: string,
    billingEmail: string,
  ): Promise<BillingAccountDto> {
    const existing = await this.prisma.billingAccount.findUnique({
      where: { orgId },
    });
    if (existing) return this.toBillingAccountDto(existing);

    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    if (!this.stripe) throw new BadRequestException('Billing is not configured');

    const customer = await this.stripe.customers.create({
      email: billingEmail,
      name: org.name,
      metadata: { orgId, orgSlug: org.slug },
    });

    const account = await this.prisma.billingAccount.create({
      data: {
        orgId,
        stripeCustomerId: customer.id,
        billingEmail,
      },
    });

    this.logger.log(`Created billing account ${account.id} for org ${orgId} (Stripe: ${customer.id})`);
    return this.toBillingAccountDto(account);
  }

  async getBillingAccount(orgId: string): Promise<BillingAccountDto | null> {
    const account = await this.prisma.billingAccount.findUnique({
      where: { orgId },
    });
    return account ? this.toBillingAccountDto(account) : null;
  }

  // -----------------------------------------------------------------------
  // Usage Recording
  // -----------------------------------------------------------------------

  async recordUsage(
    sessionId: string,
    orgId: string,
    bytesTransferred: bigint,
    connectionType: string,
  ): Promise<void> {
    // P2P traffic is free — no GCP cost
    if (connectionType === 'p2p') return;

    const account = await this.prisma.billingAccount.findUnique({
      where: { orgId },
    });
    if (!account) return; // No billing account = free (alpha/beta)

    const period = await this.getOrCreateOpenPeriod(account.id);

    await this.prisma.usageRecord.create({
      data: {
        billingPeriodId: period.id,
        sessionId,
        bytesTransferred,
        connectionType,
      },
    });

    // Accumulate on the period
    const updateField = connectionType === 'vpn' ? 'totalBytesVpn' : 'totalBytesRelay';
    await this.prisma.billingPeriod.update({
      where: { id: period.id },
      data: {
        [updateField]: { increment: bytesTransferred },
      },
    });
  }

  // -----------------------------------------------------------------------
  // Current Usage
  // -----------------------------------------------------------------------

  async getCurrentUsage(orgId: string): Promise<UsageSummaryDto | null> {
    const account = await this.prisma.billingAccount.findUnique({
      where: { orgId },
    });
    if (!account) return null;

    const period = await this.prisma.billingPeriod.findFirst({
      where: { billingAccountId: account.id, status: BillingPeriodStatus.OPEN },
      orderBy: { startDate: 'desc' },
    });
    if (!period) return null;

    // Get P2P bytes (summed from usage records with type=p2p — not stored on period)
    const p2pAgg = await this.prisma.usageRecord.aggregate({
      where: { billingPeriodId: period.id, connectionType: 'p2p' },
      _sum: { bytesTransferred: true },
    });

    const totalBillableBytes = period.totalBytesRelay + period.totalBytesVpn;
    const costRaw = this.calculateCostCents(totalBillableBytes);
    const costCharged = this.applyMargin(costRaw);

    return {
      periodId: period.id,
      startDate: period.startDate,
      endDate: period.endDate,
      totalBytesRelay: period.totalBytesRelay.toString(),
      totalBytesVpn: period.totalBytesVpn.toString(),
      totalBytesP2p: (p2pAgg._sum.bytesTransferred ?? BigInt(0)).toString(),
      costCentsRaw: costRaw,
      costCentsCharged: costCharged,
      status: period.status,
      stripeInvoiceId: period.stripeInvoiceId,
    };
  }

  // -----------------------------------------------------------------------
  // Billing History
  // -----------------------------------------------------------------------

  async getBillingHistory(orgId: string): Promise<BillingHistoryDto> {
    const account = await this.prisma.billingAccount.findUnique({
      where: { orgId },
    });
    if (!account) return { periods: [], totalChargedCents: 0 };

    const periods = await this.prisma.billingPeriod.findMany({
      where: { billingAccountId: account.id },
      orderBy: { startDate: 'desc' },
    });

    const summaries: UsageSummaryDto[] = periods.map((p) => ({
      periodId: p.id,
      startDate: p.startDate,
      endDate: p.endDate,
      totalBytesRelay: p.totalBytesRelay.toString(),
      totalBytesVpn: p.totalBytesVpn.toString(),
      totalBytesP2p: '0', // Historical P2P not tracked on period
      costCentsRaw: p.costCentsRaw,
      costCentsCharged: p.costCentsCharged,
      status: p.status,
      stripeInvoiceId: p.stripeInvoiceId,
    }));

    const totalChargedCents = periods.reduce((sum, p) => sum + p.costCentsCharged, 0);

    return { periods: summaries, totalChargedCents };
  }

  // -----------------------------------------------------------------------
  // Stripe Customer Portal
  // -----------------------------------------------------------------------

  async createPortalSession(orgId: string, returnUrl: string): Promise<string> {
    if (!this.stripe) throw new BadRequestException('Billing is not configured');

    const account = await this.prisma.billingAccount.findUnique({
      where: { orgId },
    });
    if (!account) throw new NotFoundException('No billing account for this organization');

    const session = await this.stripe.billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: returnUrl,
    });

    return session.url;
  }

  // -----------------------------------------------------------------------
  // Stripe Webhooks
  // -----------------------------------------------------------------------

  async handleInvoicePaid(invoiceId: string): Promise<void> {
    await this.prisma.billingPeriod.updateMany({
      where: { stripeInvoiceId: invoiceId },
      data: { status: BillingPeriodStatus.PAID },
    });
    this.logger.log(`Invoice ${invoiceId} marked as paid`);
  }

  async handleInvoiceFailed(invoiceId: string): Promise<void> {
    await this.prisma.billingPeriod.updateMany({
      where: { stripeInvoiceId: invoiceId },
      data: { status: BillingPeriodStatus.FAILED },
    });
    this.logger.warn(`Invoice ${invoiceId} payment failed`);
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    if (!this.stripe) throw new BadRequestException('Billing is not configured');
    const secret = this.configService.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  // -----------------------------------------------------------------------
  // Monthly Cron — Close periods and create invoices
  // -----------------------------------------------------------------------

  @Cron('0 0 1 * *') // First of every month at midnight UTC
  async closeMonthlyPeriods(): Promise<void> {
    this.logger.log('Running monthly billing period closure...');

    const openPeriods = await this.prisma.billingPeriod.findMany({
      where: {
        status: BillingPeriodStatus.OPEN,
        endDate: { lte: new Date() },
      },
      include: { billingAccount: true },
    });

    for (const period of openPeriods) {
      try {
        await this.closePeriod(period.id);
      } catch (err) {
        this.logger.error(
          `Failed to close period ${period.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    this.logger.log(`Closed ${openPeriods.length} billing periods`);
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private async getOrCreateOpenPeriod(billingAccountId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    let period = await this.prisma.billingPeriod.findFirst({
      where: {
        billingAccountId,
        status: BillingPeriodStatus.OPEN,
        startDate: { gte: startOfMonth },
      },
    });

    if (!period) {
      period = await this.prisma.billingPeriod.create({
        data: {
          billingAccountId,
          startDate: startOfMonth,
          endDate: endOfMonth,
        },
      });
      this.logger.log(`Created new billing period ${period.id} for account ${billingAccountId}`);
    }

    return period;
  }

  private async closePeriod(periodId: string): Promise<void> {
    const period = await this.prisma.billingPeriod.findUnique({
      where: { id: periodId },
      include: { billingAccount: true },
    });

    if (!period || period.status !== BillingPeriodStatus.OPEN) return;

    const totalBillableBytes = period.totalBytesRelay + period.totalBytesVpn;
    const costRaw = this.calculateCostCents(totalBillableBytes);
    const costCharged = this.applyMargin(costRaw);

    if (costCharged === 0) {
      // No billable usage — mark as paid (nothing to invoice)
      await this.prisma.billingPeriod.update({
        where: { id: periodId },
        data: { costCentsRaw: 0, costCentsCharged: 0, status: BillingPeriodStatus.PAID },
      });
      return;
    }

    if (!this.stripe) {
      this.logger.warn(`Stripe not configured — skipping invoice for period ${periodId}`);
      return;
    }

    // Create Stripe invoice
    const invoice = await this.stripe.invoices.create({
      customer: period.billingAccount.stripeCustomerId,
      auto_advance: true, // Auto-finalize and attempt payment
      collection_method: 'charge_automatically',
      metadata: { periodId, orgId: period.billingAccount.orgId },
    });

    const totalGb = Number(totalBillableBytes) / (1024 * 1024 * 1024);
    await this.stripe.invoiceItems.create({
      customer: period.billingAccount.stripeCustomerId,
      invoice: invoice.id,
      amount: costCharged,
      currency: period.billingAccount.currency,
      description: `NVRemote bandwidth: ${totalGb.toFixed(2)} GB (relay + VPN)`,
    });

    await this.prisma.billingPeriod.update({
      where: { id: periodId },
      data: {
        costCentsRaw: costRaw,
        costCentsCharged: costCharged,
        stripeInvoiceId: invoice.id,
        status: BillingPeriodStatus.INVOICED,
      },
    });

    this.logger.log(
      `Closed period ${periodId}: ${totalGb.toFixed(2)} GB, $${(costCharged / 100).toFixed(2)} charged`,
    );
  }

  private calculateCostCents(bytes: bigint): number {
    const gb = Number(bytes) / (1024 * 1024 * 1024);
    return Math.round(gb * this.egressCostPerGbCents);
  }

  private applyMargin(costCents: number): number {
    return Math.round(costCents * (1 + this.marginPercent / 100));
  }

  private toBillingAccountDto(account: {
    id: string;
    orgId: string;
    stripeCustomerId: string;
    billingEmail: string;
    currency: string;
    createdAt: Date;
  }): BillingAccountDto {
    return {
      id: account.id,
      orgId: account.orgId,
      stripeCustomerId: account.stripeCustomerId,
      billingEmail: account.billingEmail,
      currency: account.currency,
      createdAt: account.createdAt,
    };
  }
}
