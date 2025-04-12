# Use Node.js 22 as the base image
FROM node:22-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY packages/common/package.json ./packages/common/
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/queue/package.json ./packages/queue/
COPY packages/service-base/package.json ./packages/service-base/
COPY services/private-sessions/package.json ./services/private-sessions/
COPY services/trusted-users/package.json ./services/trusted-users/
COPY services/user-keys/package.json ./services/user-keys/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the code
COPY . .

# Build all services
RUN pnpm build

# Create a production image
FROM node:22-alpine AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate

# Set working directory
WORKDIR /app

# Copy built files from base image
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/services ./services
COPY --from=base /app/package.json .
COPY --from=base /app/pnpm-lock.yaml .

# Set environment variables
ENV NODE_ENV=production

# The service to run will be determined by the SERVICE_NAME environment variable
CMD ["sh", "-c", "cd services/${SERVICE_NAME} && node dist/api.js"] 