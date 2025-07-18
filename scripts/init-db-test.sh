#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create the test database user if it doesn't exist
    CREATE USER speakeasy_test WITH PASSWORD 'speakeasy_test';
    
    -- Grant necessary privileges
    GRANT ALL PRIVILEGES ON DATABASE speakeasy_test TO speakeasy_test;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO speakeasy_test;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO speakeasy_test;
    GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO speakeasy_test;
    
    -- Grant future privileges
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO speakeasy_test;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO speakeasy_test;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO speakeasy_test;
EOSQL