# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

- `pnpm build`: Build all services and packages using Turbo
- `pnpm lint`: Lint all TypeScript files across services
- `pnpm test`: Run tests across all services
- `pnpm format`: Format code using Prettier

## Development Commands

- `pnpm dev:setup`: First-time setup (creates .env files, starts Docker, runs migrations)
- `pnpm dev`: Start all services in development mode (API + worker for each)
- `pnpm dev:private-sessions`: Start only the private-sessions service
- `pnpm dev:trusted-users`: Start only the trusted-users service  
- `pnpm dev:user-keys`: Start only the user-keys service

## Service-Specific Commands

Within individual service directories (`services/*/`):
- `npm run dev:api`: Start the API server
- `npm run dev:worker`: Start the background worker
- `npm run dev:prisma`: Watch Prisma schema changes and regenerate client
- `npm run test`: Run service tests (Vitest)
- `npm run test:watch`: Run tests in watch mode

## Testing Framework

- **All services**: Vitest with supertest for API testing
- Test files located in `tests/integration/api/` within each service

## Architecture Overview

This is a microservices monorepo for a Bluesky private messaging platform with post-quantum encryption:

### Project Structure
```
/
├── packages/                    # Shared libraries
│   ├── common/                 # Shared types, utilities, constants
│   ├── crypto/                 # Post-quantum crypto (Kyber, Dilithium)
│   ├── queue/                  # PgBoss job queue wrapper
│   ├── service-base/           # Common service patterns
│   └── test-utils/             # Shared testing utilities
└── services/                   # Microservices
    ├── user-keys/              # Encryption key management
    ├── trusted-users/          # Trust relationship management
    ├── private-sessions/       # Session + private post management
    ├── media/                  # Media file handling
    ├── service-admin/          # Admin operations (invite codes)
    └── private-profiles/       # User profile management
```

### Key Technologies
- **Framework**: XRPC (@atproto/xrpc-server) for AT Protocol compatibility
- **Database**: PostgreSQL with Prisma ORM (separate schema per service)
- **Queue**: PgBoss for background job processing
- **Crypto**: CRYSTALS-Kyber (post-quantum) + AES-256-GCM
- **Auth**: AT Protocol JWT tokens
- **Build**: Turbo monorepo with pnpm workspaces

### Service Dependencies
Services have dependencies that affect startup order:
1. `user-keys` → Key management (foundation)
2. `trusted-users` → Trust relationships
3. `private-sessions` → Session management
4. `media` → File handling
5. `service-admin` → Administrative functions

### Database Schema
- Each service has its own PostgreSQL schema
- Shared `pgboss` schema for job processing
- Connection strings: `<SERVICE>_DB_URL` environment variables
- Migrations run via `pnpm dev:setup` or `./scripts/run-migrations.sh`

### Development Environment
- Docker Compose for PostgreSQL, PgBoss web UI (port 8080)
- Services run on ports 3001-3005
- Environment setup via `.env.example` → `.env` copying
- Prisma client generation required before building

## Important Development Notes

- **Prisma changes**: Run `prisma generate` in service directory after schema changes
- **Package dependencies**: Use workspace references (e.g., `@speakeasy-services/common`)
- **Database reset**: `pnpm dev:setup` wipes and reinitializes the database if needed