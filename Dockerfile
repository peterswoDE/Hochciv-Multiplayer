FROM node:20-alpine

# Install git and bash for our update script
RUN apk add --no-cache git bash

WORKDIR /app

# Copy dependency files first
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY . .

# Ensure entrypoint is executable
RUN chmod +x entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
