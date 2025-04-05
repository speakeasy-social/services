#!/bin/bash

# Exit on error
set -e

# Parse arguments
SCRIPT="dev:api"
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --fail-fast) SCRIPT="dev:api:debug"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
done

# Load environment variables
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    exit 1
fi

# Export environment variables
set -a
source .env
# Map service-specific database URL to generic one
export DATABASE_URL="$PRIVATE_SESSIONS_DATABASE_URL"
set +a

# Change to service directory and run
cd services/private-sessions
pnpm $SCRIPT 