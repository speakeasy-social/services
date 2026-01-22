#!/bin/bash
set -e

# Determine database name based on NODE_ENV
if [ "$NODE_ENV" = "test" ]; then
    DB_NAME="speakeasy_test"
    echo "Running migrations for test database: $DB_NAME"
else
    DB_NAME="speakeasy"
    echo "Running migrations for development database: $DB_NAME"
fi

# Set database URLs for each service based on environment
export USER_KEYS_DATABASE_URL="postgresql://speakeasy:speakeasy@localhost:5496/${DB_NAME}?schema=user_keys"
export TRUSTED_USERS_DATABASE_URL="postgresql://speakeasy:speakeasy@localhost:5496/${DB_NAME}?schema=trusted_users"
export PRIVATE_SESSIONS_DATABASE_URL="postgresql://speakeasy:speakeasy@localhost:5496/${DB_NAME}?schema=private_sessions"
export PRIVATE_PROFILES_DATABASE_URL="postgresql://speakeasy:speakeasy@localhost:5496/${DB_NAME}?schema=private_profiles"
export SERVICE_ADMIN_DATABASE_URL="postgresql://speakeasy:speakeasy@localhost:5496/${DB_NAME}?schema=service_admin"
export MEDIA_DATABASE_URL="postgresql://speakeasy:speakeasy@localhost:5496/${DB_NAME}?schema=media"
export DATABASE_URL="postgresql://speakeasy:speakeasy@localhost:5496/${DB_NAME}?schema=pgboss"

# Run migrations for each service
echo "Running migrations for user-keys service..."
pnpm --filter @speakeasy-services/user-keys prisma:migrate

echo "Running migrations for trusted-users service..."
pnpm --filter @speakeasy-services/trusted-users prisma:migrate

echo "Running migrations for private-sessions service..."
pnpm --filter @speakeasy-services/private-sessions prisma:migrate

echo "Running migrations for private-profiles service..."
pnpm --filter @speakeasy-services/private-profiles prisma:migrate

echo "Running migrations for service-admin service..."
pnpm --filter @speakeasy-services/service-admin prisma:migrate

echo "Running migrations for media service..."
pnpm --filter @speakeasy-services/media prisma:migrate