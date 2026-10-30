#!/bin/bash
set -e

echo "======================================"
echo "Starting Hochciv Multiplayer Server"
echo "======================================"

# The game ships with this repository (HochCiv/, HochCiv-v96/, HochCiv-v93/, HochCiv-v83/). public/ is built from it –
# again at every start, so a mounted HochCiv/ (docker-compose.local.yml) is picked up by a
# restart. No download, no git.
node scripts/build-public.js

echo "Starting Node.js server..."
exec node server.js
