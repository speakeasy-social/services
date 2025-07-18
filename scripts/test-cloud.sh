#!/bin/bash

# Exit on error
set -e

echo "Running tests in cloud environment..."

# Ensure PostgreSQL is running
if ! docker-compose ps postgres | grep -q "Up"; then
    echo "Starting PostgreSQL..."
    docker-compose up -d postgres
    
    # Wait for PostgreSQL to be ready
    echo "Waiting for PostgreSQL to be ready..."
    until docker-compose exec -T postgres pg_isready -U speakeasy; do
        echo "PostgreSQL is not ready yet, waiting..."
        sleep 2
    done
fi

# Ensure database schemas are set up
echo "Ensuring database schemas are set up..."
./scripts/create-schemas.sh

# Run migrations to ensure schema is up to date
echo "Running migrations..."
./scripts/run-migrations.sh

# Generate Prisma clients
echo "Generating Prisma clients..."
pnpm --filter @speakeasy-services/user-keys prisma:generate
pnpm --filter @speakeasy-services/trusted-users prisma:generate
pnpm --filter @speakeasy-services/private-sessions prisma:generate
pnpm --filter @speakeasy-services/service-admin prisma:generate
pnpm --filter @speakeasy-services/media prisma:generate

# Build packages
echo "Building packages..."
pnpm build

# Run tests with increased timeout for cloud environments
echo "Running tests..."
NODE_ENV=test pnpm test --testTimeout=60000

echo "Tests completed successfully!"