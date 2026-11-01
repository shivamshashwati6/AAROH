import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDatabaseUrl } from '../src/db';
import express, { Request, Response } from 'express';
import { authRouter } from '../src/routes/auth';
import { Server } from 'http';
import { AddressInfo } from 'net';

describe('Production Authentication Resilience & Supabase Pooler Normalization', () => {
  // ---------------------------------------------------------------------------
  // 1. Supabase Database Connection URL Normalization
  // ---------------------------------------------------------------------------
  describe('normalizeDatabaseUrl', () => {
    it('should correctly normalize direct Supabase IPv6-only hostname to IPv4 connection pooler', () => {
      const directUrl = 'postgresql://postgres:SecretPassword123@db.yuemwyglahasusymbefm.supabase.co:5432/postgres';
      const normalized = normalizeDatabaseUrl(directUrl);

      assert.ok(normalized, 'Normalized URL should be defined');
      const parsed = new URL(normalized);
      assert.equal(parsed.hostname, 'aws-0-ap-northeast-2.pooler.supabase.com');
      assert.equal(parsed.username, 'postgres.yuemwyglahasusymbefm');
      assert.equal(parsed.password, 'SecretPassword123');
      assert.equal(parsed.pathname, '/postgres');
      assert.equal(parsed.port, '5432');
    });

    it('should strip sslmode query parameter to prevent pg-connection-string from forcing rejectUnauthorized: true', () => {
      const urlWithSslMode = 'postgresql://postgres:SecretPassword123@db.yuemwyglahasusymbefm.supabase.co:5432/postgres?sslmode=require';
      const normalized = normalizeDatabaseUrl(urlWithSslMode);

      assert.ok(normalized);
      const parsed = new URL(normalized);
      assert.equal(parsed.searchParams.has('sslmode'), false);
      assert.equal(parsed.hostname, 'aws-0-ap-northeast-2.pooler.supabase.com');
    });

    it('should respect custom SUPABASE_REGION environment variable when provided', () => {
      const prevRegion = process.env.SUPABASE_REGION;
      try {
        process.env.SUPABASE_REGION = 'eu-west-1';
        const directUrl = 'postgresql://postgres:SecretPassword123@db.abcdefghijklmnop.supabase.co:5432/postgres';
        const normalized = normalizeDatabaseUrl(directUrl);

        assert.ok(normalized);
        const parsed = new URL(normalized);
        assert.equal(parsed.hostname, 'aws-0-eu-west-1.pooler.supabase.com');
        assert.equal(parsed.username, 'postgres.abcdefghijklmnop');
      } finally {
        if (prevRegion !== undefined) {
          process.env.SUPABASE_REGION = prevRegion;
        } else {
          delete process.env.SUPABASE_REGION;
        }
      }
    });

    it('should preserve already-configured Supabase pooler connection strings intact', () => {
      const poolerUrl = 'postgresql://postgres.yuemwyglahasusymbefm:SecretPassword123@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
      const normalized = normalizeDatabaseUrl(poolerUrl);

      assert.ok(normalized);
      const parsed = new URL(normalized);
      assert.equal(parsed.hostname, 'aws-0-ap-northeast-2.pooler.supabase.com');
      assert.equal(parsed.username, 'postgres.yuemwyglahasusymbefm');
    });

    it('should preserve local development postgres connection strings intact', () => {
      const localUrl = 'postgresql://postgres:postgres@localhost:5432/relief_os';
      const normalized = normalizeDatabaseUrl(localUrl);

      assert.equal(normalized, localUrl);
    });

    it('should return undefined or placeholders without throwing', () => {
      assert.equal(normalizeDatabaseUrl(undefined), undefined);
      assert.equal(normalizeDatabaseUrl(''), '');
      assert.equal(normalizeDatabaseUrl('postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co/postgres'), 'postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co/postgres');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Safe Error Responses for Authentication Endpoints
  // ---------------------------------------------------------------------------
  describe('Safe Authentication Error Handling', () => {
    let testServer: Server;
    let testBaseUrl: string;

    it('should reject malformed or missing fields with 400 Bad Request', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api/auth', authRouter);

      await new Promise<void>((resolve) => {
        testServer = app.listen(0, () => {
          const port = (testServer.address() as AddressInfo).port;
          testBaseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      try {
        // Register with invalid email
        const resReg = await fetch(`${testBaseUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Valid Name', email: 'invalid-email', password: 'Password123!' }),
        });
        assert.equal(resReg.status, 400);
        const dataReg = await resReg.json();
        assert.equal(dataReg.error, 'Invalid email address');

        // Login with empty password
        const resLogin = await fetch(`${testBaseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'valid@example.com', password: '' }),
        });
        assert.equal(resLogin.status, 400);
      } finally {
        await new Promise<void>((resolve) => testServer.close(() => resolve()));
      }
    });
  });
});

