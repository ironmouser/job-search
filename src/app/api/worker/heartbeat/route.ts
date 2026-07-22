import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateWorker } from '@/lib/auto-apply/worker-auth';
import { WorkerHealthStatus } from '@/lib/auto-apply/types';

/**
 * POST /api/worker/heartbeat
 *
 * Called by the worker every HEARTBEAT_INTERVAL_MS (default: 30s).
 * Persists worker health status for monitoring.
 *
 * Future: detect stale workers (no heartbeat > 5min) and re-queue their sessions.
 */
export async function POST(request: NextRequest) {
  const authError = authenticateWorker(request);
  if (authError) return authError;

  let body: WorkerHealthStatus;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.workerId) {
    return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
  }

  // For now, just log the heartbeat. In the future, persist to a worker_registry table.
  console.info(
    `[Heartbeat] Worker: ${body.workerId} | Status: ${body.status} | ` +
    `Session: ${body.currentSessionId ?? 'none'} | ` +
    `Processed: ${body.sessionsProcessed} | Uptime: ${body.uptimeSeconds}s`
  );

  return NextResponse.json({
    acknowledged: true,
    serverTime: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
