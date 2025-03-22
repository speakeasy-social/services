# Speakeasy Services

A collection of microservices for the Speakeasy platform enabling Bluesky users to share posts with trusted followers only, built with post-quantum encryption and user convenience in mind.

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

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.15.4
- Docker and Docker Compose

### Initial Setup

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd speakeasy-services
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

3. Run the development setup script:
   ```bash
   pnpm setup:dev
   ```

This will:

- Start Docker services (PostgreSQL, PgBoss)
- Create necessary database schemas
- Run Prisma migrations for each service
- Generate Prisma clients
- Install dependencies
- Build all packages

### Development Workflow

1. Start all services in development mode:

   ```bash
   pnpm dev
   ```

2. Access service endpoints:

   - User Profiles: http://localhost:3001
   - Private Sessions: http://localhost:3002
   - Trusted Users: http://localhost:3003
   - PgBoss UI: http://localhost:8080

3. Database Management:

   ```bash
   # Run migrations
   pnpm db:migrate

   # Generate Prisma clients
   pnpm db:generate

   # Open Prisma Studio
   pnpm db:studio
   ```

### Service Dependencies

- Each service has its own Prisma schema and migrations
- Services communicate via HTTP APIs
- Job processing is coordinated through PgBoss
- Cross-service jobs are handled through job names (e.g., `add-recipient-to-session`)

### Testing

```bash
# Run all tests
pnpm test

# Run tests for a specific service
cd services/<service-name>
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
