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

    test('should reject JWT without issuer (iss)', async () => {
      const tokenWithoutIss = jwt.sign(
        { sub: 'did:example:test' }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );
      
      await expect(fetchBlueskySession(tokenWithoutIss)).rejects.toThrow(AuthenticationError);
      await expect(fetchBlueskySession(tokenWithoutIss)).rejects.toThrow('JWT missing or invalid issuer (iss) claim');
    });

    test('should reject JWT without subject (sub)', async () => {
      const tokenWithoutSub = jwt.sign(
        { iss: 'https://bsky.social' }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );
      
      await expect(fetchBlueskySession(tokenWithoutSub)).rejects.toThrow(AuthenticationError);
      await expect(fetchBlueskySession(tokenWithoutSub)).rejects.toThrow('JWT missing or invalid subject (sub) claim');
    });

    test('should reject JWT with invalid DID format in subject', async () => {
      const tokenWithInvalidDid = jwt.sign(
        { 
          iss: 'https://bsky.social',
          sub: 'invalid-did-format' // Should start with 'did:'
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );
      
      await expect(fetchBlueskySession(tokenWithInvalidDid)).rejects.toThrow(AuthenticationError);
      await expect(fetchBlueskySession(tokenWithInvalidDid)).rejects.toThrow('must be a valid DID');
    });

    test('should reject expired JWT', async () => {
      const expiredToken = jwt.sign(
        { 
          iss: 'https://bsky.social',
          sub: 'did:example:test',
          exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
        }, 
        'secret', 
        { algorithm: 'HS256' }
      );
      
      await expect(fetchBlueskySession(expiredToken)).rejects.toThrow(AuthenticationError);
      await expect(fetchBlueskySession(expiredToken)).rejects.toThrow('JWT token has expired');
    });
  });

  describe('PDS Communication', () => {
    test('should successfully validate with PDS', async () => {
      const pdsUrl = 'https://test-pds.example.com';
      const userDid = 'did:example:testuser';
      const userHandle = 'testuser.bsky.social';

      const validToken = jwt.sign(
        { 
          iss: pdsUrl,
          sub: userDid,
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

    test('should handle PDS returning error status', async () => {
      const pdsUrl = 'https://test-pds.example.com';
      const userDid = 'did:example:testuser';

      const validToken = jwt.sign(
        { 
          iss: pdsUrl,
          sub: userDid
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      // Mock PDS returning 401 Unauthorized
      nock(pdsUrl)
        .get('/xrpc/com.atproto.server.getSession')
        .reply(401, 'Unauthorized');

      await expect(fetchBlueskySession(validToken)).rejects.toThrow(AuthenticationError);
      await expect(fetchBlueskySession(validToken)).rejects.toThrow('PDS validation failed with status 401');
    });

    test('should handle network errors to PDS', async () => {
      const pdsUrl = 'https://nonexistent-pds.example.com';
      const userDid = 'did:example:testuser';

      const validToken = jwt.sign(
        { 
          iss: pdsUrl,
          sub: userDid
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      // Mock network error
      nock(pdsUrl)
        .get('/xrpc/com.atproto.server.getSession')
        .replyWithError('ENOTFOUND');

      await expect(fetchBlueskySession(validToken)).rejects.toThrow(AuthenticationError);
      await expect(fetchBlueskySession(validToken)).rejects.toThrow('Unable to contact PDS');
    });
  });

  describe('Response Validation', () => {
    test('should reject malformed PDS response', async () => {
      const pdsUrl = 'https://malformed-pds.example.com';
      const userDid = 'did:example:testuser';

      const validToken = jwt.sign(
        { 
          iss: pdsUrl,
          sub: userDid
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      // Mock malformed response (missing 'did' field)
      nock(pdsUrl)
        .get('/xrpc/com.atproto.server.getSession')
        .reply(200, {
          handle: 'test.bsky.social',
          // missing 'did' field
        });

      await expect(fetchBlueskySession(validToken)).rejects.toThrow(AuthenticationError);
      await expect(fetchBlueskySession(validToken)).rejects.toThrow('PDS returned malformed session data');
    });

    test('should reject PDS response with wrong DID type', async () => {
      const pdsUrl = 'https://bad-did-type-pds.example.com';
      const userDid = 'did:example:testuser';

      const validToken = jwt.sign(
        { 
          iss: pdsUrl,
          sub: userDid
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      // Mock response with wrong DID type
      nock(pdsUrl)
        .get('/xrpc/com.atproto.server.getSession')
        .reply(200, {
          did: 12345, // Wrong type - should be string
          handle: 'test.bsky.social',
        });

      await expect(fetchBlueskySession(validToken)).rejects.toThrow(AuthenticationError);
      await expect(fetchBlueskySession(validToken)).rejects.toThrow('missing or invalid DID');
    });

    test('should detect DID mismatch between JWT and PDS response', async () => {
      const pdsUrl = 'https://mismatch-pds.example.com';
      const jwtDid = 'did:example:jwt-user';
      const pdsDid = 'did:example:different-user';

      const validToken = jwt.sign(
        { 
          iss: pdsUrl,
          sub: jwtDid
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      // Mock PDS returning different DID than what's in JWT
      nock(pdsUrl)
        .get('/xrpc/com.atproto.server.getSession')
        .reply(200, {
          did: pdsDid, // Different from JWT
          handle: 'test.bsky.social',
        });

      await expect(fetchBlueskySession(validToken)).rejects.toThrow(AuthenticationError);
      await expect(fetchBlueskySession(validToken)).rejects.toThrow(`DID mismatch: JWT claims ${jwtDid} but PDS returned ${pdsDid}`);
    });

    test('should handle invalid JSON response from PDS', async () => {
      const pdsUrl = 'https://invalid-json-pds.example.com';
      const userDid = 'did:example:testuser';

      const validToken = jwt.sign(
        { 
          iss: pdsUrl,
          sub: userDid
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      // Mock invalid JSON response
      nock(pdsUrl)
        .get('/xrpc/com.atproto.server.getSession')
        .reply(200, 'invalid-json-response');

      await expect(fetchBlueskySession(validToken)).rejects.toThrow(AuthenticationError);
      await expect(fetchBlueskySession(validToken)).rejects.toThrow('PDS returned invalid JSON response');
    });
  });

  describe('Custom Domain PDS Support', () => {
    test('should work with custom domain PDS URLs', async () => {
      const customPdsUrl = 'https://custom-domain.example.com';
      const userDid = 'did:plc:customuser123';
      const userHandle = 'user.custom-domain.example.com';

      const validToken = jwt.sign(
        { 
          iss: customPdsUrl,
          sub: userDid,
          handle: userHandle
        }, 
        'secret', 
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      // Mock custom PDS response
      nock(customPdsUrl)
        .get('/xrpc/com.atproto.server.getSession')
        .reply(200, {
          did: userDid,
          handle: userHandle,
          email: 'user@custom-domain.example.com',
        });

      const result = await fetchBlueskySession(validToken);

      expect(result.did).toBe(userDid);
      expect(result.handle).toBe(userHandle);
    });
  });
});