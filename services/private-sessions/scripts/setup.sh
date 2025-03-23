#!/bin/bash

# Exit on error
set -e

# Load environment variables
if [ -f .env ]; then
  source .env
fi

# Run database migrations
echo "Running database migrations..."
pnpm prisma migrate deploy

# Generate Prisma client
echo "Generating Prisma client..."
pnpm prisma generate

# Build the service
echo "Building service..."
pnpm build

echo "Private Sessions service setup complete!"
echo "You can now start the service using: pnpm dev"
