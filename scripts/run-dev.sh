#!/bin/bash

# Ensure we're in the project root
cd "$(dirname "$0")/.."

# Default to running all services if none specified
DEFAULT_SERVICES=("private-sessions" "trusted-users" "user-keys")
PACKAGES=("service-base" "queue" "common" "crypto")

# Store PIDs of background processes
declare -a PIDS

# Function to cleanup background processes
cleanup() {
    echo "Shutting down all processes..."
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
        fi
    done
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Parse command line arguments
SERVICES="all"
while [[ $# -gt 0 ]]; do
  case $1 in
    --services=*)
      SERVICES="${1#*=}"
      shift
      ;;
    --)
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      shift
      ;;
  esac
done

# Parse services
if [ "$SERVICES" = "all" ]; then
    SERVICES=("${DEFAULT_SERVICES[@]}")
else
    IFS=',' read -ra SERVICES <<< "$SERVICES"
fi

for package in "${PACKAGES[@]}"; do
  echo "Starting $package in watch mode..."
  (cd "packages/$package" && pnpm dev) &
  PIDS+=($!)
done

# Start only the specified services
for service in "${SERVICES[@]}"; do
  echo "Starting $service..."
  (cd "services/$service" && pnpm dev) &
  PIDS+=($!)
done

# Wait for all background processes
wait 