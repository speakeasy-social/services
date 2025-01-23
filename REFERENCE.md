# Trusted Followers Privacy Feature - Technical Reference

A privacy extension for Bluesky enabling users to share posts with trusted followers only, with support for future E2EE implementation.

## Key Management

### Session Structure

- Each trusted relationship group maintains a session
- Session contains:
  - Session ID (UUID)
  - Creation timestamp
  - List of authorized DIDs
  - Data Encryption Key (DEK)
  - Previous session ID (for key rotation)

### Key Hierarchy

- Data Encryption Key (DEK): Symmetric key used for all messages in a session
- Per-Follower Keys: DEK encrypted with each follower's public key
- One DEK per session, rotated on trust changes or periodic rotation

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

- Generates new session with new DEK
- Encrypts new DEK for all remaining followers
- Marks previous session as expired
- Prevents removed follower's future access

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

## Trust Revocation Flow

1. Create new session
2. Generate new DEK
3. Copy authorized DIDs except revoked DID
4. Encrypt new DEK with each remaining follower's public key
5. Mark previous session as expired

## Data Flow Examples

### Posting New Message

1. Client retrieves current session
2. If session needs rotation:
   - Generate new session with new DEK
   - Encrypt DEK with each follower's public key
3. Encrypt content with session DEK
4. Store encrypted message with session reference

### Reading Messages

1. Client fetches encrypted messages
2. For each message:
   - Retrieve session data
   - Decrypt session DEK using reader's private key
   - Decrypt content using DEK

## Database Schemas

### Trust Service

```
CREATE TABLE trust_relationships (
  truster_did TEXT,
  trustee_did TEXT,
  status TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (truster_did, trustee_did)
);
```

### Key Service

```
CREATE TABLE sessions (
  session_id UUID PRIMARY KEY,
  created_at TIMESTAMP,
  expires_at TIMESTAMP,
  previous_session_id UUID
);

CREATE TABLE session_keys (
  session_id UUID,
  did TEXT,
  encrypted_dek BYTEA,
  PRIMARY KEY (session_id, did)
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
- Public key operations only performed once per follower per session
- Session rotation provides forward secrecy

### Access Control

- DEK encrypted separately for each follower
- Trust Service validates access before Key Service returns keys
- All key operations logged with timestamps and DIDs
- Session rotation on trust revocation prevents future access

### Historical Access

- MVP limits new follower access to recent sessions (30 days)
- Future implementation will support lazy key generation for historical access
- Balance between immediate computational cost and access to history
- Maintains security while managing performance

## Future E2EE Migration Path

- Remove staff access to DEKs
- Implement client-side DEK generation
- Add key verification system
- Implement key transparency logging
- Implement lazy key generation for historical access
