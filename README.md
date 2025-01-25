# Private Posts for Bluesky

A privacy extension enabling Bluesky users to share posts with trusted followers only, built with post-quantum encryption and user convenience in mind.

## Project Structure

```
/
├── packages/                      # Shared packages/libraries
│   ├── common/                   # Shared code, types, and utilities
│   │   ├── src/
│   │   │   ├── types/           # Shared TypeScript interfaces
│   │   │   ├── constants/       # Shared constants
│   │   │   └── utils/           # Shared utility functions
│   └── crypto/                  # Shared cryptographic operations
│       ├── src/
│       │   ├── kyber/          # CRYSTALS-Kyber implementation
│       │   ├── aes/            # AES-256-GCM operations
│       │   └── dilithium/      # CRYSTALS-Dilithium signatures
├── services/                     # Individual microservices
│   ├── user-profiles/          # User profile and preferences management
│   ├── user-keys/              # User encryption key management
│   ├── follower-relations/     # Follower relationship management
│   ├── private-sessions/       # Encryption session management
│   ├── private-posts/          # Private post handling
│   ├── group-sessions/         # (Future)
│   ├── group-members/          # (Future)
│   └── group-posts/            # (Future)
├── docker/                      # Docker configuration
│   ├── development/
│   └── production/
├── prisma/                      # Database schemas and migrations
│   ├── migrations/
│   └── schema.prisma
├── scripts/                     # Build and deployment scripts
├── tests/                       # Integration tests
├── .github/                     # GitHub Actions workflows
├── package.json                 # Root package.json for workspace
├── tsconfig.json               # Base TypeScript configuration
└── docker-compose.yml          # Local development setup
```

## Architecture Overview

A set of microservices handling:

- User profiles and preferences
- User encryption keys
- Follower relationships
- Encryption sessions
- Private messages

## Technical Stack

- TypeScript
- Fastify with XRPC (@atproto/xrpc-server)
- PostgreSQL with Prisma ORM
- Authentication using AT Protocol JWT tokens
- Post-quantum encryption (CRYSTALS-Kyber)
- Symmetric encryption (AES-256-GCM)

## Key Features

- Completely out-of-band from Bluesky PDS
- No modifications to user's Bluesky data
- Staff access for moderation
- Multi-device support
- Key rotation and revocation
- Forward secrecy through session management

See [REFERENCE.md](REFERENCE.md) for detailed technical documentation.
