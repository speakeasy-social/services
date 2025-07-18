# Test Environment Setup

This document explains how to set up and use the test environment for the Speakeasy Services application.

## Overview

The application now supports two separate database environments:
- **Development**: Uses `speakeasy` database on port 5496
- **Test**: Uses `speakeasy_test` database on port 5497

This separation ensures that tests can run independently without affecting development data.

## Quick Start

### 1. Setup Test Environment

```bash
# Setup the complete test environment (database, schemas, migrations)
pnpm test:setup
```

This command will:
- Create test environment files (`.env.test`)
- Start the test database container
- Create database schemas
- Run migrations
- Initialize test S3 storage

### 2. Run Tests

```bash
# Run all tests
pnpm test

# Run tests for a specific service
pnpm --filter @speakeasy-services/user-keys test
```

### 3. Cleanup Test Environment

```bash
# Clean up test database and containers
pnpm test:cleanup
```

## Manual Setup Steps

If you prefer to set up the test environment manually:

### 1. Environment Files

```bash
# Create test environment files
pnpm test:setup:env
```

This creates `.env.test` files in the root and each service directory.

### 2. Start Test Infrastructure

```bash
# Start only the test database
pnpm test:setup:infra
```

### 3. Setup Database

```bash
# Create schemas in test database
pnpm test:setup:db

# Run migrations in test database
pnpm test:setup:migrations
```

### 4. Setup S3 (if needed)

```bash
# Initialize test S3 storage
pnpm test:setup:s3
```

## Environment Configuration

### Database URLs

The application automatically constructs database URLs based on `NODE_ENV`:

- **Development** (`NODE_ENV=development`):
  - Host: `localhost:5496`
  - Database: `speakeasy`
  - User: `speakeasy`

- **Test** (`NODE_ENV=test`):
  - Host: `localhost:5497`
  - Database: `speakeasy_test`
  - User: `speakeasy_test`

### Environment Variables

The test environment uses these key variables:

```bash
NODE_ENV=test
LOG_LEVEL=debug

# Database URLs (auto-generated)
DATABASE_URL=postgresql://speakeasy_test:speakeasy_test@localhost:5497/speakeasy_test?schema=pgboss
USER_KEYS_DATABASE_URL=postgresql://speakeasy_test:speakeasy_test@localhost:5497/speakeasy_test?schema=user_keys
# ... other service database URLs

# Test-specific API keys
PRIVATE_SESSIONS_API_KEY=test_private_sessions_key
TRUSTED_USERS_API_KEY=test_trusted_users_key
USER_KEYS_API_KEY=test_user_keys_key
SERVICE_ADMIN_API_KEY=test_service_admin_key

# Test S3 configuration
MEDIA_S3_ENDPOINT=http://localhost:4566
MEDIA_S3_ACCESS_KEY_ID=s3_test_key
MEDIA_S3_SECRET_ACCESS_KEY=s3_test_secret
```

## Docker Services

The test environment uses these Docker services:

### Test Database
- **Service**: `postgres-test`
- **Container**: `speakeasy-services-postgres-test`
- **Port**: `5497`
- **Database**: `speakeasy_test`
- **User**: `speakeasy_test`

### Shared Services
- **LocalStack**: Used for S3 testing (port `4566`)

## Scripts Reference

### Setup Scripts
- `pnpm test:setup` - Complete test environment setup
- `pnpm test:setup:env` - Create test environment files
- `pnpm test:setup:infra` - Start test infrastructure
- `pnpm test:setup:db` - Create database schemas
- `pnpm test:setup:migrations` - Run database migrations
- `pnpm test:setup:s3` - Initialize S3 storage

### Cleanup Scripts
- `pnpm test:cleanup` - Remove test database and containers

### Development Scripts (unchanged)
- `pnpm dev:setup` - Complete development environment setup
- `pnpm dev:setup:db` - Create development database schemas
- `pnpm dev:setup:migrations` - Run development migrations

## Troubleshooting

### Test Database Not Starting
```bash
# Check if container is running
docker compose ps postgres-test

# View logs
docker compose logs postgres-test

# Restart the container
docker compose restart postgres-test
```

### Database Connection Issues
```bash
# Test connection to development database
psql -h localhost -p 5496 -U speakeasy -d speakeasy

# Test connection to test database
psql -h localhost -p 5497 -U speakeasy_test -d speakeasy_test
```

### Environment Variables Not Loading
```bash
# Check if .env.test exists
ls -la .env.test

# Check if NODE_ENV is set correctly
echo $NODE_ENV
```

### Clean Slate
If you need to completely reset the test environment:

```bash
# Stop and remove test containers
docker compose down postgres-test

# Remove test database volume
docker volume rm speakeasy-services_postgres_test_data

# Re-run setup
pnpm test:setup
```

## Best Practices

1. **Always use `NODE_ENV=test`** when running tests
2. **Clean up after tests** using `pnpm test:cleanup`
3. **Don't run tests against development database** - always use the test database
4. **Use test-specific API keys** and configuration
5. **Reset test data** between test runs if needed

## Integration with CI/CD

For continuous integration, you can use:

```bash
# Setup test environment
pnpm test:setup

# Run tests
pnpm test

# Cleanup (optional, as containers will be destroyed anyway)
pnpm test:cleanup
```

The test environment is designed to be completely isolated and can be safely destroyed and recreated without affecting development data.