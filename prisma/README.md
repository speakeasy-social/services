# Database Migrations

This directory contains the database schema and migrations for the Speakeasy Services project.

## Development Environment

For local development, you can use the following commands:

```bash
# Reset database (DEVELOPMENT ONLY!)
# This will delete all data and reapply migrations
npx prisma migrate reset

# Create a new migration after schema changes
npx prisma migrate dev --name descriptive_name

# Apply any pending migrations
npx prisma migrate deploy

# Check migration status
npx prisma migrate status
```

## Production Environment

For production deployments, follow these steps in order:

```bash
# 1. Backup the database (adjust connection string as needed)
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Check what migrations will be run
npx prisma migrate status

# 3. Deploy migrations with extended timeout
DATABASE_MIGRATION_LOCK_TIMEOUT=300 npx prisma migrate deploy

# 4. Verify migration status
npx prisma migrate status
```

## Important Safety Notes

1. ⚠️ Never use `prisma migrate reset` in production
2. Use `migrate deploy` in production, not `migrate dev`
3. Set appropriate lock timeouts for production migrations
4. Always check migration status before and after deployment
5. Test migrations in development/staging before production

## Schema Organization

The schema is organized into several core models:

- `UserKey`: Stores user encryption keys
- `Session`: Manages encryption sessions
- `SessionKey`: Stores per-recipient encrypted DEKs
- `StaffKey`: Stores unencrypted DEKs for staff access
- `EncryptedMessage`: Stores the encrypted content
- `TrustedUser`: Manages trust relationships

## Indexes

The schema includes optimized indexes for common query patterns:

- Retrieving trusted users for an author
- Retrieving messages by author and timestamp
- Retrieving messages by session
- Retrieving session keys by recipient
- Timeline queries for messages a recipient can access

## Development Workflow

1. Make changes to `schema.prisma`
2. Run `npx prisma migrate dev --name descriptive_name`
3. Commit both the schema changes and the generated migration
4. Test the changes thoroughly in development

## Troubleshooting

If you encounter migration issues:

1. Check the migration status: `npx prisma migrate status`
2. Review the migration history in `migrations` directory
3. In development, you can reset if needed: `npx prisma migrate reset`
4. For production issues, restore from backup if necessary
