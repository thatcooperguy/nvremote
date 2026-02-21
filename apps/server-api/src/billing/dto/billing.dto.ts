import { IsEmail, IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBillingAccountDto {
  @ApiProperty({ description: 'Org ID to create billing account for' })
  @IsString()
  @IsNotEmpty()
  orgId!: string;

  @ApiProperty({ description: 'Email for invoices' })
  @IsEmail()
  billingEmail!: string;
}

export class BillingAccountDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  stripeCustomerId!: string;

  @ApiProperty()
  billingEmail!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class UsageSummaryDto {
  @ApiProperty({ description: 'Billing period ID' })
  periodId!: string;

  @ApiProperty({ description: 'Period start date' })
  startDate!: Date;

  @ApiProperty({ description: 'Period end date' })
  endDate!: Date;

  @ApiProperty({ description: 'Total relay bandwidth in bytes' })
  totalBytesRelay!: string; // BigInt serialized as string

  @ApiProperty({ description: 'Total VPN bandwidth in bytes' })
  totalBytesVpn!: string;

  @ApiProperty({ description: 'Total P2P bandwidth (free, not billed)' })
  totalBytesP2p!: string;

  @ApiProperty({ description: 'Raw GCP cost in cents' })
  costCentsRaw!: number;

  @ApiProperty({ description: 'Customer charge in cents (cost + 30% margin)' })
  costCentsCharged!: number;

  @ApiProperty({ description: 'Period status' })
  status!: string;

  @ApiPropertyOptional({ description: 'Stripe Invoice ID' })
  stripeInvoiceId?: string | null;
}

export class BillingHistoryDto {
  @ApiProperty({ type: [UsageSummaryDto] })
  periods!: UsageSummaryDto[];

  @ApiProperty({ description: 'Total charged across all periods in cents' })
  totalChargedCents!: number;
}

export class PortalSessionDto {
  @ApiProperty({ description: 'Stripe Customer Portal URL' })
  url!: string;
}
