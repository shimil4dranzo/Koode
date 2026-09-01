import type { NextRequest } from 'next/server';
import { handler, noContent, ok } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { updateRequirementSchema } from '@/server/http/schemas';
import {
  getRequirementDetail,
  transitionRequirement,
  updateRequirement,
} from '@/server/services/requirement.service';
import { getCurrentPerson, requirePerson } from '@/server/auth/session';
import { resolveLocale } from '@/server/http/locale';

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * GET    /api/requirements/:id — detail (never includes a phone number)
 * PATCH  /api/requirements/:id — edit, owner only, while open
 * DELETE /api/requirements/:id — close it, owner only
 */
export const GET = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId } = await context.params;
  const viewer = await getCurrentPerson();

  const detail = await getRequirementDetail(publicId, viewer, resolveLocale(request));

  return ok(detail);
});

export const PATCH = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId } = await context.params;
  const person = await requirePerson();
  const body = await readJson(request, updateRequirementSchema);

  await updateRequirement(publicId, body, person, readMeta(request));

  return noContent();
});

/**
 * Closing rather than deleting. Nothing in Koode is hard-deleted: the posting
 * is part of the record that a piece of work existed.
 */
export const DELETE = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId } = await context.params;
  const person = await requirePerson();

  await transitionRequirement(publicId, 'closed', person, readMeta(request));

  return noContent();
});
