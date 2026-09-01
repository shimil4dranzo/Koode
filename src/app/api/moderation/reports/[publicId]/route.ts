import type { NextRequest } from 'next/server';
import { handler, noContent } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { resolveReportSchema } from '@/server/http/schemas';
import { resolveReport } from '@/server/services/moderation.service';
import { requirePerson } from '@/server/auth/session';

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * PATCH /api/moderation/reports/:id — close a report.
 *
 * Closing a report is a separate act from hiding what it was about: a
 * moderator can hide content and leave the report open for a second opinion,
 * or dismiss a report without touching anything. Collapsing the two would lose
 * that distinction in the audit log.
 */
export const PATCH = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId } = await context.params;
  const actor = await requirePerson();
  const body = await readJson(request, resolveReportSchema);

  await resolveReport(publicId, body.status, body.note ?? null, actor, readMeta(request));

  return noContent();
});
