#!/bin/bash
set -e

echo "Setting up test database schemas..."

# Use environment variables for database configuration
DB_USER=${DB_USER:-speakeasy}
DB_PASSWORD=${DB_PASSWORD:-speakeasy}
DB_NAME=${DB_NAME_TEST:-speakeasy_test}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT_TEST:-5433}
CONTAINER_NAME="speakeasy-services-postgres-test"

# Ensure test database container is running
if ! docker compose ps $CONTAINER_NAME | grep -q "Up"; then
    echo "Starting test database container..."
    docker compose up -d postgres-test
    echo "Waiting for test database to be ready..."
    sleep 10
fi

# Create schemas for each service
docker compose exec -T $CONTAINER_NAME psql -v ON_ERROR_STOP=1 --username $DB_USER --dbname $DB_NAME <<EOF
-- Drop and create schemas for each service
DROP SCHEMA IF EXISTS user_keys CASCADE;
DROP SCHEMA IF EXISTS private_sessions CASCADE;
DROP SCHEMA IF EXISTS trusted_users CASCADE;
DROP SCHEMA IF EXISTS service_admin CASCADE;
DROP SCHEMA IF EXISTS media CASCADE;
DROP SCHEMA IF EXISTS pgboss CASCADE;

CREATE SCHEMA user_keys;
CREATE SCHEMA private_sessions;
CREATE SCHEMA trusted_users;
CREATE SCHEMA service_admin;
CREATE SCHEMA media;
CREATE SCHEMA pgboss;

-- Grant usage on schemas to the application user
GRANT CREATE, USAGE ON SCHEMA user_keys TO $DB_USER;
GRANT CREATE, USAGE ON SCHEMA private_sessions TO $DB_USER;
GRANT CREATE, USAGE ON SCHEMA trusted_users TO $DB_USER;
GRANT CREATE, USAGE ON SCHEMA service_admin TO $DB_USER;
GRANT CREATE, USAGE ON SCHEMA media TO $DB_USER;
GRANT USAGE ON SCHEMA pgboss TO $DB_USER;
EOF

echo "Test database schemas created successfully"