# Cursor Background Agents Quick Reference

## Available Agents

| Agent | Command | Purpose |
|-------|---------|---------|
| `install` | `pnpm install` | Install dependencies |
| `postgres` | `docker-compose up -d postgres` | Start PostgreSQL |
| `cloud-setup` | `pnpm cloud:setup` | Complete environment setup |
| `build` | `pnpm build` | Build all packages |
| `typecheck` | `pnpm cloud:typecheck` | Comprehensive type checking |
| `lint` | `pnpm lint` | Run ESLint |
| `test` | `pnpm cloud:test` | Run tests with DB |
| `dev` | `pnpm dev` | Start dev environment |

## Quick Start for PRs

1. **Initial Setup**: Run `cloud-setup` agent
2. **Type Checking**: Run `typecheck` agent to catch errors
3. **Testing**: Run `test` agent to validate changes
4. **Linting**: Run `lint` agent for code quality

## Database Setup

- PostgreSQL runs on `localhost:5496`
- Database: `speakeasy`
- User: `speakeasy`
- Password: `speakeasy`

## Environment

- Node version: See `.nvmrc`
- Package manager: pnpm
- Database: PostgreSQL with Docker
- Testing: Jest with TypeScript

## Troubleshooting

- If PostgreSQL fails: Run `postgres` agent first
- If types fail: Run `cloud-setup` then `typecheck`
- If tests fail: Run `cloud-setup` then `test`