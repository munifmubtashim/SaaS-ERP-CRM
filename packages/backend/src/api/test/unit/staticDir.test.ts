import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiErrorSchema } from '@erp/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { managersWithDatabase, silentLogger } from '../helpers.js';

// A stand-in for the built frontend (packages/frontend/dist).
const staticDir = mkdtempSync(join(tmpdir(), 'erp-static-'));
writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>ERP</title><div id="root"></div>');
mkdirSync(join(staticDir, 'assets'));
writeFileSync(join(staticDir, 'assets', 'app.js'), 'console.info("app");');

afterAll(() => rmSync(staticDir, { recursive: true, force: true }));

const withStatic = () => createApp({ logger: silentLogger, managers: managersWithDatabase(true), staticDir });
const withoutStatic = () => createApp({ logger: silentLogger, managers: managersWithDatabase(true) });

describe('STATIC_DIR: one container serves the built frontend and the API', () => {
  it('without STATIC_DIR, nothing is served at / (development uses Vite)', async () => {
    const res = await request(withoutStatic()).get('/');
    expect(res.status).toBe(404);
    expect(apiErrorSchema.parse(res.body).code).toBe('NOT_FOUND');
  });

  it('serves index.html at /', async () => {
    const res = await request(withStatic()).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<div id="root">');
  });

  it('serves built assets', async () => {
    const res = await request(withStatic()).get('/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });

  it('answers a page route of the app with index.html, so a reload works', async () => {
    const res = await request(withStatic()).get('/customers/42').set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root">');
  });

  it('serves the API under /api, as the Vite proxy does in development', async () => {
    const res = await request(withStatic()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('serves the liveness path under /api too', async () => {
    const res = await request(withStatic()).get('/api/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('an unknown API path stays a JSON 404, never index.html', async () => {
    // Any path that started with /api is API, also outside /v1 (Farhan, #17): /api/customers is no page.
    for (const path of ['/api/v1/nothing', '/v1/nothing', '/api/customers', '/api', '/api/health/nothing']) {
      const res = await request(withStatic()).get(path).set('Accept', 'text/html');
      expect(res.status).toBe(404);
      expect(apiErrorSchema.parse(res.body).code).toBe('NOT_FOUND');
    }
  });
});

describe('STATIC_DIR: cache headers (Farhan, #17)', () => {
  it('hashed files under /assets are cached for a year and never revalidated', async () => {
    const res = await request(withStatic()).get('/assets/app.js');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('index.html is revalidated on every visit, at / and on a page route', async () => {
    for (const path of ['/', '/customers/42']) {
      const res = await request(withStatic()).get(path).set('Accept', 'text/html');
      expect(res.text).toContain('<div id="root">');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });
});
