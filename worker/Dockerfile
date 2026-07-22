# ─── Base image: Debian slim with Node.js 22 ───────────────────────────────
FROM node:22-slim

# Install Playwright system dependencies for Chromium
# This installs all required OS-level packages
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install Node dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Install Playwright browsers (Chromium only) + all OS dependencies
RUN npx playwright install --with-deps chromium

# Copy compiled TypeScript output
COPY dist/ ./dist/

# Non-root user for security
RUN useradd -ms /bin/bash worker
USER worker

# Environment
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/home/worker/.cache/ms-playwright

# Health check — worker exposes a minimal HTTP health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the worker polling process
CMD ["node", "dist/index.js"]
