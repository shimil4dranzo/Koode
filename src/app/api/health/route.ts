import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

export const dynamic = 'force-dynamic';

/**
 * Liveness and readiness in one endpoint.
 *
 * Deliberately unauthenticated and deliberately terse: it reports whether the
 * process can serve traffic, and nothing that would help an attacker — no
 * version string, no hostname, no connection details.
 *
 * The database check is a real round trip, not a connection-pool inspection.
 * A pool that believes it is healthy while MySQL is refusing queries is
 * exactly the failure this needs to catch.
 */
export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();

  let database: 'up' | 'down' = 'down';
  let charsetOk = false;

  try {
    // Round-trips a Malayalam string through the connection. If the charset or
    // collation is wrong anywhere in the chain, this comes back mangled — the
    // silent corruption the brief warns about, surfaced as a health failure.
    const probe = await prisma.$queryRaw<Array<{ probe: string }>>`SELECT 'എടക്കര' AS probe`;
    database = 'up';
    charsetOk = probe[0]?.probe === 'എടക്കര';
  } catch {
    database = 'down';
  }

  const healthy = database === 'up' && charsetOk;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      database,
      charset: charsetOk ? 'utf8mb4' : 'invalid',
      latencyMs: Date.now() - startedAt,
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
