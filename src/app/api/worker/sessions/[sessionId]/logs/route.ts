import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateWorker } from '@/lib/auto-apply/worker-auth';
import { ExecutionLogEntry } from '@/lib/auto-apply/types';

/**
 * POST /api/worker/sessions/[sessionId]/logs
 *
 * Called by the worker to batch-insert execution log entries.
 * The worker buffers entries in memory and flushes periodically (every 10 entries
 * or on error) to avoid hammering the API with individual inserts.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const authError = authenticateWorker(request);
  if (authError) return authError;

  const { sessionId } = await context.params;

  let body: { entries: ExecutionLogEntry[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ error: 'entries must be a non-empty array' }, { status: 400 });
  }

  // Cap batch size to prevent abuse
  const MAX_BATCH = 100;
  if (body.entries.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Batch size exceeds maximum of ${MAX_BATCH}` },
      { status: 400 }
    );
  }

  try {
    // Verify the session exists before inserting logs
    const sessionExists = await prisma.autoApplySession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });

    if (!sessionExists) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    await prisma.executionLog.createMany({
      data: body.entries.map((entry) => ({
        sessionId,
        timestamp: new Date(entry.timestamp),
        level: entry.level,
        step: entry.step,
        message: entry.message,
        metadata: (entry.metadata as object) ?? undefined,
        durationMs: entry.durationMs ?? undefined,
        screenshotPath: entry.screenshotPath ?? undefined,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ success: true, inserted: body.entries.length });
  } catch (error: any) {
    console.error('[worker/sessions/logs] Error:', error);
    return NextResponse.json({ error: 'Failed to insert logs' }, { status: 500 });
  }
}

/**
 * GET /api/worker/sessions/[sessionId]/logs
 *
 * Used by the Railway frontend to retrieve logs for the log viewer.
 * This route is also accessible to the frontend via the user-facing API
 * at /api/auto-apply/[jobId]/logs, which calls through to this data.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const authError = authenticateWorker(request);
  if (authError) return authError;

  const { sessionId } = await context.params;

  try {
    const logs = await prisma.executionLog.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
    });

    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error('[worker/sessions/logs GET] Error:', error);
    return NextResponse.json({ error: 'Failed to retrieve logs' }, { status: 500 });
  }
}
