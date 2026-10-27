# Discord Activity bridge: bundle activity/bridge.js with the Embedded App SDK (dev dependencies)
FROM node:24-slim AS activity
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY activity ./activity
RUN node activity/build.js

FROM node:24-slim

WORKDIR /app

# Copy dependency files first
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=activity /build/node_modules/.cache/hochciv-activity ./node_modules/.cache/hochciv-activity

# Copy application files – including the game itself (HochCiv/, and HochCiv-v88/, HochCiv-v87/, HochCiv-v83/
# for Rundenspiele started on those versions). Nothing is downloaded, neither at build time nor at start.
COPY . .

# Ensure entrypoint is executable
RUN chmod +x entrypoint.sh

# public/ = the game + mp.js (scripts/build-public.js); entrypoint.sh rebuilds it at start
RUN node scripts/build-public.js

RUN chown -R node:node /app

USER node
EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
