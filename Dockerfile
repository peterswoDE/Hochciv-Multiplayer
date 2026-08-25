FROM node:20-slim

# Install git and bash for our update script
RUN apt-get update && apt-get install -y git bash && rm -rf /var/lib/apt/lists/*

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
