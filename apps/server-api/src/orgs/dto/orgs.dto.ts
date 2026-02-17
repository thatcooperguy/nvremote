import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsEnum,
  IsOptional,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';

export class CreateOrgDto {
  @ApiProperty({ description: 'Organisation name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'URL-friendly slug (lowercase, hyphens, no spaces)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens only',
  })
  slug!: string;
}

export class InviteMemberDto {
  @ApiProperty({ description: 'Email address of the user to invite' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ enum: OrgRole, default: OrgRole.MEMBER })
  @IsOptional()
  @IsEnum(OrgRole)
  role?: OrgRole;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: OrgRole })
  @IsEnum(OrgRole)
  role!: OrgRole;
}

export class OrgResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class OrgMemberResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty({ enum: OrgRole })
  role!: OrgRole;

  @ApiProperty()
  joinedAt!: Date;

  @ApiPropertyOptional()
  user?: {
    id: string;
    email: string;
    name: string | null;
  };
}
