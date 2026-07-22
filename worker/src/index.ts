import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import { chromium } from 'playwright';
import { WorkerProcess } from './worker';
import { RailwayAPIClient } from './api-client';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: WORKER_VERSION } = require('../package.json') as { version: string };

// ─── Config from environment ──────────────────────────────────────────────────

const RAILWAY_API_URL = process.env.RAILWAY_API_URL;
const WORKER_API_KEY = process.env.WORKER_API_KEY;
const WORKER_ID = process.env.WORKER_ID ?? 'worker-1';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '5000', 10);
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? '30000', 10);

if (!RAILWAY_API_URL || !WORKER_API_KEY) {
  console.error('[Worker] RAILWAY_API_URL and WORKER_API_KEY are required');
  process.exit(1);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const apiClient = new RailwayAPIClient(RAILWAY_API_URL, WORKER_API_KEY, WORKER_ID);
const worker = new WorkerProcess(apiClient, WORKER_ID, POLL_INTERVAL_MS);

// ─── Minimal health check HTTP server ────────────────────────────────────────
// Docker HEALTHCHECK hits this endpoint

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    const health = worker.healthCheck();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(3001, () => {
  console.info(`[Worker] Health endpoint listening on :3001`);
});

// ─── Heartbeat loop ───────────────────────────────────────────────────────────

const heartbeatInterval = setInterval(async () => {
  try {
    await apiClient.heartbeat(worker.healthCheck());
  } catch (err) {
    console.warn('[Worker] Heartbeat failed:', err);
  }
}, HEARTBEAT_INTERVAL_MS);

// ─── Startup Self-Test ────────────────────────────────────────────────────────

async function runStartupTests(apiClient: RailwayAPIClient, workerId: string) {
  console.info('[Startup] Running self-tests...');
  let passed = true;
  const results = {
    docker: 'FAIL',
    playwright: 'FAIL',
    railwayApi: 'FAIL'
  };

  // 1. Check Docker environment
  if (fs.existsSync('/.dockerenv')) {
    results.docker = 'PASS';
  } else {
    // If not in docker, we still pass but note it
    results.docker = 'WARN (Not running in Docker)';
  }

  // 2. Check Playwright & Chromium
  try {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    await browser.close();
    results.playwright = 'PASS';
  } catch (err: any) {
    console.error('[Startup] Playwright test failed:', err.message);
    results.playwright = 'FAIL';
    passed = false;
  }

  // 3. Check Railway API connectivity
  try {
    // Send an initial heartbeat to verify auth and connectivity
    await apiClient.heartbeat({
      workerId,
      workerVersion: WORKER_VERSION,
      status: 'idle',
      currentSessionId: null,
      uptimeSeconds: 0,
      sessionsProcessed: 0,
      lastHeartbeat: new Date().toISOString(),
    });
    results.railwayApi = 'PASS';
  } catch (err: any) {
    console.error('[Startup] Railway API test failed:', err.message);
    results.railwayApi = 'FAIL';
    passed = false;
  }

  // Log summary
  console.info('=========================================');
  console.info(' Worker Startup Self-Test Summary');
  console.info('=========================================');
  console.info(` Docker:      [${results.docker}]`);
  console.info(` Playwright:  [${results.playwright}]`);
  console.info(` Railway API: [${results.railwayApi}]`);
  console.info('=========================================');

  if (!passed) {
    console.error('[Startup] Self-test failed. Worker will not start.');
    process.exit(1);
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

console.info(`[Worker] Starting — ID: ${WORKER_ID}, poll interval: ${POLL_INTERVAL_MS}ms`);

runStartupTests(apiClient, WORKER_ID).then(() => {
  worker.start().catch((err) => {
    console.error('[Worker] Fatal error:', err);
    process.exit(1);
  });
}).catch(err => {
  console.error('[Worker] Fatal error during startup:', err);
  process.exit(1);
});


// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  console.info(`[Worker] ${signal} received — shutting down gracefully`);
  clearInterval(heartbeatInterval);
  healthServer.close();
  await worker.shutdown();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
