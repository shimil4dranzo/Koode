import type { NextRequest } from 'next/server';
import { created, handler, ok } from '@/server/http/respond';
import { readJson, readMeta, readQuery } from '@/server/http/request';
import { createRequirementSchema, searchRequirementsSchema } from '@/server/http/schemas';
import { createRequirement, searchRequirements } from '@/server/services/requirement.service';
import { requirePerson } from '@/server/auth/session';
import { resolveLocale } from '@/server/http/locale';

/**
 * GET  /api/requirements — structured search
 * POST /api/requirements — post a requirement
 *
 * Search is deliberately open to signed-out visitors: someone looking for work
 * should be able to see whether Koode is worth registering for. No phone
 * number appears in the response, so there is nothing to harvest.
 */
export const GET = handler(async (request: NextRequest) => {
  const query = readQuery(request, searchRequirementsSchema);

  const result = await searchRequirements({
    localityPublicId: query.locality,
    categoryPublicId: query.category,
    engagementType: query.engagementType,
    includeNearby: query.nearby,
    cursor: query.cursor,
    limit: query.limit,
    locale: resolveLocale(request),
  });

  return ok(result);
});

export const POST = handler(async (request: NextRequest) => {
  const person = await requirePerson();
  const body = await readJson(request, createRequirementSchema);
  const meta = readMeta(request);

  const result = await createRequirement(
    {
      contactPhone: body.contactPhone,
      contactEmail: body.contactEmail,
      title: body.title,
      description: body.description,
      categoryPublicId: body.categoryPublicId,
      localityPublicId: body.localityPublicId,
      engagementType: body.engagementType,
      payMin: body.payMin,
      payMax: body.payMax,
      payPeriod: body.payPeriod,
      contactPreference: body.contactPreference,
      vacancies: body.vacancies,
    },
    person,
    meta,
  );

  return created(result);
});
