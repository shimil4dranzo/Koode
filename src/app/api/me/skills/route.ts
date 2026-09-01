import type { NextRequest } from 'next/server';
import { handler, noContent } from '@/server/http/respond';
import { readJson } from '@/server/http/request';
import { personSkillSchema } from '@/server/http/schemas';
import { setSkill } from '@/server/services/person.service';
import { requirePerson } from '@/server/auth/session';

/**
 * POST /api/me/skills — add a work type, or change the detail on one already
 * listed.
 *
 * An upsert rather than a create: re-submitting the same category is somebody
 * correcting "8 years" to "10", not a duplicate to reject.
 */
export const POST = handler(async (request: NextRequest) => {
  const person = await requirePerson();
  const body = await readJson(request, personSkillSchema);

  await setSkill(
    {
      categoryPublicId: body.categoryPublicId,
      yearsExperience: body.yearsExperience ?? null,
      qualificationNote: body.qualificationNote ?? null,
    },
    person,
  );

  return noContent();
});
