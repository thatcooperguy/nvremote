import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  RefreshTokenDto,
  TokenResponseDto,
  UserProfileDto,
  AuthCallbackResultDto,
  GoogleProfile,
} from './dto/auth.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly frontendUrl: string;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    // Determine the frontend URL for OAuth redirects.
    // CORS_ORIGIN contains comma-separated allowed origins; use the first one.
    const corsOrigin = this.configService.get<string>('CORS_ORIGIN', 'https://nvremote.com');
    this.frontendUrl = corsOrigin.split(',')[0].trim();
  }

  /**
   * Initiate Google OAuth2 login flow.
   */
  @Get('google')
  @Public()
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  googleAuth(): void {
    // Passport redirects to Google
  }

  /**
   * Google OAuth2 callback.
   * On success, redirects to the frontend with tokens as a URL fragment.
   * The fragment (#) is never sent to the server, keeping tokens client-side only.
   * Falls back to JSON response for non-browser clients (e.g., Electron, mobile).
   */
  @Get('google/callback')
  @Public()
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiOkResponse({ type: AuthCallbackResultDto })
  async googleCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthCallbackResultDto | void> {
    const profile = req.user as GoogleProfile;
    const result = await this.authService.validateGoogleUser(profile);

    // If the request has an Accept header preferring JSON (API/mobile clients),
    // return the tokens directly. Otherwise redirect to the website.
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('application/json')) {
      return result;
    }

    // Encode tokens in the URL fragment for the frontend callback page.
    // Using fragments (#) instead of query params ensures tokens are never
    // sent to the server in subsequent requests or logged in server access logs.
    const tokenPayload = Buffer.from(JSON.stringify(result)).toString('base64url');
    const redirectUrl = `${this.frontendUrl}/auth/callback#data=${tokenPayload}`;
    res.redirect(302, redirectUrl);
  }

  /**
   * Exchange a refresh token for a new access + refresh token pair.
   */
  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiOkResponse({ type: TokenResponseDto })
  async refresh(
    @Body() dto: RefreshTokenDto,
  ): Promise<TokenResponseDto> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  /**
   * Invalidate the refresh token (logout).
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout (invalidate refresh token)' })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  /**
   * Get the currently authenticated user's profile.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({ type: UserProfileDto })
  async me(@CurrentUser() user: JwtPayload): Promise<UserProfileDto> {
    return this.authService.getProfile(user.sub);
  }
}
