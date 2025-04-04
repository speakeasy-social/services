#!/bin/bash

# Exit on error
set -e

# Store the root directory
ROOT_DIR=$(pwd)

# Copy .env.example to .env if .env doesn't exist
if [ ! -f .env ]; then
  echo "Creating .env file from .env.example..."
  cp .env.example .env
fi

# Load and export environment variables
if [ -f .env ]; then
  echo "Loading environment variables..."
  export $(grep -v '^#' .env | xargs)
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
    
    # Create schema
    docker-compose exec -T postgres psql -U speakeasy -d speakeasy -c "CREATE SCHEMA IF NOT EXISTS ${service_name//-/_};"
    
    # Run migrations from the service directory
    cd "$ROOT_DIR/services/$service_name"
    echo "Running migrations in $(pwd)"
    pnpm prisma migrate deploy
    cd "$ROOT_DIR"
  fi
done

# Generate Prisma clients for each service
echo "Generating Prisma clients..."
for service in services/*/prisma; do
  if [ -d "$service" ]; then
    service_name=$(basename $(dirname "$service"))
    echo "Generating client for $service_name..."
    cd "$ROOT_DIR/services/$service_name"
    echo "Generating Prisma client in $(pwd)"
    pnpm prisma generate
    cd "$ROOT_DIR"
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
