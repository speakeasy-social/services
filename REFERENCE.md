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

### Encryption Algorithms

- Post-Quantum Algorithm: CRYSTALS-Kyber for key encapsulation
- Symmetric Encryption: AES-256-GCM for message content
- All cryptographic operations must use quantum-resistant algorithms from the NIST Post-Quantum Cryptography standardization process

## Session Lifecycle

### New Session Creation Triggers

- Initial trust relationship established
- Trust revocation (follower removal)
- Periodic rotation (every 7 days)
- Manual rotation request

## Follower Management

### Adding New Trusted User

- Uses existing session
- Encrypts current session's DEK with new follower's public key
- MVP: Only encrypts DEKs for sessions within last 30 days
- Future: Implements lazy encryption of historical session DEKs on access

### Removing Trusted User

- Mark current session as revoked
- Generate new session with new DEK
- Delete session_key for removed trusted user
- Encrypt new DEK for all remaining followers
- If new session creation fails, old session remains revoked
- Client must retry if no valid session exists

## Data Flow Examples

### Posting New Post

1. Client retrieves current valid session (not revoked, most recent)
2. If no valid session exists, create new session
3. If session new/needs rotation:
   - Generate new session with new DEK
   - Encrypt DEK with each follower's public key (and the users)
4. Encrypt content with session DEK
5. Store encrypted post with session reference

### Reading Posts

1. Client fetches encrypted posts
2. For each post:
   - Retrieve session data
   - Decrypt session DEK using reader's private key
   - Decrypt content using DEK

### Private Sessions Service

The private-sessions service combines session management and post storage to maintain operational efficiency while preserving security boundaries. This design decision is based on:

1. **Security Boundaries**
   - Critical security boundary (user private keys) remains in user-keys service
   - DEKs are always encrypted with recipient public keys
   - Posts are encrypted with DEKs
   - No unencrypted data accessible without proper authorization

2. **Operational Efficiency**
   - Single service for related data reduces complexity
   - Atomic operations for post + key management
   - Efficient querying for post feeds
   - No unnecessary service-to-service communication
