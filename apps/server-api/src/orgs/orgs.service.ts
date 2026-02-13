import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import {
  CreateOrgDto,
  InviteMemberDto,
  UpdateMemberRoleDto,
  OrgResponseDto,
  OrgMemberResponseDto,
} from './dto/orgs.dto';

@Injectable()
export class OrgsService {
  private readonly logger = new Logger(OrgsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new organisation and make the requesting user its ADMIN.
   */
  async create(userId: string, dto: CreateOrgDto): Promise<OrgResponseDto> {
    const existing = await this.prisma.org.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException(`Organisation slug "${dto.slug}" is already taken`);
    }

    const org = await this.prisma.org.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        members: {
          create: {
            userId,
            role: OrgRole.ADMIN,
          },
        },
      },
    });

    this.logger.log(`User ${userId} created org ${org.id} (${org.slug})`);

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt,
    };
  }

  /**
   * List all organisations the user belongs to.
   */
  async listForUser(userId: string): Promise<OrgResponseDto[]> {
    const memberships = await this.prisma.orgMember.findMany({
      where: { userId },
      include: { org: true },
    });

    return memberships.map((m) => ({
      id: m.org.id,
      name: m.org.name,
      slug: m.org.slug,
      createdAt: m.org.createdAt,
    }));
  }

  /**
   * Get a single organisation by ID. Verifies the user is a member.
   */
  async getById(orgId: string, userId: string): Promise<OrgResponseDto> {
    const membership = await this.prisma.orgMember.findUnique({
      where: { userId_orgId: { userId, orgId } },
      include: { org: true },
    });

    if (!membership) {
      throw new NotFoundException('Organisation not found or access denied');
    }

    return {
      id: membership.org.id,
      name: membership.org.name,
      slug: membership.org.slug,
      createdAt: membership.org.createdAt,
    };
  }

  /**
   * Invite a user to an organisation by email. The inviting user must be an ADMIN.
   */
  async inviteMember(
    orgId: string,
    inviterId: string,
    dto: InviteMemberDto,
  ): Promise<OrgMemberResponseDto> {
    // Verify inviter is ADMIN
    await this.requireAdmin(orgId, inviterId);

    // Look up the user being invited
    const invitee = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!invitee) {
      throw new NotFoundException(
        `No user found with email "${dto.email}". They must sign up first.`,
      );
    }

    // Check if already a member
    const existingMembership = await this.prisma.orgMember.findUnique({
      where: { userId_orgId: { userId: invitee.id, orgId } },
    });

    if (existingMembership) {
      throw new ConflictException('User is already a member of this organisation');
    }

    const member = await this.prisma.orgMember.create({
      data: {
        userId: invitee.id,
        orgId,
        role: dto.role ?? OrgRole.MEMBER,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    this.logger.log(
      `User ${inviterId} invited ${invitee.id} to org ${orgId} as ${member.role}`,
    );

    return {
      id: member.id,
      userId: member.userId,
      orgId: member.orgId,
      role: member.role,
      joinedAt: member.joinedAt,
      user: member.user,
    };
  }

  /**
   * Remove a member from an organisation.
   */
  async removeMember(
    orgId: string,
    requesterId: string,
    targetUserId: string,
  ): Promise<void> {
    // Allow self-removal or require ADMIN
    if (requesterId !== targetUserId) {
      await this.requireAdmin(orgId, requesterId);
    }

    const membership = await this.prisma.orgMember.findUnique({
      where: { userId_orgId: { userId: targetUserId, orgId } },
    });

    if (!membership) {
      throw new NotFoundException('Member not found in this organisation');
    }

    // Prevent removing the last ADMIN
    if (membership.role === OrgRole.ADMIN) {
      const adminCount = await this.prisma.orgMember.count({
        where: { orgId, role: OrgRole.ADMIN },
      });

      if (adminCount <= 1) {
        throw new ForbiddenException(
          'Cannot remove the last admin from an organisation',
        );
      }
    }

    await this.prisma.orgMember.delete({
      where: { id: membership.id },
    });

    this.logger.log(
      `User ${requesterId} removed ${targetUserId} from org ${orgId}`,
    );
  }

  /**
   * Update a member's role within an organisation.
   */
  async updateMemberRole(
    orgId: string,
    requesterId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<OrgMemberResponseDto> {
    await this.requireAdmin(orgId, requesterId);

    const membership = await this.prisma.orgMember.findUnique({
      where: { userId_orgId: { userId: targetUserId, orgId } },
    });

    if (!membership) {
      throw new NotFoundException('Member not found in this organisation');
    }

    // Prevent demoting the last ADMIN
    if (
      membership.role === OrgRole.ADMIN &&
      dto.role !== OrgRole.ADMIN
    ) {
      const adminCount = await this.prisma.orgMember.count({
        where: { orgId, role: OrgRole.ADMIN },
      });

      if (adminCount <= 1) {
        throw new ForbiddenException(
          'Cannot demote the last admin of an organisation',
        );
      }
    }

    const updated = await this.prisma.orgMember.update({
      where: { id: membership.id },
      data: { role: dto.role },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      orgId: updated.orgId,
      role: updated.role,
      joinedAt: updated.joinedAt,
      user: updated.user,
    };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private async requireAdmin(orgId: string, userId: string): Promise<void> {
    const membership = await this.prisma.orgMember.findUnique({
      where: { userId_orgId: { userId, orgId } },
    });

    if (!membership || membership.role !== OrgRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
  }
}
