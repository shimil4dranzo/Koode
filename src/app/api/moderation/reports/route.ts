import type { NextRequest } from 'next/server';
import { created, handler, ok } from '@/server/http/respond';
import { readJson, readMeta, readQuery } from '@/server/http/request';
import { listReportsQuerySchema, reportSchema } from '@/server/http/schemas';
import { listReports, submitReport } from '@/server/services/moderation.service';
import { getCurrentPerson, requirePerson } from '@/server/auth/session';
import { resolveLocale } from '@/server/http/locale';

/**
 * GET  /api/moderation/reports — the queue, for a moderator
 * POST /api/moderation/reports — report something
 *
 * The POST uses `getCurrentPerson` rather than `requirePerson` on purpose:
 * "my details are here without my permission" is exactly the complaint
 * somebody with no account needs to be able to make, and requiring them to
 * register first to say it would be perverse. The service rate-limits an
 * anonymous report by IP.
 */
export const GET = handler(async (request: NextRequest) => {
  const actor = await requirePerson();
  const query = readQuery(request, listReportsQuerySchema);

  const reports = await listReports(query.status, actor, resolveLocale(request));

  return ok({ reports }, { headers: { 'Cache-Control': 'no-store, private' } });
});

export const POST = handler(async (request: NextRequest) => {
  const reporter = await getCurrentPerson();
  const body = await readJson(request, reportSchema);

  const result = await submitReport(
    {
      entityType: body.entityType,
      entityId: body.entityId,
      reason: body.reason,
      detail: body.detail ?? null,
    },
    reporter,
    readMeta(request),
  );

  return created(result);
});
