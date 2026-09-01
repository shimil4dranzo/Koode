import { handler, noContent } from '@/server/http/respond';
import { removeSkill } from '@/server/services/person.service';
import { requirePerson } from '@/server/auth/session';

type RouteContext = { params: Promise<{ categoryPublicId: string }> };

/**
 * DELETE /api/me/skills/:categoryPublicId — stop listing a work type.
 *
 * The category is the identifier because a person holds at most one skill row
 * per category, so there is no separate skill id to remember.
 */
export const DELETE = handler(async (_request: Request, context: RouteContext) => {
  const { categoryPublicId } = await context.params;
  const person = await requirePerson();

  await removeSkill(categoryPublicId, person);

  return noContent();
});
