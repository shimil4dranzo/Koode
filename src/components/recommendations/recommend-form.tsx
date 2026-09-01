'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { ApiError, api } from '@/lib/api';
import { useApiMessages } from '@/lib/api-messages';
import { RELATIONSHIP_CONTEXTS } from '@/server/domain/constants';
import type { CategoryGroup } from '@/server/services/category.service';

/**
 * Write a recommendation.
 *
 * The most consequential form in the product, in two directions at once: the
 * referrer is staking their name, and the person being written about may have
 * never heard of Koode.
 *
 * Three things are therefore said plainly on the form rather than buried in a
 * policy page:
 *
 *  - the note cannot be edited afterwards
 *  - the person will be told who recommended them and what was written
 *  - nothing is published until they agree
 *
 * A referrer who is surprised by any of those later has been misled by us.
 */

type Props = {
  categories: CategoryGroup[];
  /** Off until a real SMS provider exists — see ARCHITECTURE.md. */
  canRecommendNonUsers: boolean;
};

type CreateResult = {
  publicId: string;
  invitedSubject: { maskedPhone: string; displayName: string } | null;
};

export function RecommendForm({ categories, canRecommendNonUsers }: Props) {
  const t = useTranslations('recommendations');
  const tTaxonomy = useTranslations('taxonomy');
  const tCommon = useTranslations('common');
  const { message: apiMessage, fieldMessage, focusFirstInvalid } = useApiMessages();
  const router = useRouter();

  const [subjectPhone, setSubjectPhone] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [relationshipContext, setRelationshipContext] = useState('');
  const [categoryPublicId, setCategoryPublicId] = useState('');
  const [note, setNote] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [invited, setInvited] = useState<CreateResult['invitedSubject']>(null);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    setFieldError({});

    try {
      const result = await api.post<CreateResult>('/api/recommendations', {
        subjectPhone,
        subjectName,
        relationshipContext,
        categoryPublicId: categoryPublicId || null,
        note,
      });

      if (result.invitedSubject) {
        // They are not on Koode. Say so explicitly rather than showing a
        // success message that implies the recommendation is live.
        setInvited(result.invitedSubject);
        return;
      }

      router.push(`/people/${result.publicId}`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldError(caught.fields);
        if (Object.keys(caught.fields).length > 0) focusFirstInvalid();
      }
      setError(apiMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (invited) {
    return (
      <Card>
        <p className="text-lg">{t('pendingInvite', { name: invited.displayName })}</p>
        <p className="mt-2 text-sm text-ink-700">{invited.maskedPhone}</p>
        <Button className="mt-5" size="lg" onClick={() => router.push('/profile')}>
          {tCommon('close')}
        </Button>
      </Card>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-5"
    >
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-2 text-ink-700">{t('subtitle')}</p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-600 bg-danger-100 px-4 py-3 text-danger-600"
        >
          {error}
        </p>
      ) : null}

      {!canRecommendNonUsers ? (
        // Stated up front rather than as a failure after they have written a
        // paragraph about somebody.
        <p className="rounded-lg border border-warn-600 bg-warn-100 px-4 py-3 text-sm">
          {t('nonUsersDisabledNotice')}
        </p>
      ) : null}

      <TextField
        label={t('subjectPhone')}
        help={t('subjectPhoneHelp')}
        error={fieldMessage(fieldError, 'subjectPhone')}
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9+()\s-]{10,17}"
        maxLength={17}
        value={subjectPhone}
        onChange={(event) => setSubjectPhone(event.target.value)}
        required
      />

      <TextField
        label={t('subjectName')}
        error={fieldMessage(fieldError, 'subjectName')}
        autoComplete="off"
        value={subjectName}
        onChange={(event) => setSubjectName(event.target.value)}
        required
      />

      <SelectField
        label={t('relationshipLabel')}
        error={fieldMessage(fieldError, 'relationshipContext')}
        placeholder={tCommon('choose')}
        options={RELATIONSHIP_CONTEXTS.map((context) => ({
          value: context,
          label: tTaxonomy(`relationshipContext.${context}` as never),
        }))}
        value={relationshipContext}
        onChange={(event) => setRelationshipContext(event.target.value)}
        required
      />

      {/*
        Grouped by tier. A flat list of fifty roles is unusable on a phone, and
        the four tiers are how people already think about the work.
      */}
      <label className="flex flex-col gap-1.5">
        <span className="text-base font-medium">
          {t('categoryLabel')}{' '}
          <span className="font-normal text-ink-500">({tCommon('optional')})</span>
        </span>
        <select
          value={categoryPublicId}
          onChange={(event) => setCategoryPublicId(event.target.value)}
          className="min-h-touch w-full rounded-lg border border-ink-300 bg-paper-raised px-3 py-2.5 text-base"
        >
          <option value="">{tCommon('none')}</option>
          {categories.map((group) => (
            <optgroup key={group.publicId} label={group.label}>
              {group.roles.map((role) => (
                <option key={role.publicId} value={role.publicId}>
                  {role.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <TextAreaField
        label={t('noteLabel')}
        help={t('noteHelp')}
        error={fieldMessage(fieldError, 'note')}
        placeholder={t('notePlaceholder')}
        rows={5}
        maxLength={2000}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        required
      />

      <Button type="submit" size="lg" busy={busy}>
        {t('submit')}
      </Button>
    </form>
  );
}
