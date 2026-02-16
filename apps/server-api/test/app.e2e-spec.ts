import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // -----------------------------------------------------------------------
  // Health-check style: unauthenticated endpoints should respond properly
  // -----------------------------------------------------------------------

  describe('Auth endpoints', () => {
    it('POST /api/v1/auth/refresh should reject without body', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(400);
    });

    it('POST /api/v1/auth/refresh should reject with invalid token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });
  });

  describe('Protected endpoints', () => {
    it('GET /api/v1/auth/me should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });

    it('GET /api/v1/orgs should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/orgs')
        .expect(401);
    });

    it('GET /api/v1/sessions should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/sessions')
        .expect(401);
    });
  });

  describe('Host registration', () => {
    it('POST /api/v1/hosts/register should reject with invalid bootstrap token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/hosts/register')
        .send({
          bootstrapToken: 'nonexistent-token',
          name: 'Test Host',
          hostname: 'test-machine',
        })
        .expect(400);
    });
  });
});
