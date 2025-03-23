#!/bin/bash

# Exit on error
set -e

# Copy .env.example to .env if .env doesn't exist
if [ ! -f .env ]; then
  echo "Creating .env file from .env.example..."
  cp .env.example .env
fi

# Load environment variables
if [ -f .env ]; then
  source .env
fi

# Start Docker services
echo "Starting Docker services..."
docker-compose up -d

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until docker-compose exec -T postgres pg_isready -U speakeasy; do
  sleep 1
done

# Run database migrations for each service
echo "Running database migrations..."
for service in services/*/prisma; do
  if [ -d "$service" ]; then
    service_name=$(basename $(dirname "$service"))
    echo "Running migrations for $service_name..."
    cd $(dirname "$service")/..
    # Ensure the schema exists before running migrations
    PGPASSWORD=speakeasy psql -h localhost -U speakeasy -d speakeasy -c "CREATE SCHEMA IF NOT EXISTS ${service_name//-/_};"
    pnpm prisma migrate deploy
    cd ../../..
  fi
done

# Generate Prisma clients for each service
echo "Generating Prisma clients..."
for service in services/*/prisma; do
  if [ -d "$service" ]; then
    service_name=$(basename $(dirname "$service"))
    echo "Generating client for $service_name..."
    cd $(dirname "$service")/..
    pnpm prisma generate
    cd ../../..
  fi
done

# Install dependencies if needed
echo "Installing dependencies..."
pnpm install

# Build all packages
echo "Building packages..."
pnpm build

echo "Development environment setup complete!"
echo "You can now start the services using: pnpm dev"
