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
  // Auth endpoints
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

  // -----------------------------------------------------------------------
  // Protected endpoints — must reject unauthenticated requests (JWT guard)
  // -----------------------------------------------------------------------

  describe('Protected endpoints (401 without token)', () => {
    it('GET /api/v1/auth/me should return 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });

    it('GET /api/v1/orgs should return 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/orgs')
        .expect(401);
    });

    it('GET /api/v1/sessions should return 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/sessions')
        .expect(401);
    });

    it('POST /api/v1/sessions should return 401', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sessions')
        .send({ hostId: '00000000-0000-0000-0000-000000000000' })
        .expect(401);
    });

    it('GET /api/v1/hosts should return 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/hosts')
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // Host registration
  // -----------------------------------------------------------------------

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

    it('POST /api/v1/hosts/register should reject without bootstrap token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/hosts/register')
        .send({
          name: 'Test Host',
          hostname: 'test-machine',
        })
        .expect(400);
    });
  });

  // -----------------------------------------------------------------------
  // Host heartbeat
  // -----------------------------------------------------------------------

  describe('Host heartbeat', () => {
    it('POST /api/v1/hosts/heartbeat should reject without API token header', () => {
      return request(app.getHttpServer())
        .post('/api/v1/hosts/heartbeat')
        .send({ status: 'ONLINE' })
        .expect(401);
    });

    it('POST /api/v1/hosts/heartbeat should reject with invalid API token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/hosts/heartbeat')
        .set('X-Host-Token', 'bogus-token')
        .send({ status: 'ONLINE' })
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // VPN endpoints — require authentication
  // -----------------------------------------------------------------------

  describe('VPN endpoints', () => {
    it('POST /api/v1/vpn/register-peer should return 401 without token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/vpn/register-peer')
        .send({ publicKey: 'testkey123' })
        .expect(401);
    });

    it('POST /api/v1/vpn/config should return 401 without token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/vpn/config')
        .send({ publicKey: 'testkey123' })
        .expect(401);
    });

    it('GET /api/v1/vpn/status should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/vpn/status')
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // Tunnel endpoints — require authentication
  // -----------------------------------------------------------------------

  describe('Tunnel endpoints', () => {
    it('POST /api/v1/tunnel should return 401 without token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/tunnel')
        .send({ sessionId: '00000000-0000-0000-0000-000000000000' })
        .expect(401);
    });

    it('GET /api/v1/tunnel/status should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/tunnel/status')
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // Admin endpoints — require authentication (and superAdmin)
  // -----------------------------------------------------------------------

  describe('Admin endpoints', () => {
    it('GET /api/v1/admin/stats should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/stats')
        .expect(401);
    });

    it('GET /api/v1/admin/sessions should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/sessions')
        .expect(401);
    });

    it('GET /api/v1/admin/hosts should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/hosts')
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // Invalid JWT — should get 401, not 500
  // -----------------------------------------------------------------------

  describe('Invalid JWT handling', () => {
    it('GET /api/v1/orgs with garbage JWT should return 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/orgs')
        .set('Authorization', 'Bearer this.is.not.a.real.jwt')
        .expect(401);
    });

    it('GET /api/v1/sessions with expired-looking JWT should return 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/sessions')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxfQ.invalidsig')
        .expect(401);
    });

    it('GET /api/v1/hosts with empty bearer should return 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/hosts')
        .set('Authorization', 'Bearer ')
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // Download redirect (public endpoint)
  // -----------------------------------------------------------------------

  describe('Download endpoints', () => {
    it('GET /api/v1/download/windows should redirect to GCS', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/download/windows')
        .expect(302);

      // Should redirect to GCS bucket
      expect(res.headers.location).toContain('storage.googleapis.com');
    });

    it('GET /api/v1/download/unknown-platform should return 400', () => {
      return request(app.getHttpServer())
        .get('/api/v1/download/fakePlatform')
        .expect(400);
    });
  });

  // -----------------------------------------------------------------------
  // ICE config endpoint (requires auth)
  // -----------------------------------------------------------------------

  describe('ICE config', () => {
    it('GET /api/v1/sessions/ice-config should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/sessions/ice-config')
        .expect(401);
    });
  });
});
