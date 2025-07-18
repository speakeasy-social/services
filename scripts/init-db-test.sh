#!/bin/bash
set -e

# Use environment variables for database configuration
DB_USER=${DB_USER:-speakeasy}
DB_PASSWORD=${DB_PASSWORD:-speakeasy}
DB_NAME=${DB_NAME_TEST:-speakeasy_test}

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create the test database user if it doesn't exist
    CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
    
    -- Create the test database if it doesn't exist
    CREATE DATABASE $DB_NAME OWNER $DB_USER;
    
    -- Grant necessary privileges
    GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
    GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO $DB_USER;
    
    -- Grant future privileges
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO $DB_USER;
EOSQL