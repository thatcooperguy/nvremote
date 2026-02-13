import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { OrgsService } from './orgs.service';
import {
  CreateOrgDto,
  InviteMemberDto,
  UpdateMemberRoleDto,
  OrgResponseDto,
  OrgMemberResponseDto,
} from './dto/orgs.dto';

@ApiTags('orgs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orgs')
export class OrgsController {
  constructor(private readonly orgsService: OrgsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new organisation' })
  @ApiCreatedResponse({ type: OrgResponseDto })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOrgDto,
  ): Promise<OrgResponseDto> {
    return this.orgsService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: "List current user's organisations" })
  @ApiOkResponse({ type: [OrgResponseDto] })
  async list(@CurrentUser() user: JwtPayload): Promise<OrgResponseDto[]> {
    return this.orgsService.listForUser(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organisation by ID' })
  @ApiOkResponse({ type: OrgResponseDto })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrgResponseDto> {
    return this.orgsService.getById(id, user.sub);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Invite a user to the organisation' })
  @ApiCreatedResponse({ type: OrgMemberResponseDto })
  async inviteMember(
    @Param('id', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: InviteMemberDto,
  ): Promise<OrgMemberResponseDto> {
    return this.orgsService.inviteMember(orgId, user.sub, dto);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove a member from the organisation' })
  async removeMember(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.orgsService.removeMember(orgId, user.sub, targetUserId);
  }

  @Patch(':id/members/:userId/role')
  @ApiOperation({ summary: "Update a member's role" })
  @ApiOkResponse({ type: OrgMemberResponseDto })
  async updateMemberRole(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<OrgMemberResponseDto> {
    return this.orgsService.updateMemberRole(
      orgId,
      user.sub,
      targetUserId,
      dto,
    );
  }
}
