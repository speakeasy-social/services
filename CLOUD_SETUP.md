# Cloud Development Environment Setup for Cursor Background Agents

This document describes the configuration and setup required for Cursor background agents to work effectively on PRs in cloud environments.

## Overview

The Speakeasy Services project is configured to support cloud-based development with Cursor background agents. This setup ensures that:

- Type errors are captured and reported
- Compilation issues are detected
- Tests can run against PostgreSQL
- All services can be built and validated

## Prerequisites

- Docker and Docker Compose
- Node.js (version specified in `.nvmrc`)
- pnpm package manager

## Background Agents Configuration

The following background agents are configured in `.cursor/settings.json`:

### 1. `install`
- **Command**: `pnpm install`
- **Purpose**: Install all project dependencies
- **When to use**: Initial setup or after dependency changes

### 2. `postgres`
- **Command**: `docker-compose up -d postgres`
- **Purpose**: Launch PostgreSQL database container
- **When to use**: Before running tests or starting services

### 3. `cloud-setup`
- **Command**: `pnpm cloud:setup`
- **Purpose**: Complete environment setup (dependencies, database, migrations, build)
- **When to use**: Initial setup or when environment needs to be reset

### 4. `build`
- **Command**: `pnpm build`
- **Purpose**: Build all packages and services
- **When to use**: After code changes to ensure everything compiles

### 5. `typecheck`
- **Command**: `pnpm cloud:typecheck`
- **Purpose**: Run comprehensive TypeScript type checking
- **When to use**: To catch type errors across all packages and services

### 6. `lint`
- **Command**: `pnpm lint`
- **Purpose**: Run ESLint across all packages
- **When to use**: To catch code style and potential issues

### 7. `test`
- **Command**: `pnpm cloud:test`
- **Purpose**: Run all tests with database integration
- **When to use**: To validate functionality and catch regressions

### 8. `dev`
- **Command**: `pnpm dev`
- **Purpose**: Start development environment with all services
- **When to use**: For active development and debugging

## Cloud-Specific Scripts

### `scripts/cloud-setup.sh`

This script performs a complete setup for cloud environments:

1. **Node Version Management**: Uses the version specified in `.nvmrc`
2. **Dependency Installation**: Installs all dependencies with pnpm
3. **Environment Configuration**: Creates a `.env` file with cloud-appropriate settings
4. **Database Setup**: Starts PostgreSQL and waits for it to be ready
5. **Schema Creation**: Creates all required database schemas
6. **Migration Execution**: Runs all Prisma migrations
7. **Prisma Client Generation**: Generates Prisma clients for all services
8. **Package Building**: Builds all packages and services
9. **PgBoss Setup**: Configures the job queue system
10. **Dev Data**: Adds development invite codes

### `scripts/test-cloud.sh`

This script runs tests in cloud environments:

1. **Database Verification**: Ensures PostgreSQL is running
2. **Schema Validation**: Verifies database schemas are set up
3. **Migration Check**: Ensures migrations are up to date
4. **Client Generation**: Generates Prisma clients
5. **Package Building**: Builds all packages
6. **Test Execution**: Runs tests with extended timeouts

### `scripts/typecheck-cloud.sh`

This script performs comprehensive type checking:

1. **Dependency Check**: Ensures dependencies are installed
2. **Prisma Generation**: Generates Prisma clients
3. **Package Type Checking**: Checks all packages individually
4. **Service Type Checking**: Checks all services individually
5. **Root Type Checking**: Runs the root typecheck command

## Environment Variables

The cloud setup creates a `.env` file with the following configuration:

```bash
# Database URLs for cloud development
DATABASE_URL=postgresql://speakeasy:speakeasy@localhost:5496/speakeasy
USER_KEYS_DATABASE_URL=postgresql://speakeasy:speakeasy@localhost:5496/speakeasy?schema=user_keys
TRUSTED_USERS_DATABASE_URL=postgresql://speakeasy:speakeasy@localhost:5496/speakeasy?schema=trusted_users
PRIVATE_SESSIONS_DATABASE_URL=postgresql://speakeasy:speakeasy@localhost:5496/speakeasy?schema=private_sessions
SERVICE_ADMIN_DATABASE_URL=postgresql://speakeasy:speakeasy@localhost:5496/speakeasy?schema=service_admin
MEDIA_DATABASE_URL=postgresql://speakeasy:speakeasy@localhost:5496/speakeasy?schema=media

# S3 Configuration (LocalStack)
S3_ENDPOINT=http://localhost:4566
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=s3_test_key
S3_SECRET_ACCESS_KEY=s3_test_secret
S3_BUCKET_NAME=speakeasy-dev

# Service Configuration
NODE_ENV=development
LOG_LEVEL=debug

# AT Protocol Configuration
ATP_SERVICE_URL=https://bsky.social
```

## Database Schema Structure

The project uses a single PostgreSQL database with multiple schemas:

- `user_keys`: User encryption key management
- `trusted_users`: Trust relationship management
- `private_sessions`: Encryption session management
- `service_admin`: Administrative functions
- `media`: Media file management
- `pgboss`: Job queue management

## Testing Strategy

Tests are configured to run with:

- **Extended Timeouts**: 60 seconds for cloud environments
- **Database Integration**: Full PostgreSQL integration
- **Service Isolation**: Each service has its own test suite
- **Coverage Reporting**: Comprehensive coverage analysis

## Troubleshooting

### Common Issues

1. **PostgreSQL Connection Issues**
   - Ensure Docker is running
   - Check that the postgres container is healthy
   - Verify port 5496 is available

2. **Prisma Client Generation Failures**
   - Run `pnpm cloud:setup` to regenerate clients
   - Check that database schemas exist
   - Verify environment variables are set correctly

3. **TypeScript Compilation Errors**
   - Run `pnpm cloud:typecheck` to identify issues
   - Ensure all dependencies are installed
   - Check that Prisma clients are generated

4. **Test Failures**
   - Ensure PostgreSQL is running and accessible
   - Check that migrations have been applied
   - Verify test environment variables are set

### Debugging Commands

```bash
# Check PostgreSQL status
docker-compose ps postgres

# Check database connectivity
docker-compose exec postgres pg_isready -U speakeasy

# View logs
docker-compose logs postgres

# Reset environment
pnpm cloud:setup

# Run specific service tests
pnpm --filter @speakeasy-services/private-sessions test
```

## Best Practices for Cloud Development

1. **Always run `cloud-setup` first**: This ensures a complete environment
2. **Use `cloud:test` for testing**: This includes proper database setup
3. **Use `cloud:typecheck` for type checking**: This is more comprehensive than the basic typecheck
4. **Monitor background agent logs**: Check for any setup or execution issues
5. **Keep dependencies updated**: Run `pnpm install` when package.json changes

## Integration with CI/CD

The cloud setup scripts can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions step
- name: Setup Cloud Environment
  run: |
    chmod +x scripts/cloud-setup.sh
    ./scripts/cloud-setup.sh

- name: Run Tests
  run: |
    chmod +x scripts/test-cloud.sh
    ./scripts/test-cloud.sh

- name: Type Check
  run: |
    chmod +x scripts/typecheck-cloud.sh
    ./scripts/typecheck-cloud.sh
```

This configuration ensures that Cursor background agents can effectively work on PRs in cloud environments, providing comprehensive error detection and testing capabilities.