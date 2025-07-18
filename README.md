# Speakeasy Services

A collection of microservices for the Speakeasy platform enabling Bluesky users to share posts with trusted followers only, built with post-quantum encryption and user convenience in mind.

## Quickstart

You will need Docker installed

```
# First time
pnpm install
pnpm dev:setup

# Launch dev environment
pnpm dev

# Or to launch just one service
pnpm dev:private-sessions
```

## Testing

The application supports separate test and development environments:

```
# Setup test environment (separate database)
pnpm test:setup

# Run tests
pnpm test

# Cleanup test environment
pnpm test:cleanup
```

For detailed testing information, see [TEST_ENVIRONMENT.md](TEST_ENVIRONMENT.md).

To add an invite code in prod:

SSH into spkeasy_services_prod

```bash
docker exec -it <container-id> npm run invite:add -- <code> <key> [value] [totalUses]
```

If you've borked your database `pnpm dev:setup` will wipe and reinitialise it

[Database ER Diagrams](DATABASE_DIAGRAMS.md)

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
│   ├── trusted-users/          # Trust relationship management
│   ├── private-sessions/       # Encryption session and private post management
│   ├── group-sessions/         # (Future)
│   └── group-members/          # (Future)
├── docker/                      # Docker configuration
│   ├── development/
│   └── production/
├── scripts/                     # Build and deployment scripts
├── tests/                       # Integration tests
├── .github/                     # GitHub Actions workflows
├── package.json                 # Root package.json for workspace
├── tsconfig.json               # Base TypeScript configuration
└── docker-compose.yml          # Local development setup
```

## Architecture Overview

A set of microservices handling:

- User profiles and preferences (user-profiles)
- User encryption keys (user-keys)
- Trust relationships (trusted-users)
- Encryption sessions and private posts (private-sessions)

## Technical Stack

- TypeScript
- XRPC (@atproto/xrpc-server)
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

## Architecture

The services are built as a collection of microservices that share a common development environment. Each service has its own:

- Database schema
- API endpoints
- Job processing (via PgBoss)
- Prisma models and migrations

### Services

1. **User Profiles Service**

   - Manages user keys and profiles
   - Schema: `user_profiles`
   - Port: 3001

2. **Private Sessions Service**

   - Handles private session creation and management
   - Schema: `private_sessions`
   - Port: 3002
   - Processes session-related jobs

3. **Trusted Users Service**
   - Manages trusted user relationships
   - Schema: `trusted_users`
   - Port: 3003
   - Schedules session recipient additions

### Shared Infrastructure

- **PostgreSQL Database**

  - Single database instance
  - Separate schemas for each service
  - Shared PgBoss schema for job processing
  - Default credentials:
    - User: speakeasy
    - Password: speakeasy
    - Database: speakeasy

- **PgBoss**
  - Centralized job processing
  - Single schema (`pgboss`)
  - Job names partition processing by service
  - Web UI available at http://localhost:8080

## Development Environment Setup

## Prerequisites

- Node.js (v18 or later)
- Docker and Docker Compose
- pnpm

## Initial Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start the development environment:
   ```bash
   pnpm dev:setup
   ```
   This will:
   - Create a `.env` file from `.env.example` if it doesn't exist
   - Start all services in Docker
   - Run database migrations
   - Build and start the services

## Common Issues

### Database Migrations

If you see errors about database migrations:

- Check that your `.env` file has the correct database URLs
- Each service has its own database URL (e.g. `PRIVATE_SESSIONS_DB_URL`, `TRUSTED_USERS_DB_URL`)
- The main `DATABASE_URL` is used for migrations

### TypeScript Build Errors

If you see TypeScript errors:

- Make sure all dependencies are installed
- Check that the common package is built
- Run `pnpm build` in the common package if needed

### Service Dependencies

Services depend on each other in this order:

1. `user-keys` - Provides key management
2. `trusted-users` - Manages trust relationships
3. `private-sessions` - Handles private sessions
4. `private-posts` - Manages private posts

If a service fails to start, check its dependencies are running first.

## Development Workflow

1. Make changes to the code
2. Run `pnpm build` to rebuild affected packages
3. Restart services as needed with `pnpm dev`

## Testing

Run tests with:

```bash
pnpm test
```

## Contributing

1. Create a new branch for your feature
2. Make your changes
3. Run tests and ensure everything builds
4. Submit a pull request

## License

[License details here]

See [REFERENCE.md](REFERENCE.md) for detailed technical documentation.
