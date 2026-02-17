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

  // -----------------------------------------------------------------------
  // Health & Metrics (public endpoints)
  // -----------------------------------------------------------------------

  describe('Health & Metrics', () => {
    it('GET /api/v1/health should return 200 with uptime', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('uptime');
      expect(typeof res.body.uptime).toBe('number');
    });

    it('GET /api/v1/metrics should return 200 with Prometheus text', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/metrics')
        .expect(200);

      expect(res.text).toContain('nvremote_');
    });
  });

  // -----------------------------------------------------------------------
  // Waitlist (public endpoint)
  // -----------------------------------------------------------------------

  describe('Waitlist', () => {
    it('POST /api/v1/waitlist should reject without email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/waitlist')
        .send({})
        .expect(400);
    });

    it('POST /api/v1/waitlist should reject with invalid email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/waitlist')
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('POST /api/v1/waitlist should accept a valid email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/waitlist')
        .send({ email: `e2e-${Date.now()}@test.nvremote.com` });

      // 201 on first submit, or 200/409 if already exists
      expect([200, 201, 409]).toContain(res.status);
    });
  });

  // -----------------------------------------------------------------------
  // Profile update (PATCH /auth/me)
  // -----------------------------------------------------------------------

  describe('Profile update', () => {
    it('PATCH /api/v1/auth/me should return 401 without token', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/auth/me')
        .send({ preferences: { defaultQuality: 'balanced' } })
        .expect(401);
    });

    it('PATCH /api/v1/auth/me with invalid JWT should return 401', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .send({ preferences: { defaultQuality: 'balanced' } })
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // Additional admin endpoints (401 without token)
  // -----------------------------------------------------------------------

  describe('Admin endpoints (extended)', () => {
    it('GET /api/v1/admin/qos should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/qos')
        .expect(401);
    });

    it('GET /api/v1/admin/clients should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/clients')
        .expect(401);
    });

    it('GET /api/v1/admin/errors should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/errors')
        .expect(401);
    });

    it('GET /api/v1/admin/infra should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/infra')
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // Audit endpoints — require authentication
  // -----------------------------------------------------------------------

  describe('Audit endpoints', () => {
    it('GET /api/v1/audit should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/audit')
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // Tunnel endpoints (extended)
  // -----------------------------------------------------------------------

  describe('Tunnel endpoints (extended)', () => {
    it('POST /api/v1/tunnel/validate should return 401 without token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/tunnel/validate')
        .send({ tunnelId: 'fake' })
        .expect(401);
    });

    it('GET /api/v1/tunnel/audit should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/tunnel/audit')
        .expect(401);
    });

    it('DELETE /api/v1/tunnel/fake-id should return 401 without token', () => {
      return request(app.getHttpServer())
        .delete('/api/v1/tunnel/fake-id')
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // Input validation edge cases
  // -----------------------------------------------------------------------

  describe('Input validation', () => {
    it('POST /api/v1/auth/refresh should reject extra fields (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'test', extraField: 'should-fail' })
        .expect(400);
    });

    it('POST /api/v1/hosts/register should reject extra fields', () => {
      return request(app.getHttpServer())
        .post('/api/v1/hosts/register')
        .send({
          bootstrapToken: 'token',
          name: 'Host',
          hostname: 'machine',
          maliciousField: 'injected',
        })
        .expect(400);
    });

    it('POST /api/v1/waitlist should reject extra fields', () => {
      return request(app.getHttpServer())
        .post('/api/v1/waitlist')
        .send({ email: 'valid@test.com', spam: true })
        .expect(400);
    });
  });

  // -----------------------------------------------------------------------
  // Session signaling (auth required)
  // -----------------------------------------------------------------------

  describe('Session signaling', () => {
    it('POST /api/v1/sessions/:id/offer should return 401 without token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sessions/00000000-0000-0000-0000-000000000000/offer')
        .send({ sdp: 'test', type: 'offer' })
        .expect(401);
    });

    it('POST /api/v1/sessions/:id/ice-candidate should return 401 without token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sessions/00000000-0000-0000-0000-000000000000/ice-candidate')
        .send({ candidate: 'test', sdpMid: '0', sdpMLineIndex: 0 })
        .expect(401);
    });

    it('GET /api/v1/sessions/:id/ice-candidates should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/sessions/00000000-0000-0000-0000-000000000000/ice-candidates')
        .expect(401);
    });

    it('POST /api/v1/sessions/:id/end should return 401 without token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sessions/00000000-0000-0000-0000-000000000000/end')
        .expect(401);
    });
  });
});
