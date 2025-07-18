#!/bin/bash

# Exit on error
set -e

echo "Running TypeScript type checking in cloud environment..."

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    pnpm install
fi

# Generate Prisma clients first
echo "Generating Prisma clients..."
pnpm --filter @speakeasy-services/user-keys prisma:generate
pnpm --filter @speakeasy-services/trusted-users prisma:generate
pnpm --filter @speakeasy-services/private-sessions prisma:generate
pnpm --filter @speakeasy-services/service-admin prisma:generate
pnpm --filter @speakeasy-services/media prisma:generate

# Run type checking across all packages and services
echo "Running TypeScript type checking..."

# Check packages
echo "Checking packages..."
pnpm --filter @speakeasy-services/common typecheck
pnpm --filter @speakeasy-services/crypto typecheck
pnpm --filter @speakeasy-services/queue typecheck
pnpm --filter @speakeasy-services/service-base typecheck
pnpm --filter @speakeasy-services/test-utils typecheck

# Check services
echo "Checking services..."
pnpm --filter @speakeasy-services/user-keys typecheck
pnpm --filter @speakeasy-services/trusted-users typecheck
pnpm --filter @speakeasy-services/private-sessions typecheck
pnpm --filter @speakeasy-services/service-admin typecheck
pnpm --filter @speakeasy-services/media typecheck

# Run root typecheck
echo "Running root typecheck..."
pnpm typecheck

echo "TypeScript type checking completed successfully!"