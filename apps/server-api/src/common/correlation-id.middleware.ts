import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Middleware that assigns a unique correlation ID to every HTTP request.
 *
 * If the client sends an `X-Request-Id` header, that value is reused so
 * requests can be traced end-to-end across services. Otherwise a new
 * UUIDv4 is generated.
 *
 * The correlation ID is:
 *   1. Attached to `req.id` for use in downstream handlers/services.
 *   2. Set on the response `X-Request-Id` header (already exposed in CORS).
 *   3. Logged with method, path, status code, and response time.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers['x-request-id'] as string) || randomUUID();

    // Attach to request for downstream use
    (req as any).id = requestId;

    // Set on response header
    res.setHeader('X-Request-Id', requestId);

    const startTime = Date.now();

    // Log on response finish
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { method, originalUrl } = req;
      const { statusCode } = res;

      // Skip health/metrics noise in logs
      if (originalUrl.includes('/health') || originalUrl.includes('/metrics')) {
        return;
      }

      const logLine = `${method} ${originalUrl} ${statusCode} ${duration}ms [${requestId}]`;

      if (statusCode >= 500) {
        this.logger.error(logLine);
      } else if (statusCode >= 400) {
        this.logger.warn(logLine);
      } else {
        this.logger.log(logLine);
      }
    });

    next();
  }
}
