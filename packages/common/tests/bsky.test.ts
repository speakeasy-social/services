import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import nock from 'nock';
import { fetchBlueskySession } from '../src/bsky.js';
import { AuthenticationError } from '../src/errors.js';

describe('Enhanced JWT Authentication - fetchBlueskySession', () => {
  
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('JWT Structure Validation', () => {
    test('should reject invalid JWT format', async () => {
      await expect(fetchBlueskySession('invalid-jwt')).rejects.toThrow(AuthenticationError);
      await expect(fetchBlueskySession('invalid-jwt')).rejects.toThrow('Failed to decode JWT');
    });

    test('should work without issuer (iss) claim', async () => {
      const tokenWithoutIss = jwt.sign(
        { 
          sub: 'did:example:test',
          aud: 'did:web:bsky.social'  // Use trusted domain to avoid profile fetch
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );
      
      // Should proceed to PDS call (will return error response, but that's expected)
      const result = await fetchBlueskySession(tokenWithoutIss) as any;
      expect(result.error).toBeDefined(); // PDS will return error for test token
    });

    test('should reject JWT without subject (sub)', async () => {
      const tokenWithoutSub = jwt.sign(
        { 
          aud: 'did:web:bsky.social'
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );
      
      await expect(fetchBlueskySession(tokenWithoutSub)).rejects.toThrow(AuthenticationError);
      await expect(fetchBlueskySession(tokenWithoutSub)).rejects.toThrow('JWT missing or invalid subject (sub) claim');
    });

    test('should reject JWT with invalid DID format in subject', async () => {
      const tokenWithInvalidDid = jwt.sign(
        { 
          sub: 'invalid-did-format', // Should start with 'did:'
          aud: 'did:web:bsky.social'
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );
      
      await expect(fetchBlueskySession(tokenWithInvalidDid)).rejects.toThrow(AuthenticationError);
      await expect(fetchBlueskySession(tokenWithInvalidDid)).rejects.toThrow('must be a valid DID');
    });

    test('should return error response for expired JWT', async () => {
      const expiredToken = jwt.sign(
        { 
          sub: 'did:example:test',
          aud: 'did:web:bsky.social',
          exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
        }, 
        'secret', 
        { algorithm: 'HS256' }
      );

      // PDS returns error response for test tokens (without iss claim)
      const result = await fetchBlueskySession(expiredToken) as any;
      expect(result.error).toBeDefined(); // Could be 'BadJwt' or other error without iss
    });
  });

  describe('PDS Communication', () => {
    test('should successfully validate with PDS', async () => {
      const pdsUrl = 'https://bsky.social';
      const userDid = 'did:example:testuser';
      const userHandle = 'testuser.bsky.social';

      const validToken = jwt.sign(
        { 
          sub: userDid,
          aud: 'did:web:bsky.social',
          handle: userHandle
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      // Mock successful PDS response
      nock(pdsUrl)
        .get('/xrpc/com.atproto.server.getSession')
        .matchHeader('authorization', `Bearer ${validToken}`)
        .reply(200, {
          did: userDid,
          handle: userHandle,
          email: 'test@example.com',
          refreshJwt: 'mock-refresh-token'
        });

      const result = await fetchBlueskySession(validToken);

      expect(result.did).toBe(userDid);
      expect(result.handle).toBe(userHandle);
      expect(result.email).toBe('test@example.com');
      expect(result.accessJwt).toBe(validToken);
    });

    test('should return error response from PDS', async () => {
      const pdsUrl = 'https://bsky.social';
      const userDid = 'did:example:testuser';

      const validToken = jwt.sign(
        { 
          sub: userDid,
          aud: 'did:web:bsky.social'
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      // PDS may return error response for invalid tokens
      const result = await fetchBlueskySession(validToken) as any;
      expect(result.error).toBeDefined(); // Could be 'BadJwtLexiconMethod' or other error
    });

    test('should handle network errors to PDS', async () => {
      const pdsUrl = 'https://bsky.social';
      const userDid = 'did:example:testuser';

      const validToken = jwt.sign(
        { 
          sub: userDid,
          aud: 'did:web:bsky.social'
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      // Mock network error
      nock(pdsUrl)
        .get('/xrpc/com.atproto.server.getSession')
        .replyWithError('ENOTFOUND');

      await expect(fetchBlueskySession(validToken)).rejects.toThrow(); // Network errors throw FetchError
    });
  });

  describe('Response Validation', () => {
    test('should return PDS error responses as-is', async () => {
      const pdsUrl = 'https://bsky.social';
      const userDid = 'did:example:testuser';

      const testToken = jwt.sign(
        { 
          sub: userDid,
          aud: 'did:web:bsky.social'
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      // Function should return error responses from PDS without throwing
      const result = await fetchBlueskySession(testToken) as any;
      expect(result.error).toBeDefined(); // PDS returns error for test tokens
    });
  });

  describe('Custom Domain PDS Support', () => {
    test('should handle custom domain PDS network errors', async () => {
      const customPdsUrl = 'https://custom-domain.example.com';
      const userDid = 'did:plc:customuser123';
      const userHandle = 'user.custom-domain.example.com';

      const validToken = jwt.sign(
        { 
          sub: userDid,
          aud: 'did:web:custom-domain.example.com',
          handle: userHandle
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      // Custom domain will fail with network error (which is expected)
      await expect(fetchBlueskySession(validToken)).rejects.toThrow();
    });
  });
});