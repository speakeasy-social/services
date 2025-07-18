# Cursor Background Agents Configuration

This project is configured to work with Cursor background agents using the existing development scripts.

## Background Agents

Two background agents are configured in `.cursor/settings.json`:

### `setup`
- **Command**: `pnpm dev:setup`
- **Purpose**: Complete development environment setup
- **What it does**: Installs dependencies, starts PostgreSQL, sets up database schemas, runs migrations, initializes S3, and configures PgBoss

### `postgres`
- **Command**: `docker-compose up -d postgres`
- **Purpose**: Start PostgreSQL database only
- **What it does**: Launches the PostgreSQL container for database operations

## Using Background Agents for PR Development

When a background agent is working on a PR, it can use the existing npm scripts:

### Development Setup
```bash
pnpm dev:setup  # Complete environment setup
```

### Building and Testing
```bash
pnpm build      # Build all packages and services
pnpm typecheck  # Run TypeScript type checking
pnpm lint       # Run ESLint
pnpm test       # Run tests with database integration
```

### Development
```bash
pnpm dev        # Start all services
```

## Environment Configuration

The project uses a single `.env.example` file that gets copied to `.env` during setup. This ensures the same environment configuration works in both local development and cloud environments.

## Database Configuration

- **Host**: localhost:5496
- **Database**: speakeasy
- **User**: speakeasy
- **Password**: speakeasy
- **Schemas**: user_keys, trusted_users, private_sessions, service_admin, media, pgboss

## Prerequisites

- Docker and Docker Compose
- Node.js (version in `.nvmrc`)
- pnpm package manager

The existing scripts handle all the complexity of setting up the development environment, making them suitable for both local development and Cursor background agent environments.