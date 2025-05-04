#!/bin/bash

# Exit on error
set -e

echo "Setting up development environment..."

# Setup environment files
echo "Setting up environment files..."
pnpm dev:setup:env

# Start infrastructure
echo "Starting infrastructure..."
pnpm dev:setup:infra

# Setup database
echo "Setting up database..."
pnpm dev:setup:db

# Run migrations
echo "Running migrations..."
pnpm dev:setup:migrations

# Initialize S3
echo "Initializing S3..."
pnpm dev:setup:s3

# Add dev invite code
echo "Adding dev invite code..."
pnpm invite:add dev private-posts true 20

echo
echo "👉 Use the invite code \"dev\" to activate private posts" 
echo

# Setup pgboss
echo "Setting up pgboss..."
(cd packages/queue && pnpm setup:pgboss)

echo "Development setup complete!" 

