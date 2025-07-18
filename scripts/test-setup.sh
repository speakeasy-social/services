#!/bin/bash
set -e

echo "Setting up test environment..."

# Set NODE_ENV to test for this script
export NODE_ENV=test

# Setup test environment files
echo "Setting up test environment files..."
pnpm test:setup:env

# Start test infrastructure (only test database)
echo "Starting test infrastructure..."
docker compose up -d postgres-test

# Wait for test database to be ready
echo "Waiting for test database to be ready..."
sleep 10

# Setup test database schemas
echo "Setting up test database schemas..."
./scripts/create-schemas-test.sh

# Run migrations for test environment
echo "Running migrations for test environment..."
NODE_ENV=test ./scripts/run-migrations.sh

# Initialize test S3 (if needed)
echo "Initializing test S3..."
NODE_ENV=test ./scripts/init-s3.sh

echo "Test environment setup complete!"