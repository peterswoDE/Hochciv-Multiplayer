# Discord Activity bridge: bundle activity/bridge.js with the Embedded App SDK (dev dependencies)
FROM node:20-slim AS activity
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY activity ./activity
RUN node activity/build.js

FROM node:20-slim

# Install git, bash, curl, tar, ca-certificates, and ping utility
RUN apt-get update && apt-get install -y git bash curl tar ca-certificates iputils-ping && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files first
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=activity /build/node_modules/.cache/hochciv-activity ./node_modules/.cache/hochciv-activity

# Copy application files
COPY . .

# Ensure entrypoint is executable
RUN chmod +x entrypoint.sh

# Pre-bundle the frontend at build time so the container is fully self-contained and offline-ready
ARG CORE_REPO_URL="https://github.com/timooom-hash/Hochciv.git"
ARG CORE_REPO_BRANCH="main"
# Optional full commit SHA – pins the bundled engine to exactly that commit
ARG CORE_REPO_COMMIT=""
RUN mkdir -p public && \
    (if [ -n "$CORE_REPO_COMMIT" ]; then \
       git init -q public && git -C public remote add origin "$CORE_REPO_URL" && \
       git -C public fetch -q --depth 1 origin "$CORE_REPO_COMMIT" && git -C public checkout -q --detach FETCH_HEAD && \
       [ "$(git -C public rev-parse HEAD)" = "$CORE_REPO_COMMIT" ]; \
     else \
       git clone --depth 1 -b "$CORE_REPO_BRANCH" "$CORE_REPO_URL" public || \
       (curl -fsSL "https://codeload.github.com/timooom-hash/Hochciv/tar.gz/refs/heads/${CORE_REPO_BRANCH}" | tar -xz --strip-components=1 -C public); \
     fi || \
     echo "[Build Warning] Could not pre-bundle Hochciv frontend during docker build; will download at runtime.") && \
    if [ -f public/index.html ]; then \
      mkdir -p public/js && \
      cp mp.js public/js/mp.js && \
      node inject.js public && \
      mkdir -p /app/public_bundled && \
      cp -r public/* /app/public_bundled/ && \
      (git -C public rev-parse HEAD > /app/public_bundled/.commit 2>/dev/null || true); \
    fi

RUN chown -R node:node /app

USER node
EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
