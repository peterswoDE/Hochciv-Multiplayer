FROM node:20-slim

# Install git, bash, curl, tar, ca-certificates, and ping utility
RUN apt-get update && apt-get install -y git bash curl tar ca-certificates iputils-ping && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files first
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY . .

# Ensure entrypoint is executable
RUN chmod +x entrypoint.sh

# Pre-bundle the frontend at build time so the container is fully self-contained and offline-ready
ARG CORE_REPO_URL="https://github.com/timooom-hash/Hochciv.git"
ARG CORE_REPO_BRANCH="main"
RUN mkdir -p public && \
    (git clone --depth 1 -b "$CORE_REPO_BRANCH" "$CORE_REPO_URL" public || \
     (curl -fsSL "https://codeload.github.com/timooom-hash/Hochciv/tar.gz/refs/heads/${CORE_REPO_BRANCH}" | tar -xz --strip-components=1 -C public) || \
     echo "[Build Warning] Could not pre-bundle Hochciv frontend during docker build; will download at runtime.") && \
    if [ -f public/index.html ]; then \
      mkdir -p public/js && \
      cp mp.js public/js/mp.js && \
      node -e 'const fs = require("fs"); let h = fs.readFileSync("public/index.html","utf8"); if(!h.includes("js/mp.js")){ h = h.replace("</body>","<script src=\"https://cdn.socket.io/4.8.0/socket.io.min.js\"></script>\n<script src=\"js/mp.js\"></script>\n</body>"); fs.writeFileSync("public/index.html",h); }' && \
      node -e 'const fs = require("fs"); let j = fs.readFileSync("public/js/mp.js","utf8"); j = j.replace(/serverUrl:\s*["\x27]http:\/\/localhost:3000["\x27]/g, "serverUrl: \"\""); fs.writeFileSync("public/js/mp.js", j);' && \
      mkdir -p /app/public_bundled && \
      cp -r public/* /app/public_bundled/; \
    fi

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
