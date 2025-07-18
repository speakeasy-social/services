#!/bin/bash
set -e

# Determine environment
ENVIRONMENT=${NODE_ENV:-development}
echo "Running migrations for environment: $ENVIRONMENT"

if [ "$ENVIRONMENT" = "test" ]; then
    # Test environment configuration
    DB_USER="speakeasy_test"
    DB_PASSWORD="speakeasy_test"
    DB_NAME="speakeasy_test"
    DB_HOST="localhost"
    DB_PORT="5497"
    CONTAINER_NAME="speakeasy-services-postgres-test"
else
    # Development environment configuration
    DB_USER="speakeasy"
    DB_PASSWORD="speakeasy"
    DB_NAME="speakeasy"
    DB_HOST="localhost"
    DB_PORT="5496"
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