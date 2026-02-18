import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Custom Google OAuth guard that passes the `state` query parameter through
 * the OAuth flow. This allows the callback to identify the client type
 * (e.g., `state=desktop` for Electron clients) and redirect appropriately.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const state = request.query?.state;
    return state ? { state } : {};
  }
}
