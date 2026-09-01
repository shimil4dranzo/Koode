import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, EmptyState } from '@/components/ui/card';
import { MembershipActions } from '@/components/admin/membership-actions';
import { getCurrentPerson } from '@/server/auth/session';
import { canModerate } from '@/server/domain/person/rules';
import {
  listMemberships,
  listOrgsActorCanVerify,
  type MembershipView,
} from '@/server/services/anchor.service';

/**
 * Membership verification.
 *
 * Grouped by organisation, and only the organisations this person may actually
 * act for. That is a narrower set than "the admin console": verifying is the
 * association's own act, so it belongs to an office-bearer of that
 * association or to a platform admin — not to a moderator, whose job is
 * content. `listOrgsActorCanVerify` is the single authority on that, and this
 * page renders whatever it returns.
 *
 * Pending requests sort first, because they are the ones waiting on somebody.
 */

type PageProps = { params: Promise<{ locale: string }> };

/** `role` is stored as a VARCHAR; anything unexpected reads as a plain member. */
function roleKey(role: string): 'member' | 'office_bearer' {
  return role === 'office_bearer' ? 'office_bearer' : 'member';
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('members') };
}

export default async function AdminMembersPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const person = await getCurrentPerson();
  // next-intl's `redirect` throws, but its signature does not return `never`,
  // so the narrowing has to be made explicit for anything below it.
  if (!person) {
    redirect({ href: '/sign-in', locale });
    return null;
  }

  const orgs = await listOrgsActorCanVerify(person, locale);

  // An office-bearer with no platform role belongs here; anybody with neither
  // an organisation nor the moderator role has nothing to see and is not told
  // that the page exists.
  if (orgs.length === 0 && !canModerate(person)) {
    redirect({ href: '/', locale });
    return null;
  }

  const [t, tCommon, tAnchor, tStatus, tRole, format] = await Promise.all([
    getTranslations('admin'),
    getTranslations('common'),
    getTranslations('anchor'),
    getTranslations('taxonomy.membershipStatus'),
    getTranslations('taxonomy.membershipRole'),
    getFormatter(),
  ]);

  const rolls: Array<{ org: (typeof orgs)[number]; members: MembershipView[] }> =
    await Promise.all(
      orgs.map(async (org) => ({
        org,
        members: await listMemberships(org.publicId, undefined, person, locale),
      })),
    );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold sm:text-3xl">{t('members')}</h1>

      {rolls.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={tAnchor('noOrgs')} />
        </div>
      ) : null}

      {rolls.map(({ org, members }) => (
        <section key={org.publicId} className="mt-8">
          <h2 className="text-xl font-semibold">{org.name}</h2>
          <p className="mt-1 text-ink-700">{org.localityLabel}</p>

          {members.length === 0 ? (
            <p className="mt-3 text-ink-700">{tAnchor('noMembers')}</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-3">
              {members.map((member) => (
                <Card key={member.personPublicId} as="li">
                  <h3 className="flex flex-wrap items-center gap-x-3 gap-y-2 text-lg font-medium">
                    <Link
                      href={`/people/${member.personPublicId}`}
                      className="underline underline-offset-2"
                    >
                      {member.displayName}
                    </Link>
                    <Badge tone={member.status === 'verified' ? 'verified' : 'neutral'}>
                      {tStatus(member.status)}
                    </Badge>
                    <Badge>{tRole(roleKey(member.role))}</Badge>
                  </h3>

                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-700">
                    {member.localityLabel ? <span>{member.localityLabel}</span> : null}
                    {member.membershipRef ? (
                      <span>
                        {tAnchor('refLabel')}
                        <span aria-hidden="true"> · </span>
                        {member.membershipRef}
                      </span>
                    ) : null}
                    <span>
                      {tAnchor('requestedOn', {
                        date: format.dateTime(new Date(member.requestedAt), 'short'),
                      })}
                    </span>
                    {member.verifiedByName ? (
                      <span>{tAnchor('verifiedByOn', { name: member.verifiedByName })}</span>
                    ) : null}
                  </p>

                  <MembershipActions
                    anchorOrgPublicId={org.publicId}
                    personPublicId={member.personPublicId}
                    status={member.status}
                  />
                </Card>
              ))}
            </ol>
          )}
        </section>
      ))}

      <p className="mt-8">
        <Link href="/admin" className="underline underline-offset-2">
          {tCommon('back')}
        </Link>
      </p>
    </div>
  );
}
