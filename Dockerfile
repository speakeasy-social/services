# Use Node.js 22 as the base image
FROM node:22-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate

# Set working directory
WORKDIR /app

# Copy all files first
COPY . .

# Install dependencies
RUN pnpm install --frozen-lockfile

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