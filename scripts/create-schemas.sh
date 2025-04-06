#!/bin/bash
set -e

# Create schemas for each service
docker-compose exec -T postgres psql -v ON_ERROR_STOP=1 --username speakeasy --dbname speakeasy <<EOF
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
EOF
