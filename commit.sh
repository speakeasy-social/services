#!/usr/bin/env sh
# Commit script for private-profiles feature work
# Groups changes by feature/vertical slice

set -e

echo "Creating commits..."

# 1. Infrastructure: Database schema and migration scripts
git add scripts/create-schemas.sh scripts/run-migrations.sh
git commit -m "$(cat <<'EOF'
Add private-profiles to database schema setup

- Add private_profiles schema creation in create-schemas.sh
- Add uuid-ossp extension to public schema for shared use
- Add private-profiles migration to run-migrations.sh
EOF
)"

# 2. Shared session-management: Configuration options
git add packages/session-management/src/session.service.ts packages/session-management/src/worker.ts
git commit -m "$(cat <<'EOF'
Extend session expiration and job handler flexibility

- Increase session expiration from 1 week to 2 years
- Increase new trusted user backfill window to 2 years
- Add usePrefixedJobNames option to SessionJobHandlers for backward compatibility with unprefixed job names
EOF
)"

# 3. private-profiles: Core API implementation (routes, services, lexicon)
git add services/private-profiles/src/lexicon/index.ts services/private-profiles/src/lexicon/types/profile.ts
git add services/private-profiles/src/routes/profile.routes.ts services/private-profiles/src/services/profile.service.ts services/private-profiles/src/services/session.service.ts
git commit -m "$(cat <<'EOF'
Implement private-profiles API with access control

Add endpoints:
- getProfile: Get single profile with session key for caller
- getProfiles: Batch fetch multiple profiles with access control
- putProfile: Create/update private profile
- deleteProfile: Delete caller's private profile

Service layer enforces access control via session keys - only users with
valid session keys can retrieve profiles. Uses shared SessionService for
session management.
EOF
)"

# 4. private-profiles: Worker integration
git add services/private-profiles/src/worker.ts
git commit -m "$(cat <<'EOF'
Integrate shared session job handlers in private-profiles worker

Replace local job handler implementations with shared SessionJobHandlers
from session-management package. Includes prefixed job names for isolation.
EOF
)"

# 5. private-sessions: Migrate to shared session management
git add services/private-sessions/src/routes/privatePosts.routes.ts services/private-sessions/src/services/session.service.ts services/private-sessions/src/worker.ts services/private-sessions/src/views/private-sessions.views.ts
git commit -m "$(cat <<'EOF'
Migrate private-sessions to shared session management

- Import session key views from @speakeasy-services/session-management
- Use shared SessionJobHandlers in worker with prefixed job names
- Remove local private-sessions.views.ts (now using shared)
- Add documentation for Prisma client type cast
EOF
)"

# 6. Database migrations: UUID extension fix
git add services/private-sessions/prisma/migrations/20240321000000_initial_schema/migration.sql
git commit -m "$(cat <<'EOF'
Fix private-sessions migration for shared uuid-ossp extension

Create uuid-ossp extension in public schema instead of default schema.
This allows the extension to be shared across multiple service schemas.
EOF
)"

# 7. private-profiles: Package configuration and dependencies
git add services/private-profiles/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
Update private-profiles package dependencies

Add dependencies for session-management integration and testing.
EOF
)"

# 8. Cleanup: Remove unused files
git rm services/private-profiles/src/lexicon/types/media.ts services/private-profiles/src/lexicon/types/notifications.ts services/private-profiles/src/lexicon/types/posts.ts services/private-profiles/src/lexicon/types/reactions.ts services/private-profiles/src/lexicon/types/session.ts
git rm services/private-profiles/src/views/private-sessions.views.ts services/trusted-users/src/worker.ts
git rm CI.log.txt
git commit -m "$(cat <<'EOF'
Remove unused lexicon types, views, and worker files

Clean up files that are no longer needed after migrating to shared
session-management infrastructure.
EOF
)"

# 9. New files: Test infrastructure and server
git add services/private-profiles/.env.test services/private-profiles/vitest.config.ts services/private-profiles/src/server.ts services/private-profiles/src/views/profile.views.ts services/private-profiles/tests/
git add services/private-profiles/prisma/migrations/
git commit -m "$(cat <<'EOF'
Add private-profiles test infrastructure and server setup

- Add vitest configuration and test environment
- Add standalone server entry point
- Add profile view transformers for API responses
- Add initial test suite
- Add Prisma migrations for private-profiles schema
EOF
)"

# 10. trusted-users: Package configuration
git add services/trusted-users/package.json services/trusted-users/src/services/trust.service.ts
git commit -m "$(cat <<'EOF'
Update trusted-users package configuration

Remove worker dependency as service now uses shared session-management.
EOF
)"

echo "All commits created successfully!"
