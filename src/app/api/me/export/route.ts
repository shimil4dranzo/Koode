import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handler } from '@/server/http/respond';
import { readMeta } from '@/server/http/request';
import { exportPersonalData } from '@/server/services/person.service';
import { requirePerson } from '@/server/auth/session';

/**
 * GET /api/me/export — download everything Koode holds about you.
 *
 * Required by the DPDP Act 2023, and built in M1 rather than bolted on later,
 * because an export written after the fact always misses the tables nobody
 * remembered.
 *
 * Returned as a downloadable file rather than the usual `{ data: … }` envelope:
 * the person asked for their data, not for an API response. Every read is
 * audited.
 */
export const GET = handler(async (request: NextRequest) => {
  const person = await requirePerson();

  const data = await exportPersonalData(person, readMeta(request));

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="koode-my-data-${person.publicId}.json"`,
      'Cache-Control': 'no-store, private',
    },
  });
});
