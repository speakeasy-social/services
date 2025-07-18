#!/bin/bash
set -e

# This script runs when the PostgreSQL container starts
# It sets up the initial database structure

echo "Initializing database..."

# Create the database if it doesn't exist (PostgreSQL will create it automatically)
# The schemas will be created by the create-schemas.sh script

echo "Database initialization complete!"