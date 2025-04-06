#!/bin/bash

# Default to running all services if none specified
DEFAULT_SERVICES=("private-sessions" "public-sessions" "user-sessions")
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

# Parse services from environment variable
if [ "$SERVICES" = "all" ]; then
    SERVICES=("${DEFAULT_SERVICES[@]}")
else
    IFS=',' read -ra SERVICES <<< "$SERVICES"
fi

# Start all packages in watch mode
for package in "${PACKAGES[@]}"; do
  echo "Starting $package in watch mode..."
  cd "packages/$package" && pnpm dev &
  PIDS+=($!)
  cd ../..
done

# Start the specified services
for service in "${SERVICES[@]}"; do
  echo "Starting $service..."
  cd "services/$service" && pnpm dev &
  PIDS+=($!)
  cd ../..
done

# Wait for all background processes
wait 