import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // GOOGLE_CLIENT_ID is required by env validation; provide a fallback so the
    // e2e suite stays hermetic and doesn't depend on a local .env being present.
    process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror the production bootstrap (see src/main.ts) so the smoke test
    // exercises the same routing/validation behaviour the real app uses.
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  it('boots and applies the global "api" prefix (root is not mapped)', () => {
    return request(app.getHttpServer()).get('/').expect(404);
  });

  it('protects authenticated routes via the global JwtAuthGuard', () => {
    // No access token cookie/header -> the global guard rejects before any handler runs.
    return request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('validates request bodies on public routes', () => {
    // Empty body fails LoginDto validation, proving the ValidationPipe is wired up.
    return request(app.getHttpServer()).post('/api/auth/login').send({}).expect(400);
  });

  afterEach(async () => {
    await app.close();
  });
});
