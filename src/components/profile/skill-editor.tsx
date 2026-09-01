'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/field';
import { api } from '@/lib/api';
import { useApiMessages } from '@/lib/api-messages';
import type { CategoryGroup } from '@/server/services/category.service';

export type EditableSkill = {
  categoryPublicId: string;
  label: string;
  yearsExperience: number | null;
  qualificationNote: string | null;
};

/**
 * Add and remove the kinds of work a person does.
 *
 * Interactive because adding three skills should be three taps on one screen,
 * not three page loads. The list is re-read from the server after each change
 * (`router.refresh()`) rather than patched locally, so what is on screen is
 * what the database holds — a skill that failed to save must not linger
 * looking saved.
 *
 * Removing is not behind a confirmation: it is one tap to add the same row
 * back, and an "are you sure" on every line would train people to dismiss the
 * one that matters, on the delete-account control below it.
 */
export function SkillEditor({
  skills,
  categoryGroups,
}: {
  skills: EditableSkill[];
  categoryGroups: CategoryGroup[];
}) {
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');
  const tRequirements = useTranslations('requirements');
  const { message: apiMessage } = useApiMessages();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listed = new Set(skills.map((skill) => skill.categoryPublicId));

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(apiMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function add(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string): string => String(data.get(name) ?? '').trim();

    void run(async () => {
      await api.post('/api/me/skills', {
        categoryPublicId: text('categoryPublicId'),
        // Empty means "not stated", never zero.
        yearsExperience: text('yearsExperience') === '' ? null : Number(text('yearsExperience')),
        qualificationNote: text('qualificationNote') || null,
      });
      form.reset();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-600 bg-danger-100 px-4 py-3 text-danger-600"
        >
          {error}
        </p>
      ) : null}

      {skills.length === 0 ? (
        <p className="text-ink-700">{t('noSkills')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {skills.map((skill) => (
            <li
              key={skill.categoryPublicId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-ink-200 bg-paper-raised px-4 py-2"
            >
              <span className="font-medium">{skill.label}</span>

              {skill.yearsExperience === null ? null : (
                <span className="text-sm text-ink-700">
                  {t('yearsCount', { count: skill.yearsExperience })}
                </span>
              )}

              {skill.qualificationNote ? (
                <span className="text-sm text-ink-700">{skill.qualificationNote}</span>
              ) : null}

              <Button
                variant="quiet"
                busy={busy}
                className="ms-auto"
                // The accessible name extends the visible word rather than
                // replacing it, so voice control still reaches this button by
                // the word printed on it.
                aria-label={t('removeSkill', { skill: skill.label })}
                onClick={() =>
                  void run(() => api.delete(`/api/me/skills/${skill.categoryPublicId}`))
                }
              >
                {tCommon('delete')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <form onSubmit={add} className="flex flex-col gap-4">
          {/*
           * Written out rather than using SelectField because fifty roles in a
           * flat list is unusable on a phone, which needs <optgroup>. Already
           * listed categories are dropped from the options: re-picking one
           * would silently overwrite the row rather than add anything.
           */}
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-medium text-ink-900">
              {tRequirements('fieldCategory')}
            </span>
            <select
              name="categoryPublicId"
              required
              defaultValue=""
              className="w-full min-h-touch appearance-none rounded-lg border border-ink-300 bg-paper-raised px-3 py-2.5 pe-8 text-base"
            >
              <option value="">{tCommon('choose')}</option>
              {categoryGroups.map((group) => {
                const available = group.roles.filter((role) => !listed.has(role.publicId));
                // A tier whose every role is already listed would otherwise
                // render as an empty heading in the platform picker.
                if (available.length === 0) return null;

                return (
                  <optgroup key={group.publicId} label={group.label}>
                    {available.map((role) => (
                      <option key={role.publicId} value={role.publicId}>
                        {role.label}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('yearsExperience')}
              name="yearsExperience"
              type="number"
              inputMode="numeric"
              min={0}
              max={70}
              step={1}
            />
            <TextField
              label={t('qualification')}
              name="qualificationNote"
              placeholder={t('qualificationPlaceholder')}
              maxLength={200}
            />
          </div>

          <Button type="submit" size="lg" busy={busy}>
            {t('addSkill')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
