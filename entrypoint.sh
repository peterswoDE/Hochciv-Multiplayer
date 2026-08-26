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

# Network diagnostic helpers
resolve_host() {
  local target="$1"
  if command -v timeout >/dev/null 2>&1; then
    timeout 2 bash -c "getent ahosts '$target' >/dev/null 2>&1 || nslookup '$target' >/dev/null 2>&1 || host '$target' >/dev/null 2>&1" && return 0
  else
    (getent ahosts "$target" >/dev/null 2>&1 || nslookup "$target" >/dev/null 2>&1 || host "$target" >/dev/null 2>&1) && return 0
  fi
  return 1
}

ping_host() {
  local target="$1"
  if ! command -v ping >/dev/null 2>&1; then
    return 2
  fi
  if command -v timeout >/dev/null 2>&1; then
    timeout 2 ping -c 1 -W 2 "$target" >/dev/null 2>&1 && return 0
    timeout 2 ping -n 1 -w 2000 "$target" >/dev/null 2>&1 && return 0
  else
    ping -c 1 -W 2 "$target" >/dev/null 2>&1 && return 0
    ping -n 1 -w 2000 "$target" >/dev/null 2>&1 && return 0
  fi
  return 1
}

probe_https() {
  local target="$1"
  if curl -fsSI --connect-timeout 3 --max-time 5 "https://$target" >/dev/null 2>&1; then
    return 0
  fi
  if curl -k -fsSI --connect-timeout 3 --max-time 5 "https://$target" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

# Test and log internet connectivity (Ping, DNS, HTTPS)
test_internet_connection() {
  echo "--- Network Connectivity & Diagnostics ---"
  local domain
  domain=$(echo "$REPO_URL" | sed -e 's|^[^/]*//||' -e 's|/.*$||' -e 's|:.*$||')
  [ -z "$domain" ] && domain="github.com"

  # Print routing summary
  if command -v ip >/dev/null 2>&1; then
    local def_route
    def_route=$(ip route show default 2>/dev/null || echo "unknown")
    echo "[Network] Default gateway route: $def_route"
  fi

  # 1. ICMP Ping Test to public IP
  echo "[Ping] Testing ICMP ping to 1.1.1.1..."
  if ping_host 1.1.1.1; then
    echo "[Ping] -> SUCCESS (1.1.1.1 reachable)"
  elif ping_host 8.8.8.8; then
    echo "[Ping] -> SUCCESS (8.8.8.8 reachable)"
  else
    echo "[Ping] -> FAILED (ICMP blocked, dropped, or default gateway has no WAN route)"
  fi

  # 2. DNS Resolution Test
  echo "[DNS] Testing domain resolution for '$domain'..."
  if resolve_host "$domain"; then
    echo "[DNS] -> SUCCESS ($domain resolved)"
  else
    echo "[DNS] -> FAILED (Could not resolve $domain)"
  fi

  # 3. Target Host Ping
  echo "[Ping] Testing ping to '$domain'..."
  if ping_host "$domain"; then
    echo "[Ping] -> SUCCESS ($domain responded to ping)"
  else
    echo "[Ping] -> FAILED / BLOCKED"
  fi

  # 4. HTTPS Handshake Probe
  echo "[HTTPS] Probing https://$domain..."
  if probe_https "$domain"; then
    echo "[HTTPS] -> SUCCESS (Internet connection confirmed)"
  else
    echo "[HTTPS] -> FAILED / TIMEOUT"
  fi
  echo "------------------------------------------"
}

# Run connectivity test on container start
test_internet_connection

# Ensure DNS resolution works inside container
ensure_dns() {
  local domain
  domain=$(echo "$REPO_URL" | sed -e 's|^[^/]*//||' -e 's|/.*$||' -e 's|:.*$||')
  [ -z "$domain" ] && domain="github.com"

  # Quick check if domain resolves
  if resolve_host "$domain" || ping_host "$domain"; then
    return 0
  fi

  echo "[DNS] Warning: Could not resolve '$domain'. Attempting automatic DNS recovery..."

  # 1. Try adding Docker default and standard DNS servers to /etc/resolv.conf if writable
  if [ -w /etc/resolv.conf ]; then
    local default_gw
    default_gw=$(ip route show default 2>/dev/null | awk '{print $3}' | head -n1)
    for ns in "127.0.0.11" "$default_gw" "1.1.1.1" "8.8.8.8" "9.9.9.9"; do
      if [ -n "$ns" ] && ! grep -q "$ns" /etc/resolv.conf 2>/dev/null; then
        echo "nameserver $ns" >> /etc/resolv.conf 2>/dev/null || true
      fi
    done
  fi

  if getent ahosts "$domain" >/dev/null 2>&1; then
    echo "[DNS] Successfully restored DNS resolution for '$domain'."
    return 0
  fi

  # 2. If standard DNS is blocked (e.g. UDP port 53 filtered), add static IP fallback for GitHub
  if [[ "$domain" == *"github.com"* ]] && [ -w /etc/hosts ]; then
    echo "[DNS] Standard DNS unreachable. Adding static GitHub fallback IPs to /etc/hosts..."
    grep -q "github.com" /etc/hosts 2>/dev/null || echo "140.82.121.3 github.com" >> /etc/hosts 2>/dev/null || true
    grep -q "codeload.github.com" /etc/hosts 2>/dev/null || echo "140.82.121.10 codeload.github.com" >> /etc/hosts 2>/dev/null || true
    grep -q "api.github.com" /etc/hosts 2>/dev/null || echo "140.82.121.6 api.github.com" >> /etc/hosts 2>/dev/null || true
  fi

  return 0
}

# Multi-tier frontend download: Git Clone -> HTTP Archive Tarball -> Pre-bundled Fallback
download_frontend() {
  rm -rf public_tmp

  # Strategy 1: Git shallow clone
  echo "[Download] Attempting git shallow clone from $REPO_URL ($BRANCH)..."
  if git clone --depth 1 -b "$BRANCH" "$REPO_URL" public_tmp 2>/dev/null; then
    if [ -f "public_tmp/index.html" ]; then
      rm -rf public
      mv public_tmp public
      echo "[Download] Git clone succeeded."
      return 0
    fi
  fi
  rm -rf public_tmp

  # Strategy 2: Direct HTTP archive tarball download
  local gh_path
  gh_path=$(echo "$REPO_URL" | sed -E 's/.*github\.com[\/:]([^\/]+)\/([^\/\.]+)(\.git)?/\1\/\2/')
  if [ -n "$gh_path" ] && [ "$gh_path" != "$REPO_URL" ]; then
    echo "[Download] Git clone failed; attempting HTTP tarball download for $gh_path ($BRANCH)..."
    local tar_url1="https://codeload.github.com/${gh_path}/tar.gz/refs/heads/${BRANCH}"
    local tar_url2="https://github.com/${gh_path}/archive/refs/heads/${BRANCH}.tar.gz"

    mkdir -p public_tmp
    if (curl -fsSL --connect-timeout 10 --max-time 60 "$tar_url1" 2>/dev/null || \
        curl -fsSL --connect-timeout 10 --max-time 60 "$tar_url2" 2>/dev/null) | tar -xz --strip-components=1 -C public_tmp 2>/dev/null; then
      if [ -f "public_tmp/index.html" ]; then
        rm -rf public
        mv public_tmp public
        echo "[Download] HTTP archive download succeeded."
        return 0
      fi
    fi
    rm -rf public_tmp
  fi

  # Strategy 3: Restore from pre-bundled image backup
  if [ -d "/app/public_bundled" ] && [ -f "/app/public_bundled/index.html" ]; then
    echo "[Download] Network downloads failed; restoring pre-bundled frontend from image..."
    rm -rf public
    mkdir -p public
    cp -r /app/public_bundled/* public/
    return 0
  fi

  # Strategy 4: Keep existing public if valid
  if [ -f "public/index.html" ]; then
    echo "[Download] Using existing frontend files in public/."
    return 0
  fi

  return 1
}

# Inject multiplayer scripts and configuration into the frontend
patch_frontend() {
  if [ ! -f "public/index.html" ]; then
    return 1
  fi

  echo "Injecting multiplayer scripts..."
  mkdir -p public/js

  if [ -f "mp.js" ]; then
    cp mp.js public/js/mp.js
  elif [ -f "../mp.js" ]; then
    cp ../mp.js public/js/mp.js
  fi

  node -e '
  const fs = require("fs");
  const htmlPath = "public/index.html";
  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, "utf8");
    if (!html.includes("js/mp.js")) {
      const snippet = "<script src=\"https://cdn.socket.io/4.8.0/socket.io.min.js\"></script>\n<script src=\"js/mp.js\"></script>\n";
      html = html.replace("</body>", snippet + "</body>");
      fs.writeFileSync(htmlPath, html, "utf8");
    }
  }
  const jsPath = "public/js/mp.js";
  if (fs.existsSync(jsPath)) {
    let js = fs.readFileSync(jsPath, "utf8");
    js = js.replace(/serverUrl:\s*["\x27]http:\/\/localhost:3000["\x27]/g, "serverUrl: \"\"");
    fs.writeFileSync(jsPath, js, "utf8");
  }
  '

  echo "[Completed] Frontend integration ready."
  return 0
}

# Helper: run a shell command with retries and exponential backoff
run_cmd_with_retries() {
  local cmd="$1"
  local max_retries=5
  local attempt=0
  local delay=2

  while [ $attempt -lt $max_retries ]; do
    if eval "$cmd"; then
      return 0
    fi
    attempt=$((attempt + 1))
    echo "[Retry] Command failed (attempt $attempt/$max_retries). Retrying in $delay seconds..."
    sleep $delay
    delay=$((delay * 2))
  done

  return 1
}

# Internal function to clone or update
update_frontend() {
  ensure_dns

  if [ -d "public/.git" ]; then
    echo "[Update] Pulling latest changes from Hochciv repository..."
    cd public
    git reset --hard HEAD >/dev/null 2>&1 || true
    git clean -fd >/dev/null 2>&1 || true
    if ! run_cmd_with_retries "git pull origin \"$BRANCH\""; then
      echo "[Warning] git pull failed; using cached frontend version."
    fi
    cd ..
  else
    echo "[Init] Fetching Hochciv frontend ($BRANCH)..."
    if ! run_cmd_with_retries "download_frontend"; then
      echo "[Error] All download methods and fallbacks failed."
      return 1
    fi
  fi

  patch_frontend
  return 0
}

# 1. Initial frontend setup before starting server
if ! update_frontend; then
  echo "[Warning] Initial frontend fetch failed; continuing. Auto-updater will retry periodically."
fi

# 2. Background auto-updater
(
  while true; do
    sleep "$INTERVAL"
    echo "[Auto-Updater] Checking for updates on original repository..."
    ensure_dns
    if [ -d "public/.git" ]; then
      cd public
      if git fetch origin "$BRANCH" >/dev/null 2>&1; then
        LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "")
        REMOTE=$(git rev-parse origin/"$BRANCH" 2>/dev/null || echo "")
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
      echo "[Auto-Updater] public/.git missing; checking if frontend download is needed..."
      if [ ! -f "public/index.html" ]; then
        if update_frontend; then
          echo "[Auto-Updater] Frontend downloaded successfully."
        else
          echo "[Auto-Updater] Download failed; will retry later."
        fi
      else
        echo "[Auto-Updater] Frontend already available."
      fi
    fi
  done
) &

# 3. Start the Node.js server
echo "Starting Node.js server..."
exec node server.js
