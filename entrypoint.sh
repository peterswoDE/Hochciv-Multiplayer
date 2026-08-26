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
    if ! run_cmd_with_retries "git clone -b \"$BRANCH\" \"$REPO_URL\" public"; then
      echo "[Error] Initial git clone failed after retries."
      return 1
    fi
    cd public
  else
    echo "[Update] Pulling latest changes from Hochciv repository..."
    cd public
    # Clean previous patches to avoid conflicts before pulling
    git reset --hard HEAD
    git clean -fd
    if ! run_cmd_with_retries "git pull origin \"$BRANCH\""; then
      echo "[Error] git pull failed after retries."
      return 1
    fi
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

# Helper: run a shell command with retries and exponential backoff
run_cmd_with_retries() {
  local cmd="$1"
  local max_retries=5
  local attempt=0
  local delay=2

  while [ $attempt -lt $max_retries ]; do
    # shellcheck disable=SC2091
    eval "$cmd" && return 0
    attempt=$((attempt + 1))
    echo "[Retry] Command failed (attempt $attempt/$max_retries). Retrying in $delay seconds..."
    sleep $delay
    delay=$((delay * 2))
  done

  return 1
}

# 1. Do initial clone/patch before starting the server (don't exit the script on failure)
if ! update_frontend; then
  echo "[Warning] Initial clone/update failed; continuing. Auto-updater will retry periodically."
fi

# 2. Start the background auto-updater process
(
  while true; do
    sleep "$INTERVAL"
    echo "[Auto-Updater] Checking for updates on original repository..."
    if [ -d "public/.git" ]; then
      cd public
      if run_cmd_with_retries "git fetch origin \"$BRANCH\""; then
        LOCAL=$(git rev-parse HEAD || echo "")
        REMOTE=$(git rev-parse origin/"$BRANCH" || echo "")
        if [ -n "$LOCAL" ] && [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
          echo "[Auto-Updater] New updates found ($LOCAL -> $REMOTE). Updating..."
          cd ..
          if update_frontend; then
            echo "[Auto-Updater] Update applied successfully."
          else
            echo "[Auto-Updater] update_frontend failed; will retry later."
          fi
        else
          echo "[Auto-Updater] Already up to date."
          cd ..
        fi
      else
        echo "[Auto-Updater] git fetch failed; will retry later."
        cd ..
      fi
    else
      echo "[Auto-Updater] public/.git missing; attempting initial clone..."
      if update_frontend; then
        echo "[Auto-Updater] Initial clone applied successfully."
      else
        echo "[Auto-Updater] Initial clone failed; will retry later."
      fi
    fi
  done
) &

# 3. Start the Node.js server
echo "Starting Node.js server..."
exec node server.js
