#!/bin/bash

# Exit on error
set -e

# Determine environment (default to development if not specified)
ENV=${NODE_ENV:-development}
echo "Setting up $ENV environment..."

# Setup environment files
echo "Setting up environment files..."
pnpm dev:setup:env

# Start infrastructure
echo "Starting infrastructure..."
pnpm dev:setup:infra

# Setup database
echo "Setting up database..."
NODE_ENV=$ENV pnpm dev:setup:db

# Run migrations
echo "Running migrations..."
NODE_ENV=$ENV pnpm dev:setup:migrations

# Initialize S3
echo "Initializing S3..."
pnpm dev:setup:s3

# Add dev invite code (only for development)
if [ "$ENV" != "test" ]; then
    echo "Adding dev invite code..."
    pnpm invite:add dev private-posts true 20
    echo
    echo "👉 Use the invite code \"dev\" to activate private posts" 
    echo
fi

# Setup pgboss
echo "Setting up pgboss..."
(cd packages/queue && NODE_ENV=$ENV pnpm setup:pgboss)

echo "$ENV setup complete!" 

