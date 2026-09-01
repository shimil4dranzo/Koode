import type { NextRequest } from 'next/server';
import { handler, ok } from '@/server/http/respond';
import { listAnchorOrgs } from '@/server/services/anchor.service';
import { resolveLocale } from '@/server/http/locale';

/**
 * GET /api/anchors — the local organisations whose word Koode recognises.
 *
 * Open to signed-out visitors: this is the list of associations behind the
 * verified badge, and somebody deciding whether to register should be able to
 * see whose name is on it. It contains no personal data.
 */
export const GET = handler(async (request: NextRequest) => {
  const orgs = await listAnchorOrgs(resolveLocale(request));

  return ok({ orgs });
});
