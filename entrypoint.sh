#!/bin/bash
set -e

# Configuration
REPO_URL=${CORE_REPO_URL:-"https://github.com/peter-schomburg/Hochciv.git"}
BRANCH=${CORE_REPO_BRANCH:-"main"}
INTERVAL=${UPDATE_INTERVAL_SEC:-3600}

echo "======================================"
echo "Starting Hochciv Multiplayer Server"
echo "======================================"

# Internal function to clone or update
update_frontend() {
  if [ ! -d "public/.git" ]; then
    echo "[Init] Cloning original Hochciv repository ($BRANCH)..."
    git clone -b "$BRANCH" "$REPO_URL" public
    cd public
  else
    echo "[Update] Pulling latest changes from Hochciv repository..."
    cd public
    # Clean previous patches to avoid conflicts before pulling
    git reset --hard HEAD
    git clean -fd
    git pull origin "$BRANCH"
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

  if [ -n "$EXTERNAL_URL" ]; then
    echo "Configuring external URL to: $EXTERNAL_URL"
    sed -i "s|serverUrl: 'http://localhost:3000'|serverUrl: '$EXTERNAL_URL'|g" js/mp.js
  else
    echo "Configuring external URL to relative (same-host)"
    sed -i "s|serverUrl: 'http://localhost:3000'|serverUrl: ''|g" js/mp.js
  fi

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
    git fetch origin "$BRANCH"
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/"$BRANCH")
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
