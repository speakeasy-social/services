#!/bin/bash
set -e

# Run migrations for each service
echo "Running migrations for user-keys service..."
pnpm --filter @speakeasy-services/user-keys prisma:migrate

echo "Running migrations for trusted-users service..."
pnpm --filter @speakeasy-services/trusted-users prisma:migrate

echo "Running migrations for private-sessions service..."
pnpm --filter @speakeasy-services/private-sessions prisma:migrate 

echo "Running migrations for service-admin service..."
pnpm --filter @speakeasy-services/service-admin prisma:migrate 

echo "Running migrations for media service..."
pnpm --filter @speakeasy-services/media prisma:migrate 