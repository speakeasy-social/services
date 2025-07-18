#!/bin/bash

# Exit on error
set -e

echo "Setting up test environment..."

# Set environment variables for test
export NODE_ENV=test
export POSTGRES_DB=speakeasy_test

# Setup environment files
echo "Setting up environment files..."
pnpm dev:setup:env

# Start infrastructure
echo "Starting infrastructure..."
pnpm dev:setup:infra

# Setup database
echo "Setting up test database..."
pnpm test:setup:db

# Run migrations
echo "Running test migrations..."
pnpm test:setup:migrations

# Initialize S3
echo "Initializing S3..."
pnpm dev:setup:s3

# Setup pgboss
echo "Setting up pgboss..."
(cd packages/queue && NODE_ENV=test pnpm setup:pgboss)

echo "Test environment setup complete!"