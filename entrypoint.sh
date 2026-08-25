#!/bin/bash
set -e

# Configuration
# Strip possible \r (CRLF) endings if docker-compose.yml was edited on Windows
RAW_REPO=${CORE_REPO_URL:-"https://github.com/timooom-hash/Hochciv.git"}
REPO_URL=$(echo "$RAW_REPO" | tr -d '\r' | xargs)

RAW_BRANCH=${CORE_REPO_BRANCH:-"main"}
BRANCH=$(echo "$RAW_BRANCH" | tr -d '\r' | xargs)

RAW_INTERVAL=${UPDATE_INTERVAL_SEC:-3600}
INTERVAL=$(echo "$RAW_INTERVAL" | tr -d '\r' | xargs)

echo "======================================"
echo "Starting Hochciv Multiplayer Server"
echo "======================================"

# Internal function to clone or update
update_frontend() {
  if [ ! -d "public/.git" ]; then
    echo "[Init] Cloning original Hochciv repository ($BRANCH)..."
    git clone -b "$BRANCH" "$REPO_URL" public || echo "WARNING: Clone failed! Relying on pre-baked frontend."
    cd public || { echo "ERROR: Could not enter public directory!"; exit 1; }
  else
    echo "[Update] Pulling latest changes from Hochciv repository..."
    cd public
    # Clean previous patches to avoid conflicts before pulling
    git reset --hard HEAD || true
    git clean -fd || true
    git pull origin "$BRANCH" || echo "WARNING: Pull failed! Using local cache."
  fi

  echo "Injecting multiplayer scripts..."
  # Clean previous copies if restarting
  cp ../mp.js js/mp.js
  
  # Inject the script tags right before </body>, only if they don't already exist
  if ! grep -q 'js/mp.js' index.html; then
    sed -i -e '/<\/body>/i \
<script src="https://cdn.socket.io/4.8.0/socket.io.min.js"></script>\
<script src="js/mp.js"></script>\
' index.html
  fi

  echo "Configuring frontend to use relative URLs (same-host)"
  sed -i "s|serverUrl: 'http://localhost:3000'|serverUrl: ''|g" js/mp.js

  cd ..
  echo "[Completed] Frontend integration ready."
}

# 1. Do initial clone/patch before starting the server
update_frontend

# 2. Start the background auto-updater process
(
  while true; do
    sleep "$INTERVAL"
    echo "[Auto-Updater] Checking for updates on original repository..."
    cd public
    git fetch origin "$BRANCH" || echo "WARNING: Auto-update fetch failed."
    LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "LOCAL")
    REMOTE=$(git rev-parse origin/"$BRANCH" 2>/dev/null || echo "REMOTE")
    if [ "$LOCAL" != "$REMOTE" ]; then
      echo "[Auto-Updater] New updates found ($LOCAL -> $REMOTE). Updating..."
      cd ..
      update_frontend
      echo "[Auto-Updater] Update applied successfully."
    else
      echo "[Auto-Updater] Already up to date."
      cd ..
    fi
  done
) &

# 3. Start the Node.js server
echo "Starting Node.js server..."
exec node server.js
