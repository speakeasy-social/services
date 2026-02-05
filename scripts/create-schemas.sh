#!/bin/bash
set -e

# Always create both databases
echo "Setting up databases..."

# Determine PostgreSQL connection method and database flag
if [ "$CI" = "true" ] || [ "$USE_DIRECT_PSQL" = "true" ]; then
    # In CI or when explicitly requested, use direct psql connection
    export PGPASSWORD=speakeasy
    PSQL_CMD="psql -h localhost -p 5496 -U speakeasy"
    DB_FLAG="-d"
    echo "Using direct psql connection"
else
    # In local development, use docker compose exec
    PSQL_CMD="docker compose exec -T postgres psql -v ON_ERROR_STOP=1 --username speakeasy"
    DB_FLAG="--dbname"
    echo "Using docker compose exec"
fi

# Function to execute SQL
execute_sql() {
    local database=$1
    local sql=$2
    $PSQL_CMD $DB_FLAG "$database" <<EOF
$sql
EOF
}

# Create test database if it doesn't exist
execute_sql "speakeasy" "SELECT 'CREATE DATABASE speakeasy_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'speakeasy_test')\gexec"

# Determine which database to set up schemas for based on NODE_ENV
if [ "$NODE_ENV" = "test" ]; then
    DB_NAME="speakeasy_test"
    echo "Setting up schemas for test database: $DB_NAME"
else
    DB_NAME="speakeasy"
    echo "Setting up schemas for development database: $DB_NAME"
fi

# Define schema setup SQL
SCHEMA_SQL="-- Create uuid extension
CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";

-- Drop and create schemas for each service
DROP SCHEMA IF EXISTS user_keys CASCADE;
DROP SCHEMA IF EXISTS private_sessions CASCADE;
DROP SCHEMA IF EXISTS trusted_users CASCADE;
DROP SCHEMA IF EXISTS service_admin CASCADE;
DROP SCHEMA IF EXISTS media CASCADE;
DROP SCHEMA IF EXISTS private_profiles CASCADE;
DROP SCHEMA IF EXISTS pgboss CASCADE;

CREATE SCHEMA user_keys;
CREATE SCHEMA private_sessions;
CREATE SCHEMA trusted_users;
CREATE SCHEMA service_admin;
CREATE SCHEMA media;
CREATE SCHEMA private_profiles;
CREATE SCHEMA pgboss;

-- Grant usage on schemas to the application user
GRANT CREATE, USAGE ON SCHEMA user_keys TO speakeasy;
GRANT CREATE, USAGE ON SCHEMA private_sessions TO speakeasy;
GRANT CREATE, USAGE ON SCHEMA trusted_users TO speakeasy;
GRANT CREATE, USAGE ON SCHEMA service_admin TO speakeasy;
GRANT CREATE, USAGE ON SCHEMA media TO speakeasy;
GRANT CREATE, USAGE ON SCHEMA private_profiles TO speakeasy;
GRANT USAGE ON SCHEMA pgboss TO speakeasy;"

# Create schemas for each service
execute_sql "$DB_NAME" "$SCHEMA_SQL"
