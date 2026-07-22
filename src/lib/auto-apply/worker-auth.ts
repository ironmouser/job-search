import { NextRequest, NextResponse } from 'next/server';

/**
 * Worker API Authentication
 *
 * All /api/worker/* endpoints are authenticated with a shared secret key.
 * The worker sends this key in the Authorization header.
 *
 * Header format: Authorization: Bearer <WORKER_API_KEY>
 *
 * Set WORKER_API_KEY in Railway environment variables.
 * The same key must be set as WORKER_API_KEY in the DigitalOcean worker .env
 *
 * Generate a key with: openssl rand -hex 32
 */

export function authenticateWorker(request: NextRequest): NextResponse | null {
  const workerApiKey = process.env.WORKER_API_KEY;

  if (!workerApiKey) {
    console.error('[WorkerAuth] WORKER_API_KEY environment variable is not set');
    return NextResponse.json(
      { error: 'Worker authentication not configured' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or malformed Authorization header' },
      { status: 401 }
    );
  }

  const providedKey = authHeader.slice('Bearer '.length).trim();
  if (providedKey !== workerApiKey) {
    return NextResponse.json(
      { error: 'Invalid worker API key' },
      { status: 403 }
    );
  }

  // Auth passed — return null to signal the caller to proceed
  return null;
}
