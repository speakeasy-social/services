#!/bin/bash
set -e

# Determine environment
ENVIRONMENT=${NODE_ENV:-development}
echo "Running migrations for environment: $ENVIRONMENT"

# Use environment variables for database configuration
DB_USER=${DB_USER:-speakeasy}
DB_PASSWORD=${DB_PASSWORD:-speakeasy}
DB_HOST=${DB_HOST:-localhost}

if [ "$ENVIRONMENT" = "test" ]; then
    # Test environment configuration
    DB_NAME=${DB_NAME_TEST:-speakeasy_test}
    DB_PORT=${DB_PORT_TEST:-5433}
    CONTAINER_NAME="speakeasy-services-postgres-test"
else
    # Development environment configuration
    DB_NAME=${DB_NAME:-speakeasy}
    DB_PORT=${DB_PORT:-5432}
    CONTAINER_NAME="speakeasy-services-postgres"
fi

# Run migrations for each service
echo "Running migrations for user-keys service..."
(cd services/user-keys && NODE_ENV=$ENVIRONMENT pnpm prisma migrate deploy)

echo "Running migrations for private-sessions service..."
(cd services/private-sessions && NODE_ENV=$ENVIRONMENT pnpm prisma migrate deploy)

echo "Running migrations for trusted-users service..."
(cd services/trusted-users && NODE_ENV=$ENVIRONMENT pnpm prisma migrate deploy)

echo "Running migrations for service-admin service..."
(cd services/service-admin && NODE_ENV=$ENVIRONMENT pnpm prisma migrate deploy)

echo "Running migrations for media service..."
(cd services/media && NODE_ENV=$ENVIRONMENT pnpm prisma migrate deploy)

echo "Migrations completed successfully for $ENVIRONMENT environment" 