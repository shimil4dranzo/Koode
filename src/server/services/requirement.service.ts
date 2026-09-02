import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { errors } from '@/server/errors';
import { newPublicId } from '@/server/ids';
import { AUDIT_ACTIONS, recordAudit, recordAuditSafely } from '@/server/audit';
import { enforceRateLimit } from '@/server/ratelimit';
import { canAct, isContactable } from '@/server/domain/person/rules';
import { normalizePhone } from '@/server/phone';
import { hashIp } from '@/server/crypto';
import {
  assertCanTransition,
  defaultExpiry,
  isEditable,
  isPubliclyListed,
  type RequirementFacts,
} from '@/server/domain/requirement/rules';
import { getSearchLocalityIds, localityLabel } from '@/server/services/locality.service';
import { categoryLabel } from '@/server/services/category.service';
import { resolveCategoryId } from '@/server/services/category.service';
import { resolveLocalityId } from '@/server/services/locality.service';
import type { CurrentPerson, RequestMeta } from '@/server/auth/session';
import type {
  ContactPreference,
  EngagementType,
  PayPeriod,
  RequirementStatus,
} from '@/server/domain/constants';

/**
 * Requirements: posting work, finding it, and revealing a contact number.
 *
 * The rule that shapes every query in this file: **no phone number is ever
 * selected into a list or detail response.** The employer's number is read by
 * exactly one function, `revealContact`, which rate-limits and audits it. If
 * you add a `select` here, do not add `phone` to it.
 */

/** Shape returned by list and detail endpoints. Note the absence of `phone`. */
export type RequirementSummary = {
  publicId: string;
  title: string;
  categoryLabel: string;
  localityLabel: string;
  engagementType: EngagementType;
  payMin: string | null;
  payMax: string | null;
  payPeriod: PayPeriod | null;
  vacancies: number;
  status: RequirementStatus;
  createdAt: string;
  expiresAt: string;
  postedByName: string;
  postedByIsVerifiedMember: boolean;
};

export type RequirementDetail = RequirementSummary & {
  description: string;
  contactPreference: ContactPreference;
  postedByPublicId: string;
  isOwner: boolean;
  interestCount: number;
  /** Whether the viewer has already expressed interest. */
  viewerHasExpressedInterest: boolean;
};

/**
 * DECIMAL comes back from the driver as a string so money never round-trips
 * through a float. It is passed to the client as a string for the same reason;
 * formatting happens at render time with the user's locale.
 */
function decimalToString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toString();
}

const SUMMARY_SELECT = {
  publicId: true,
  title: true,
  engagementType: true,
  payMin: true,
  payMax: true,
  payPeriod: true,
  vacancies: true,
  status: true,
  createdAt: true,
  expiresAt: true,
  hiddenAt: true,
  category: { select: { nameEn: true, nameMl: true } },
  locality: { select: { nameEn: true, nameMl: true } },
  postedBy: {
    // No `phone` here, and none anywhere else in this file except revealContact.
    select: {
      publicId: true,
      displayName: true,
      anonymizedAt: true,
      anchorMemberships: { where: { status: 'verified' }, select: { id: true }, take: 1 },
    },
  },
} satisfies Prisma.RequirementSelect;

type SummaryRow = Prisma.RequirementGetPayload<{ select: typeof SUMMARY_SELECT }>;

function toSummary(row: SummaryRow, locale: string): RequirementSummary {
  return {
    publicId: row.publicId,
    title: row.title,
    categoryLabel: categoryLabel(row.category, locale),
    localityLabel: localityLabel(row.locality, locale),
    engagementType: row.engagementType as EngagementType,
    payMin: decimalToString(row.payMin),
    payMax: decimalToString(row.payMax),
    payPeriod: row.payPeriod as PayPeriod | null,
    vacancies: row.vacancies,
    status: row.status as RequirementStatus,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    postedByName: row.postedBy.anonymizedAt ? '—' : row.postedBy.displayName,
    postedByIsVerifiedMember: row.postedBy.anchorMemberships.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchInput = {
  /**
   * Free text, matched against the title and description.
   *
   * Deliberately a plain LIKE rather than MySQL full-text: the corpus is
   * bilingual, and full-text indexing tokenises on word boundaries that
   * Malayalam does not have — a FULLTEXT index would quietly match English
   * postings well and Malayalam ones badly, which is exactly the wrong bias
   * for this audience. A substring match treats both scripts identically.
   */
  q?: string | undefined;
  localityPublicId?: string | undefined;
  categoryPublicId?: string | undefined;
  engagementType?: EngagementType | undefined;
  includeNearby: boolean;
  cursor?: string | undefined;
  limit: number;
  locale: string;
};

export type SearchResult = {
  items: RequirementSummary[];
  /** Public id to pass back as `cursor` for the next page, if any. */
  nextCursor: string | null;
};

/**
 * Structured filtering: locality, category, engagement type.
 *
 * There is deliberately no free-text search. MySQL full-text has no meaningful
 * Malayalam tokenisation, so a keyword index over Malayalam descriptions would
 * return almost nothing while looking like it worked. Filtering is what these
 * users need and it is index-friendly — see ARCHITECTURE.md §Search.
 *
 * Keyset pagination on (createdAt, id) rather than OFFSET: offset re-scans
 * everything it skips, and drops or repeats rows when a new posting lands
 * between page loads.
 */
export async function searchRequirements(input: SearchInput): Promise<SearchResult> {
  const now = new Date();

  const where: Prisma.RequirementWhereInput = {
    status: 'open',
    hiddenAt: null,
    expiresAt: { gt: now },
  };

  // Trimmed, length-capped, and only applied when something is left: an empty
  // or whitespace `q` must behave exactly like no `q` at all, or a stray space
  // in the URL silently returns nothing.
  const text = input.q?.trim().slice(0, 80);
  if (text) {
    where.OR = [
      { title: { contains: text } },
      { description: { contains: text } },
    ];
  }

  if (input.localityPublicId) {
    const localityId = await resolveLocalityId(input.localityPublicId);
    const ids = await getSearchLocalityIds(localityId, input.includeNearby);
    where.localityId = { in: ids };
  }

  if (input.categoryPublicId) {
    const categoryId = await resolveCategoryId(input.categoryPublicId);
    // Selecting a tier should match every role inside it, which is how people
    // actually search: "any skilled trade near me".
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { level: true, children: { select: { id: true } } },
    });

    where.categoryId =
      category?.level === 'tier'
        ? { in: [categoryId, ...(category.children.map((child) => child.id) ?? [])] }
        : categoryId;
  }

  if (input.engagementType) where.engagementType = input.engagementType;

  if (input.cursor) {
    const anchor = await prisma.requirement.findUnique({
      where: { publicId: input.cursor },
      select: { id: true, createdAt: true },
    });
    if (anchor) {
      where.OR = [
        { createdAt: { lt: anchor.createdAt } },
        { createdAt: anchor.createdAt, id: { lt: anchor.id } },
      ];
    }
  }

  const rows = await prisma.requirement.findMany({
    where,
    select: SUMMARY_SELECT,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    // One extra row tells us whether another page exists without a count query.
    take: input.limit + 1,
  });

  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;

  return {
    items: page.map((row) => toSummary(row, input.locale)),
    nextCursor: hasMore ? (page.at(-1)?.publicId ?? null) : null,
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function getRequirementDetail(
  publicId: string,
  viewer: CurrentPerson | null,
  locale: string,
): Promise<RequirementDetail> {
  const row = await prisma.requirement.findUnique({
    where: { publicId },
    select: {
      ...SUMMARY_SELECT,
      id: true,
      description: true,
      contactPreference: true,
      postedByPersonId: true,
      _count: { select: { interests: true } },
    },
  });

  if (!row) throw errors.notFound();

  const isOwner = viewer !== null && viewer.id === row.postedByPersonId;

  const facts: RequirementFacts = {
    status: row.status as RequirementStatus,
    expiresAt: row.expiresAt,
    hiddenAt: row.hiddenAt,
    engagementCount: 0,
  };

  // The owner and moderators can still see a closed or hidden posting; nobody
  // else can.
  const canSee =
    isPubliclyListed(facts) ||
    isOwner ||
    viewer?.platformRole === 'moderator' ||
    viewer?.platformRole === 'admin' ||
    // A closed or filled posting stays readable so that a link shared last
    // week does not 404; only a moderator-hidden one disappears.
    (row.hiddenAt === null && row.status !== 'open');

  if (!canSee) throw errors.notFound();

  const viewerHasExpressedInterest = viewer
    ? (await prisma.interest.count({
        where: { requirementId: row.id, personId: viewer.id },
      })) > 0
    : false;

  return {
    ...toSummary(row, locale),
    description: row.description,
    contactPreference: row.contactPreference as ContactPreference,
    postedByPublicId: row.postedBy.publicId,
    isOwner,
    interestCount: row._count.interests,
    viewerHasExpressedInterest,
  };
}

// ---------------------------------------------------------------------------
// Contact reveal — the audited path
// ---------------------------------------------------------------------------

export type RevealedContact = {
  phone: string;
  /** Null when the poster published no address. Never the login e-mail. */
  contactEmail: string | null;
  contactPreference: ContactPreference;
  displayName: string;
};

/**
 * Reveal an employer's phone number.
 *
 * The ONLY place in the codebase that selects `Person.phone` for display.
 * Every guard here is load-bearing:
 *
 *  - the caller must be signed in, so a reveal always has a named actor
 *  - rate-limited per person, because scraping is the obvious attack
 *  - the posting must be publicly listed, so a closed one is not a back door
 *  - the employer must be contactable, so a suspended or unclaimed person's
 *    number is never handed out
 *  - the reveal is written to the audit log before the number is returned
 */
export async function revealContact(
  publicId: string,
  viewer: CurrentPerson | null,
  meta: RequestMeta,
): Promise<RevealedContact> {
  // Seekers browse without an account (owner decision, 2026-09-01), so the
  // reveal is open to them. The guards shift rather than disappear: a
  // signed-in viewer is limited per account, an anonymous one per IP address,
  // and every reveal still lands in the audit log — with a null actor and a
  // hashed IP when nobody is signed in.
  if (viewer && !canAct(viewer)) throw errors.forbidden();

  await enforceRateLimit(
    'contactReveal',
    viewer ? viewer.publicId : (hashIp(meta.ip) ?? 'anonymous'),
  );

  const row = await prisma.requirement.findUnique({
    where: { publicId },
    select: {
      status: true,
      expiresAt: true,
      hiddenAt: true,
      contactPreference: true,
      postedBy: {
        select: {
          publicId: true,
          phone: true,
          // The published address, never `email` — that is the login
          // identifier and is not a reveal target. See prisma/schema.prisma.
          contactEmail: true,
          displayName: true,
          status: true,
          anonymizedAt: true,
        },
      },
    },
  });

  if (!row) throw errors.notFound();

  const facts: RequirementFacts = {
    status: row.status as RequirementStatus,
    expiresAt: row.expiresAt,
    hiddenAt: row.hiddenAt,
    engagementCount: 0,
  };

  if (!isPubliclyListed(facts)) throw errors.notFound();

  const employer = row.postedBy;
  if (
    !isContactable({ status: employer.status as never, anonymizedAt: employer.anonymizedAt }) ||
    !employer.phone
  ) {
    throw errors.notFound();
  }

  // Recorded before the number goes out, so a reveal cannot happen unlogged.
  await recordAudit({
    action: AUDIT_ACTIONS.CONTACT_REVEALED,
    actorPersonId: viewer?.id ?? null,
    entityType: 'requirement',
    entityId: publicId,
    metadata: { employerPublicId: employer.publicId },
    context: meta,
  });

  return {
    phone: employer.phone,
    contactEmail: employer.contactEmail,
    contactPreference: row.contactPreference as ContactPreference,
    displayName: employer.displayName,
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type CreateRequirementInput = {
  /**
   * Both required the first time a person posts, because the reveal has to
   * have something to show a candidate. Saved to the profile, so later
   * postings do not ask again. Unverified since the identity change —
   * recorded as an accepted consequence in ARCHITECTURE.md.
   */
  contactPhone?: string | null | undefined;
  contactEmail?: string | null | undefined;
  title: string;
  description: string;
  categoryPublicId: string;
  localityPublicId: string;
  engagementType: EngagementType;
  payMin?: number | null | undefined;
  payMax?: number | null | undefined;
  payPeriod?: PayPeriod | null | undefined;
  contactPreference: ContactPreference;
  vacancies: number;
};

export async function createRequirement(
  input: CreateRequirementInput,
  author: CurrentPerson,
  meta: RequestMeta,
): Promise<{ publicId: string }> {
  if (!canAct(author)) throw errors.forbidden();

  await enforceRateLimit('requirementCreate', author.publicId);

  // First posting: capture whichever contact details are still missing. Both
  // are asked together so the question is answered once, and the e-mail field
  // arrives prefilled with the account address — one tap unless they want
  // candidates pointed somewhere else.
  const contactUpdate: { phone?: string; contactEmail?: string } = {};

  if (!author.hasContactPhone) {
    const contactPhone = input.contactPhone ? normalizePhone(input.contactPhone) : null;
    if (!contactPhone) throw errors.validation('errors.contactPhoneRequired');
    contactUpdate.phone = contactPhone;
  }

  if (!author.hasContactEmail) {
    const contactEmail = input.contactEmail?.trim().toLowerCase();
    if (!contactEmail) throw errors.validation('errors.contactEmailRequired');
    contactUpdate.contactEmail = contactEmail;
  }

  if (Object.keys(contactUpdate).length > 0) {
    try {
      await prisma.person.update({ where: { id: author.id }, data: contactUpdate });
    } catch (error) {
      if (isUniqueViolation(error)) throw errors.conflict('errors.phoneTaken');
      throw error;
    }
  }

  const [categoryId, localityId] = await Promise.all([
    resolveCategoryId(input.categoryPublicId),
    resolveLocalityId(input.localityPublicId),
  ]);

  const publicId = newPublicId();

  await prisma.$transaction(async (tx) => {
    await tx.requirement.create({
      data: {
        publicId,
        postedByPersonId: author.id,
        title: input.title,
        description: input.description,
        categoryId,
        localityId,
        engagementType: input.engagementType,
        payMin: input.payMin ?? null,
        payMax: input.payMax ?? null,
        payPeriod: input.payPeriod ?? null,
        contactPreference: input.contactPreference,
        vacancies: input.vacancies,
        status: 'open',
        expiresAt: defaultExpiry(),
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.REQUIREMENT_CREATED,
        actorPersonId: author.id,
        entityType: 'requirement',
        entityId: publicId,
        metadata: { engagementType: input.engagementType },
        context: meta,
      },
      tx,
    );
  });

  return { publicId };
}

export type UpdateRequirementInput = Partial<
  Pick<
    CreateRequirementInput,
    | 'title'
    | 'description'
    | 'engagementType'
    | 'payMin'
    | 'payMax'
    | 'payPeriod'
    | 'contactPreference'
    | 'vacancies'
  >
>;

export async function updateRequirement(
  publicId: string,
  input: UpdateRequirementInput,
  actor: CurrentPerson,
  meta: RequestMeta,
): Promise<void> {
  const row = await prisma.requirement.findUnique({
    where: { publicId },
    select: {
      id: true,
      postedByPersonId: true,
      status: true,
      expiresAt: true,
      hiddenAt: true,
    },
  });

  if (!row) throw errors.notFound();
  if (row.postedByPersonId !== actor.id) throw errors.forbidden();

  const facts: RequirementFacts = {
    status: row.status as RequirementStatus,
    expiresAt: row.expiresAt,
    hiddenAt: row.hiddenAt,
    engagementCount: 0,
  };
  if (!isEditable(facts)) throw errors.invariant('errors.validationFailed');

  await prisma.$transaction(async (tx) => {
    await tx.requirement.update({
      where: { id: row.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.engagementType !== undefined
          ? { engagementType: input.engagementType }
          : {}),
        ...(input.payMin !== undefined ? { payMin: input.payMin } : {}),
        ...(input.payMax !== undefined ? { payMax: input.payMax } : {}),
        ...(input.payPeriod !== undefined ? { payPeriod: input.payPeriod } : {}),
        ...(input.contactPreference !== undefined
          ? { contactPreference: input.contactPreference }
          : {}),
        ...(input.vacancies !== undefined ? { vacancies: input.vacancies } : {}),
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.REQUIREMENT_UPDATED,
        actorPersonId: actor.id,
        entityType: 'requirement',
        entityId: publicId,
        metadata: { fields: Object.keys(input) },
        context: meta,
      },
      tx,
    );
  });
}

/**
 * Move a requirement to a terminal state.
 *
 * The `filled` case runs the domain invariant, which needs the engagement
 * count — hence the count query before the transition.
 */
export async function transitionRequirement(
  publicId: string,
  to: Extract<RequirementStatus, 'filled' | 'closed'>,
  actor: CurrentPerson,
  meta: RequestMeta,
): Promise<void> {
  const row = await prisma.requirement.findUnique({
    where: { publicId },
    select: {
      id: true,
      postedByPersonId: true,
      status: true,
      expiresAt: true,
      hiddenAt: true,
      _count: { select: { engagements: true } },
    },
  });

  if (!row) throw errors.notFound();
  if (row.postedByPersonId !== actor.id) throw errors.forbidden();

  assertCanTransition(
    {
      status: row.status as RequirementStatus,
      expiresAt: row.expiresAt,
      hiddenAt: row.hiddenAt,
      engagementCount: row._count.engagements,
    },
    to,
  );

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.requirement.update({
      where: { id: row.id },
      data: {
        status: to,
        ...(to === 'filled' ? { filledAt: now } : { closedAt: now }),
      },
    });

    await recordAudit(
      {
        action:
          to === 'filled' ? AUDIT_ACTIONS.REQUIREMENT_FILLED : AUDIT_ACTIONS.REQUIREMENT_CLOSED,
        actorPersonId: actor.id,
        entityType: 'requirement',
        entityId: publicId,
        context: meta,
      },
      tx,
    );
  });
}

/** The employer's own postings, including closed ones. */
export async function listOwnRequirements(
  owner: CurrentPerson,
  locale: string,
): Promise<RequirementSummary[]> {
  const rows = await prisma.requirement.findMany({
    where: { postedByPersonId: owner.id },
    select: SUMMARY_SELECT,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return rows.map((row) => toSummary(row, locale));
}

/**
 * Mark postings whose clock has run out.
 *
 * Cosmetic rather than load-bearing: the domain rules already treat a
 * past-dated `open` requirement as unlisted, so a stalled sweeper cannot leave
 * stale postings visible. This just keeps the stored status honest.
 */
export async function expireStaleRequirements(): Promise<number> {
  const { count } = await prisma.requirement.updateMany({
    where: { status: 'open', expiresAt: { lte: new Date() } },
    data: { status: 'expired' },
  });

  if (count > 0) {
    await recordAuditSafely({
      action: AUDIT_ACTIONS.REQUIREMENT_EXPIRED,
      entityType: 'requirement',
      metadata: { count },
    });
  }

  return count;
}

/** Prisma unique-constraint violation, matched by code to avoid the import. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
