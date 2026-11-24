# Discord Activity bridge: bundle activity/bridge.js with the Embedded App SDK (dev dependencies)
FROM node:24-slim AS activity
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY activity ./activity
# the inline handlers of mp.js and client/ – their shapes are the bridge's allow-list (R-04)
COPY mp.js ./
COPY client ./client
RUN node activity/build.js

FROM node:24-slim

WORKDIR /app

# Copy dependency files first
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=activity /build/node_modules/.cache/hochciv-activity ./node_modules/.cache/hochciv-activity

# Copy application files – including the game itself (HochCiv/, and HochCiv-v110/, HochCiv-v108/ and HochCiv-v107/
# for Rundenspiele started on those versions). Nothing is downloaded, neither at build time nor at start.
COPY . .

# public/ = the game + mp.js (scripts/build-public.js); entrypoint.sh rebuilds it at start.
# The server runs as `node` and may only write public/ – its own code stays root's, so a bug in it
# can't be turned into a changed server.
RUN chmod +x entrypoint.sh \
    && node scripts/build-public.js \
    && chown -R node:node /app/public

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

ENTRYPOINT ["/app/entrypoint.sh"]
