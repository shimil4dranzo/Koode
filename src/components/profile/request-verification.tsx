'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ApiError, api } from '@/lib/api';

/**
 * "Ask my college / association to confirm my profile."
 *
 * This is the seeker's end of the verification funnel in the launch plan:
 * student registers → institution confirms → badge. The machinery already
 * existed for the traders' association; what was missing was any place a
 * person could *ask*. Until now the only screen that touched memberships was
 * the office-bearer's, which meant nobody could request one.
 *
 * One select, one optional reference, one button. The org list is whatever
 * institutions are active in the database, so adding a college is a seed
 * row, not a code change.
 */

export type VerifierOption = { publicId: string; name: string; type: string };

export function RequestVerification({ orgs }: { orgs: VerifierOption[] }) {
  const t = useTranslations('anchor');
  const tErrors = useTranslations('errors');
  const router = useRouter();

  const [orgPublicId, setOrgPublicId] = useState(orgs[0]?.publicId ?? '');
  const [membershipRef, setMembershipRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeLabel = (type: string): string => {
    const key = (
      {
        college: 'orgTypeCollege',
        training_centre: 'orgTypeTrainingCentre',
        community_org: 'orgTypeCommunityOrg',
        merchant_assoc: 'orgTypeMerchantAssoc',
        civic_club: 'orgTypeCivicClub',
        swayamsahaya: 'orgTypeSwayamsahaya',
        residents_assoc: 'orgTypeResidentsAssoc',
      } as Record<string, string>
    )[type];
    return key ? t(key as never) : type;
  };

  async function submit(): Promise<void> {
    if (!orgPublicId) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/anchors/${orgPublicId}/members`, {
        membershipRef: membershipRef.trim() || null,
      });
      setDone(true);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'RATE_LIMITED') {
        setError(tErrors('tooManyRequests'));
      } else if (caught instanceof ApiError) {
        try {
          setError(tErrors(caught.messageKey.replace(/^errors\./, '') as never));
        } catch {
          setError(tErrors('unexpected'));
        }
      } else {
        setError(tErrors('unexpected'));
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="rounded-lg border border-brand-600 bg-brand-100/50 px-4 py-3">
        {t('requested')}
      </p>
    );
  }

  if (orgs.length === 0) {
    return <p className="text-ink-700">{t('noOrgs')}</p>;
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      {error ? (
        <p role="alert" className="rounded-lg border border-danger-600 bg-danger-100 px-4 py-3 text-danger-600">
          {error}
        </p>
      ) : null}

      <SelectField
        label={t('pickOrg')}
        help={t('pickOrgHelp')}
        value={orgPublicId}
        onChange={(event) => setOrgPublicId(event.target.value)}
        options={orgs.map((org) => ({
          value: org.publicId,
          label: `${org.name} · ${typeLabel(org.type)}`,
        }))}
        required
      />

      <TextField
        label={t('refLabel')}
        help={t('refHelp')}
        value={membershipRef}
        onChange={(event) => setMembershipRef(event.target.value)}
        maxLength={60}
        autoComplete="off"
      />

      <Button type="submit" size="lg" busy={busy}>
        {t('requestFromInstitution')}
      </Button>
    </form>
  );
}
