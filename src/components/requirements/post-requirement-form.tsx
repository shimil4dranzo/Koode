'use client';

import { useId, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ChipRadioGroup } from '@/components/ui/choice';
import { PageGlow } from '@/components/ui/decor';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { ApiError, api } from '@/lib/api';
import {
  CONTACT_PREFERENCES,
  ENGAGEMENT_TYPES,
  PAY_PERIODS,
} from '@/server/domain/constants';
import type { CategoryGroup } from '@/server/services/category.service';
import type { LocalityOption } from '@/server/services/locality.service';

/**
 * Posting work: one page, one screen of fields, one button.
 *
 * Explicitly not a wizard. The brief requires posting to take under a minute,
 * and a wizard turns four required fields into four screens, four taps and four
 * chances to abandon. Only the first four are required; everything below them
 * can be left alone.
 *
 * The inputs are uncontrolled and read from FormData on submit. There is no
 * cross-field behaviour to synchronise, and it means a rejected submission
 * comes back with everything the employer typed still in the boxes.
 */

export function PostRequirementForm({
  localities,
  categoryGroups,
  needsContactPhone,
  needsContactEmail,
  accountEmail,
}: {
  localities: LocalityOption[];
  categoryGroups: CategoryGroup[];
  /** True when the poster has nothing on file yet — the fields show once. */
  needsContactPhone: boolean;
  needsContactEmail: boolean;
  /** Prefills the contact address, so confirming it is one tap. */
  accountEmail: string;
}) {
  const t = useTranslations('requirements');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const tEngagement = useTranslations('taxonomy.engagementType');
  const tPayPeriod = useTranslations('taxonomy.payPeriod');
  const tContact = useTranslations('taxonomy.contactPreference');
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  /**
   * Field errors arrive as a message key when a schema names one and as Zod's
   * own English text when it does not. Anything that is not a key we can
   * translate becomes the generic message, because English prose in the middle
   * of a Malayalam form is worse than a vague sentence in Malayalam.
   */
  function fieldMessage(name: string): string | undefined {
    const raw = fieldError[name];
    if (raw === undefined) return undefined;
    if (!raw.startsWith('errors.')) return tErrors('validationFailed');
    try {
      return tErrors(raw.replace(/^errors\./, '') as never);
    } catch {
      return tErrors('validationFailed');
    }
  }

  function showError(caught: unknown): void {
    if (!(caught instanceof ApiError)) {
      setError(tErrors('unexpected'));
      return;
    }
    setFieldError(caught.fields);
    if (caught.code === 'RATE_LIMITED') {
      setError(tErrors('tooManyRequests'));
      return;
    }
    try {
      setError(tErrors(caught.messageKey.replace(/^errors\./, '') as never));
    } catch {
      setError(tErrors('unexpected'));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const text = (name: string): string => String(data.get(name) ?? '').trim();
    // An empty box means "not stated", never zero — z.coerce would read '' as 0
    // and publish a job paying nothing.
    const amount = (name: string): number | null =>
      text(name) === '' ? null : Number(text(name));

    setBusy(true);
    setError(null);
    setFieldError({});

    try {
      const result = await api.post<{ publicId: string }>('/api/requirements', {
        contactPhone: text('contactPhone') || null,
        contactEmail: text('contactEmail') || null,
        title: text('title'),
        categoryPublicId: text('categoryPublicId'),
        localityPublicId: text('localityPublicId'),
        engagementType: text('engagementType'),
        description: text('description'),
        payMin: amount('payMin'),
        payMax: amount('payMax'),
        payPeriod: text('payPeriod') || null,
        vacancies: Number(text('vacancies') || '1'),
        contactPreference: text('contactPreference'),
      });

      // Straight to the posting, so the employer sees exactly what a candidate
      // will see. `busy` stays true: the navigation is the end of this form.
      router.push(`/openings/${result.publicId}`);
      return;
    } catch (caught) {
      showError(caught);
    }

    setBusy(false);
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="relative mx-auto w-full max-w-3xl px-4 py-8">
      <PageGlow />
      <h1 className="text-2xl font-semibold sm:text-3xl">{t('postTitle')}</h1>
      <p className="mt-2 text-ink-700">{t('postSubtitle')}</p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger-600 bg-danger-100 px-4 py-3 text-danger-600"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-5">
        {needsContactEmail ? (
          // Prefilled with the account address but stored separately, so
          // changing where you sign in never silently changes what
          // candidates see — and the login e-mail is never a reveal target.
          <TextField
            label={t('fieldContactEmail')}
            help={t('fieldContactEmailHelp')}
            name="contactEmail"
            error={fieldMessage('contactEmail')}
            type="email"
            inputMode="email"
            autoComplete="email"
            defaultValue={accountEmail}
            maxLength={255}
            required
          />
        ) : null}

        {needsContactPhone ? (
          // Candidates reach an employer by phone, so the first posting has
          // to put a number on file. Asked once, saved to the profile,
          // never shown anywhere except the audited reveal.
          <TextField
            label={t('fieldContactPhone')}
            help={t('fieldContactPhoneHelp')}
            name="contactPhone"
            error={fieldMessage('contactPhone')}
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            pattern="[0-9+()\s-]{10,17}"
            maxLength={17}
            required
          />
        ) : null}

        <TextField
          label={t('fieldTitle')}
          name="title"
          error={fieldMessage('title')}
          placeholder={t('fieldTitlePlaceholder')}
          maxLength={160}
          required
          autoFocus
        />

        <CategorySelect groups={categoryGroups} error={fieldMessage('categoryPublicId')} />

        <SelectField
          label={t('fieldLocality')}
          name="localityPublicId"
          error={fieldMessage('localityPublicId')}
          placeholder={tCommon('choose')}
          defaultValue=""
          options={localities.map((locality) => ({
            value: locality.publicId,
            label: locality.label,
          }))}
          required
        />

        {/* Four options that all fit on screen: chips, not a menu. One tap
            instead of open-scroll-pick, and the choice stays visible. */}
        <ChipRadioGroup
          legend={t('fieldEngagementType')}
          name="engagementType"
          error={fieldMessage('engagementType')}
          options={ENGAGEMENT_TYPES.map((value) => ({ value, label: tEngagement(value) }))}
          required
        />

        <TextAreaField
          label={t('fieldDescription')}
          name="description"
          error={fieldMessage('description')}
          placeholder={t('fieldDescriptionPlaceholder')}
          maxLength={4000}
        />

        <fieldset>
          <legend className="text-base font-medium text-ink-900">{t('fieldPay')}</legend>

          {/* Two across at 360px; the period gets its own line there, because
              "ജോലിക്ക് മൊത്തം" does not fit in a third of a small screen. */}
          <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <TextField
              label={t('fieldPayMin')}
              name="payMin"
              error={fieldMessage('payMin')}
              type="number"
              inputMode="numeric"
              min={0}
              max={99999999}
              step={1}
            />
            <TextField
              label={t('fieldPayMax')}
              name="payMax"
              error={fieldMessage('payMax')}
              type="number"
              inputMode="numeric"
              min={0}
              max={99999999}
              step={1}
            />
            <div className="col-span-2 sm:col-span-1">
              <SelectField
                label={t('fieldPayPeriod')}
                name="payPeriod"
                error={fieldMessage('payPeriod')}
                placeholder={tCommon('none')}
                defaultValue=""
                options={PAY_PERIODS.map((value) => ({ value, label: tPayPeriod(value) }))}
              />
            </div>
          </div>

          <p className="mt-1.5 text-sm text-ink-700">{t('fieldPayHelp')}</p>
        </fieldset>

        <TextField
          label={t('fieldVacancies')}
          name="vacancies"
          error={fieldMessage('vacancies')}
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          step={1}
          defaultValue={1}
        />

        <ChipRadioGroup
          legend={t('fieldContactPreference')}
          name="contactPreference"
          error={fieldMessage('contactPreference')}
          defaultValue="call"
          options={CONTACT_PREFERENCES.map((value) => ({ value, label: tContact(value) }))}
        />

        <Button type="submit" size="lg" busy={busy}>
          {t('publish')}
        </Button>
      </div>
    </form>
  );
}

/**
 * The category picker, written out rather than using `SelectField`.
 *
 * Fifty roles in a flat list is unusable on a phone, and the four tiers are how
 * people already describe the work — which needs <optgroup>, which the shared
 * field does not model. The label, description and invalid wiring are kept
 * identical to it so a screen reader cannot tell the two apart.
 */
function CategorySelect({ groups, error }: { groups: CategoryGroup[]; error?: string }) {
  const t = useTranslations('requirements');
  const tCommon = useTranslations('common');
  const base = useId();
  const controlId = `${base}-control`;
  const errorId = error ? `${base}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={controlId} className="text-base font-medium text-ink-900">
        {t('fieldCategory')}
        <span className="ms-1 text-danger-600" aria-hidden="true">
          *
        </span>
      </label>

      <select
        id={controlId}
        name="categoryPublicId"
        required
        defaultValue=""
        aria-describedby={errorId}
        aria-invalid={error ? true : undefined}
        className="w-full min-h-touch appearance-none rounded-lg border border-ink-300 bg-paper-raised px-3 py-2.5 pe-8 text-base placeholder:text-ink-500 aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger-600"
      >
        <option value="">{tCommon('choose')}</option>
        {groups.map((group) => (
          <optgroup key={group.publicId} label={group.label}>
            {group.roles.map((role) => (
              <option key={role.publicId} value={role.publicId}>
                {role.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
