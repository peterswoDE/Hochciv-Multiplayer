#!/bin/bash
set -e

echo "======================================"
echo "Starting Hochciv Multiplayer Server"
echo "======================================"

# The game ships with this repository (HochCiv/, HochCiv-v109/, HochCiv-v108/, HochCiv-v107/, HochCiv-v106/, HochCiv-v100/, HochCiv-v98/). public/ is built from it –
# again at every start, so a mounted HochCiv/ (docker-compose.local.yml) is picked up by a
# restart. No download, no git.
node scripts/build-public.js

# Database migrations, as the owner role (MIGRATION_DATABASE_URL). The server itself only gets the
# app role, which can read and write rows but not change the schema – and never sees the owner's
# password (docs/reference/database.md).
node scripts/migrate.js

echo "Starting Node.js server..."
exec env -u MIGRATION_DATABASE_URL node server.js
