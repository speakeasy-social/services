# Trusted Followers Privacy Feature - Technical Reference

A privacy extension for Bluesky enabling users to share posts with trusted followers only, with support for future E2EE implementation.

## Key Management

### User Keys

- Server generates encryption key pair for each user
- Keys stored centrally for device independence
- Future enhancement: encrypt private keys with user password

### Session Structure

- Each trusted relationship group maintains a session
- Session contains:
  - Session ID (UUID)
  - Creation timestamp
  - List of authorized DIDs
  - Data Encryption Key (DEK)
  - Previous session ID (for key rotation)
  - Revocation timestamp if trust revoked

### Key Hierarchy

- User Keys: Public/private key pair for each user
- Data Encryption Key (DEK): Symmetric key used for all messages in a session
- Per-Follower Keys: DEK encrypted with each follower's public key
- One DEK per session, rotated on trust changes or periodic rotation
- Unencrypted DEK stored separately for staff access (and eventually deleted when we move to E2E encryption)

### Encryption Algorithms

- Post-Quantum Algorithm: CRYSTALS-Kyber for key encapsulation
- Symmetric Encryption: AES-256-GCM for message content
- Key Derivation: CRYSTALS-Dilithium for digital signatures
- All cryptographic operations must use quantum-resistant algorithms from the NIST Post-Quantum Cryptography standardization process

## Session Lifecycle

### New Session Creation Triggers

- Initial trust relationship established
- Trust revocation (follower removal)
- Periodic rotation (every 7 days)
- Manual rotation request

### Session State Management

```
{
  "sessionId": "uuid",
  "createdAt": "ISO8601",
  "expiresAt": "ISO8601",
  "revokedAt": "ISO8601",
  "authorizedDids": ["did:1", "did:2"],
  "previousSessionId": "uuid",
  "encryptedDeks": {
    "did:1": "base64_encrypted_dek",
    "did:2": "base64_encrypted_dek"
  }
}
```

## Follower Management

### Adding New Followers

- Uses existing session
- Encrypts current session's DEK with new follower's public key
- MVP: Only encrypts DEKs for sessions within last 30 days
- Future: Implements lazy encryption of historical session DEKs on access

### Removing Followers

- Mark current session as revoked
- Generate new session with new DEK
- Encrypt new DEK for all remaining followers
- If new session creation fails, old session remains revoked
- Client must retry if no valid session exists

## Trust Revocation Flow

1. Mark current session as revoked (guaranteed to succeed)
2. Create new session
3. Generate new DEK
4. Copy authorized DIDs except revoked DID
5. Encrypt new DEK with each remaining follower's public key
6. If any step fails, client must retry with new session creation

## Data Flow Examples

### Posting New Message

1. Client retrieves current valid session (not revoked, most recent)
2. If no valid session exists, create new session
3. If session needs rotation:
   - Generate new session with new DEK
   - Encrypt DEK with each follower's public key
   - Store unencrypted DEK for staff access
4. Encrypt content with session DEK
5. Store encrypted message with session reference

### Reading Messages

1. Client fetches encrypted messages
2. For each message:
   - Retrieve session data
   - Decrypt session DEK using reader's private key
   - Decrypt content using DEK

## Message Structure

### Encrypted Message Format

```
{
  "messageId": "uuid",
  "sessionId": "uuid",
  "encryptedContent": "base64",
  "timestamp": "ISO8601",
  "authorDid": "did:example"
}
```

## Database Schemas

### Trust Service

```
CREATE TABLE trusted_users (
  author_did TEXT,
  recipient_did TEXT,
  created_at TIMESTAMP NOT NULL,
  deleted_at TIMESTAMP,
  PRIMARY KEY (author_did, recipient_did, created_at)
);
```

### User Key Service

```
CREATE TABLE user_keys (
  did TEXT PRIMARY KEY,
  public_key BYTEA,
  private_key BYTEA,
  created_at TIMESTAMP
);
```

### Session Key Service

```
CREATE TABLE sessions (
session_id UUID PRIMARY KEY,
author_did TEXT NOT NULL,
created_at TIMESTAMP NOT NULL,
expires_at TIMESTAMP,
revoked_at TIMESTAMP,
previous_session_id UUID
);

CREATE INDEX idx_sessions_current
ON sessions(author_did, created_at DESC);

CREATE TABLE session_keys (
session_id UUID,
recipient_did TEXT,
encrypted_dek BYTEA,
PRIMARY KEY (session_id, recipient_did)
);

CREATE TABLE staff_keys (
session_id UUID PRIMARY KEY,
dek BYTEA
);
```

### Message Service

```
CREATE TABLE encrypted_messages (
  message_id UUID PRIMARY KEY,
  session_id UUID,
  author_did TEXT,
  encrypted_content BYTEA,
  created_at TIMESTAMP
);
```

## Security Considerations

### Key Management

- One DEK per session provides balance of security and performance
- DEK only exists in decrypted form in client memory
- Public key operations only performed once per recipient per session
- Session rotation provides forward secrecy
- Unencrypted DEKs stored separately for staff access
- User private keys stored centrally for device independence

### Access Control

- DEK encrypted separately for each recipient
- Trust Service validates access before Key Service returns keys
- All key operations logged with timestamps and DIDs
- Session revocation prevents access even if new session creation fails
- User Key Service has stricter access controls than Session Key Service

### Historical Access

- MVP limits new recipient access to recent sessions (30 days)
- Future implementation may support lazy key generation for historical access
- Balance between immediate computational cost and access to history
- Maintains security while managing performance

## Future Enhancements

- Encrypt private keys with user password
- Stop writing to staff_keys table
- Delete staff_keys table
- Add key verification system
- Implement key transparency logging
- Implement lazy key generation for historical access
