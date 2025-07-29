#!/bin/bash
set -e

# Always create both databases
echo "Setting up databases..."

# Create test database if it doesn't exist
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 --username speakeasy --dbname speakeasy <<EOF
SELECT 'CREATE DATABASE speakeasy_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'speakeasy_test')\gexec
EOF

# Determine which database to set up schemas for based on NODE_ENV
if [ "$NODE_ENV" = "test" ]; then
    DB_NAME="speakeasy_test"
    echo "Setting up schemas for test database: $DB_NAME"
else
    DB_NAME="speakeasy"
    echo "Setting up schemas for development database: $DB_NAME"
fi

# Create schemas for each service
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 --username speakeasy --dbname "$DB_NAME" <<EOF
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
