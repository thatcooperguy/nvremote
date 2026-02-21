import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthGuard } from '../common/guards/google-auth.guard';
import { MicrosoftAuthGuard } from '../common/guards/microsoft-auth.guard';
import { AppleAuthGuard } from '../common/guards/apple-auth.guard';
import { DiscordAuthGuard } from '../common/guards/discord-auth.guard';
import { Throttle } from '@nestjs/throttler';
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
  OAuthProfile,
  UpdatePreferencesDto,
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
   * Rate limited to 20 requests per minute to prevent OAuth abuse.
   */
  @Get('google')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  googleAuth(): void {
    // Passport redirects to Google — GoogleAuthGuard passes ?state= through
  }

  /**
   * Google OAuth2 callback.
   * On success, redirects to the frontend with tokens as a URL fragment.
   * The fragment (#) is never sent to the server, keeping tokens client-side only.
   * Falls back to JSON response for non-browser clients (e.g., Electron, mobile).
   *
   * Desktop clients pass `state=desktop` through the OAuth flow, which triggers
   * a redirect to the `nvremote://` custom protocol instead of the website.
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

    // Desktop clients pass state=desktop through the OAuth flow to indicate
    // that the callback should redirect to the nvremote:// custom protocol
    // instead of the web frontend.
    const state = (req.query.state as string) || '';
    if (state === 'desktop') {
      const params = new URLSearchParams({
        token: result.accessToken,
        refresh: result.refreshToken,
      });
      const redirectUrl = `nvremote://auth?${params.toString()}`;
      res.redirect(302, redirectUrl);
      return;
    }

    // Encode tokens in the URL fragment for the frontend callback page.
    // Using fragments (#) instead of query params ensures tokens are never
    // sent to the server in subsequent requests or logged in server access logs.
    const tokenPayload = Buffer.from(JSON.stringify(result)).toString('base64url');
    const redirectUrl = `${this.frontendUrl}/auth/callback#data=${tokenPayload}`;
    res.redirect(302, redirectUrl);
  }

  // ── Microsoft OAuth ──────────────────────────────────────────────────

  @Get('microsoft')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @UseGuards(MicrosoftAuthGuard)
  @ApiOperation({ summary: 'Initiate Microsoft OAuth login' })
  microsoftAuth(): void {
    // Passport redirects to Microsoft
  }

  @Get('microsoft/callback')
  @Public()
  @UseGuards(AuthGuard('microsoft'))
  @ApiOperation({ summary: 'Microsoft OAuth callback' })
  async microsoftCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthCallbackResultDto | void> {
    const profile = req.user as OAuthProfile;
    const result = await this.authService.validateOAuthUser(profile);
    return this.handleOAuthCallback(req, res, result);
  }

  // ── Apple Sign-In ─────────────────────────────────────────────────

  @Get('apple')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @UseGuards(AppleAuthGuard)
  @ApiOperation({ summary: 'Initiate Apple Sign-In' })
  appleAuth(): void {
    // Passport redirects to Apple
  }

  @Post('apple/callback')
  @Public()
  @UseGuards(AuthGuard('apple'))
  @ApiOperation({ summary: 'Apple Sign-In callback (POST)' })
  async appleCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthCallbackResultDto | void> {
    const profile = req.user as OAuthProfile;
    const result = await this.authService.validateOAuthUser(profile);
    // Apple sends state in the POST body, not query params
    const state = (req.body?.state as string) || (req.query.state as string) || '';
    return this.handleOAuthCallbackWithState(req, res, result, state);
  }

  // ── Discord OAuth ─────────────────────────────────────────────────

  @Get('discord')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @UseGuards(DiscordAuthGuard)
  @ApiOperation({ summary: 'Initiate Discord OAuth login' })
  discordAuth(): void {
    // Passport redirects to Discord
  }

  @Get('discord/callback')
  @Public()
  @UseGuards(AuthGuard('discord'))
  @ApiOperation({ summary: 'Discord OAuth callback' })
  async discordCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthCallbackResultDto | void> {
    const profile = req.user as OAuthProfile;
    const result = await this.authService.validateOAuthUser(profile);
    return this.handleOAuthCallback(req, res, result);
  }

  // ── Shared OAuth redirect logic ───────────────────────────────────

  private handleOAuthCallback(
    req: Request,
    res: Response,
    result: AuthCallbackResultDto,
  ): AuthCallbackResultDto | void {
    const state = (req.query.state as string) || '';
    return this.handleOAuthCallbackWithState(req, res, result, state);
  }

  private handleOAuthCallbackWithState(
    req: Request,
    res: Response,
    result: AuthCallbackResultDto,
    state: string,
  ): AuthCallbackResultDto | void {
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('application/json')) {
      return result;
    }

    if (state === 'desktop') {
      const params = new URLSearchParams({
        token: result.accessToken,
        refresh: result.refreshToken,
      });
      res.redirect(302, `nvremote://auth?${params.toString()}`);
      return;
    }

    const tokenPayload = Buffer.from(JSON.stringify(result)).toString('base64url');
    res.redirect(302, `${this.frontendUrl}/auth/callback#data=${tokenPayload}`);
  }

  /**
   * Exchange a refresh token for a new access + refresh token pair.
   * Strictly rate limited: 10 requests per minute to prevent brute force.
   */
  @Post('refresh')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
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

  /**
   * Update the current user's profile (display name and/or streaming preferences).
   */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile and preferences' })
  @ApiOkResponse({ type: UserProfileDto })
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<UserProfileDto> {
    return this.authService.updateProfile(user.sub, dto);
  }
}
