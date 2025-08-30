#!/bin/bash
set -e

# Always create both databases
echo "Setting up databases..."

# Determine PostgreSQL connection method
if [ "$CI" = "true" ] || [ "$USE_DIRECT_PSQL" = "true" ]; then
    # In CI or when explicitly requested, use direct psql connection
    PSQL_CMD="PGPASSWORD=speakeasy psql -h localhost -p 5496 -U speakeasy"
    echo "Using direct psql connection"
else
    # In local development, use docker compose exec
    PSQL_CMD="docker compose exec -T postgres psql -v ON_ERROR_STOP=1 --username speakeasy"
    echo "Using docker compose exec"
fi

# Create test database if it doesn't exist
if [ "$CI" = "true" ] || [ "$USE_DIRECT_PSQL" = "true" ]; then
    $PSQL_CMD -d speakeasy <<EOF
SELECT 'CREATE DATABASE speakeasy_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'speakeasy_test')\gexec
EOF
else
    $PSQL_CMD --dbname speakeasy <<EOF
SELECT 'CREATE DATABASE speakeasy_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'speakeasy_test')\gexec
EOF
fi

# Determine which database to set up schemas for based on NODE_ENV
if [ "$NODE_ENV" = "test" ]; then
    DB_NAME="speakeasy_test"
    echo "Setting up schemas for test database: $DB_NAME"
else
    DB_NAME="speakeasy"
    echo "Setting up schemas for development database: $DB_NAME"
fi

# Create schemas for each service
if [ "$CI" = "true" ] || [ "$USE_DIRECT_PSQL" = "true" ]; then
    $PSQL_CMD -d "$DB_NAME" <<EOF
else
    $PSQL_CMD --dbname "$DB_NAME" <<EOF
fi
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
GRANT CREATE, USAGE ON SCHEMA user_keys TO speakeasy;
GRANT CREATE, USAGE ON SCHEMA private_sessions TO speakeasy;
GRANT CREATE, USAGE ON SCHEMA trusted_users TO speakeasy;
GRANT CREATE, USAGE ON SCHEMA service_admin TO speakeasy;
GRANT CREATE, USAGE ON SCHEMA media TO speakeasy;
GRANT USAGE ON SCHEMA pgboss TO speakeasy;
EOF
