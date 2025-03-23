#!/bin/bash

# Exit on error
set -e

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

# Create necessary schemas
echo "Creating database schemas..."
PGPASSWORD=speakeasy psql -h localhost -U speakeasy -d speakeasy <<-EOSQL
    -- Create schemas for each service
    CREATE SCHEMA IF NOT EXISTS user_profiles;
    CREATE SCHEMA IF NOT EXISTS private_sessions;
    CREATE SCHEMA IF NOT EXISTS trusted_users;
    CREATE SCHEMA IF NOT EXISTS pgboss;

    -- Grant usage on schemas to the application user
    GRANT USAGE ON SCHEMA user_profiles TO speakeasy;
    GRANT USAGE ON SCHEMA private_sessions TO speakeasy;
    GRANT USAGE ON SCHEMA trusted_users TO speakeasy;
    GRANT USAGE ON SCHEMA pgboss TO speakeasy;
EOSQL

echo "Infrastructure setup complete!"
echo "You can now set up individual services using their setup scripts."
