#!/bin/bash

# Exit on error
set -e

echo "Setting up cloud development environment for Cursor background agents..."

# Ensure we have the right Node version
if [ -f .nvmrc ]; then
    echo "Using Node version from .nvmrc..."
    nvm use $(cat .nvmrc) || echo "Warning: Could not switch to Node version from .nvmrc"
fi

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << EOF
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
EOF
fi

# Start PostgreSQL
echo "Starting PostgreSQL..."
docker-compose up -d postgres

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until docker-compose exec -T postgres pg_isready -U speakeasy; do
    echo "PostgreSQL is not ready yet, waiting..."
    sleep 2
done

# Setup database schemas and run migrations
echo "Setting up database schemas..."
./scripts/create-schemas.sh

echo "Running migrations..."
./scripts/run-migrations.sh

# Generate Prisma clients
echo "Generating Prisma clients..."
pnpm --filter @speakeasy-services/user-keys prisma:generate
pnpm --filter @speakeasy-services/trusted-users prisma:generate
pnpm --filter @speakeasy-services/private-sessions prisma:generate
pnpm --filter @speakeasy-services/service-admin prisma:generate
pnpm --filter @speakeasy-services/media prisma:generate

# Build all packages
echo "Building all packages..."
pnpm build

# Setup PgBoss
echo "Setting up PgBoss..."
(cd packages/queue && pnpm setup:pgboss)

# Add dev invite code
echo "Adding dev invite code..."
pnpm invite:add dev private-posts true 20

echo "Cloud development environment setup complete!"
echo "PostgreSQL is running on localhost:5496"
echo "Use the invite code 'dev' to activate private posts"