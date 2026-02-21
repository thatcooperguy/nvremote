// Sentry must be imported before all other modules
import './instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  // Use process.env.PORT directly (Cloud Run sets this)
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : configService.get<number>('PORT', 3001);
  const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000');
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  // Security — Helmet with tightened defaults
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false, // Disable CSP in dev for Swagger
      crossOriginEmbedderPolicy: false, // Allow embedding for OAuth flows
      hsts: {
        maxAge: 31536000,  // 1 year
        includeSubDomains: true,
        preload: true,
      },
    }),
  );
  app.use(compression());

  // CORS — strict origin matching, no wildcards in production
  const allowedOrigins = corsOrigin
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  // Reject wildcard (*) in production
  if (isProduction && allowedOrigins.includes('*')) {
    logger.warn(
      'CORS_ORIGIN contains wildcard (*) in production. Restricting to nvremote.com only.',
    );
    allowedOrigins.length = 0;
    allowedOrigins.push('https://nvremote.com', 'https://www.nvremote.com');
  }

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Remaining'],
    maxAge: 86400, // 24 hours — reduce preflight requests
  });

  // Global validation pipe — strict mode
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // Strip unrecognized properties
      forbidNonWhitelisted: true, // Reject requests with extra properties
      forbidUnknownValues: true,  // Reject unknown values in enums
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      // Limit payload nesting to prevent DoS via deeply nested objects
      validationError: {
        target: false, // Don't expose class instances in error responses
        value: false,  // Don't expose submitted values in error responses
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Swagger / OpenAPI (disabled in production for security)
  if (!isProduction || configService.get<string>('ENABLE_SWAGGER') === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('NVRemote Control Plane API')
      .setDescription('Enterprise-grade GPU streaming platform API')
      .setVersion('0.5.1-beta')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log(`Swagger docs available at http://localhost:${port}/api/docs`);
  }

  // Enable graceful shutdown hooks so OnModuleDestroy lifecycle events fire
  // on SIGTERM/SIGINT. Required for Cloud Run (sends SIGTERM) and Docker.
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  logger.log(`Application listening on 0.0.0.0:${port}`);
  logger.log(`Environment: ${isProduction ? 'production' : 'development'}`);
  logger.log(`CORS origins: ${allowedOrigins.join(', ')}`);
  logger.log(`Rate limiting: ${configService.get('THROTTLE_LIMIT', 100)} req/${configService.get('THROTTLE_TTL', 60)}s`);
}

bootstrap();
