# ─── Base image: Debian slim with Node.js 22 ───────────────────────────────
FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and tsconfig
COPY package*.json tsconfig.json ./

# Install dependencies (including devDependencies for TypeScript compilation)
RUN npm ci

# Copy source code and compile TypeScript to dist/
COPY src/ ./src/
RUN npm run build

# Environment for Playwright browser cache location
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install Playwright browsers (Chromium only) + OS-level browser dependencies
RUN npx playwright install --with-deps chromium && chmod -R 777 /ms-playwright

# Prune devDependencies to keep runtime lean
RUN npm prune --omit=dev

# Create non-root user for security
RUN useradd -ms /bin/bash worker && chown -R worker:worker /app /ms-playwright
USER worker

# Environment
ENV NODE_ENV=production

# Health check — worker exposes a minimal HTTP health endpoint on port 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the worker polling process
CMD ["node", "dist/index.js"]
