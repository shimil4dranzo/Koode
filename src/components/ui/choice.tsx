import type { ChangeEvent } from 'react';
import { cn } from '@/lib/cn';

/**
 * Chips and switches — the "one tap instead of open-a-menu" controls.
 *
 * Both are native inputs underneath. A `<select>` is the right control for
 * fifty categories; it is the wrong control for four engagement types, where
 * opening a picker to see options that would all fit on screen is pure
 * friction. Chips show every option at once, each a 44px target.
 *
 * The real input is visually hidden (`sr-only`) and the styled element is a
 * sibling, so keyboard, screen reader, form submission and GET-form usage all
 * behave exactly like the native control — because it is the native control.
 */

export type ChipOption = { value: string; label: string };

const CHIP_CLASSES =
  // Base
  'inline-flex min-h-touch items-center rounded-full border border-ink-300 ' +
  'bg-paper-raised px-4 text-base transition-colors select-none ' +
  'hover:bg-ink-100 motion-safe:active:scale-[0.97] ' +
  // Checked: brand fill. White on brand-600 measures 5.59:1.
  'peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white ' +
  'peer-checked:font-medium peer-checked:hover:bg-brand-700 ' +
  // The input is sr-only, so its focus ring must appear on this element.
  'peer-focus-visible:outline peer-focus-visible:outline-[3px] ' +
  'peer-focus-visible:outline-verify-600 peer-focus-visible:outline-offset-2';

export function ChipRadioGroup({
  legend,
  name,
  options,
  value,
  defaultValue,
  onChange,
  required = false,
  error,
  className,
}: {
  legend: string;
  name: string;
  options: ChipOption[];
  /** Controlled usage (client forms). */
  value?: string;
  onChange?: (value: string) => void;
  /** Uncontrolled usage (GET forms, FormData forms). */
  defaultValue?: string;
  required?: boolean;
  error?: string;
  className?: string;
}) {
  const controlled = value !== undefined;

  return (
    <fieldset className={cn('flex flex-col gap-1.5', className)}>
      <legend className="text-base font-medium text-ink-900">
        {legend}
        {required ? (
          <span className="ms-1 text-danger-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </legend>

      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option.value}
              className="peer sr-only"
              // Controlled and uncontrolled are mutually exclusive in React;
              // pass exactly one or it warns and misbehaves.
              {...(controlled
                ? {
                    checked: value === option.value,
                    onChange: (event: ChangeEvent<HTMLInputElement>) =>
                      onChange?.(event.target.value),
                  }
                : { defaultChecked: defaultValue === option.value })}
              required={required}
            />
            <span className={CHIP_CLASSES}>{option.label}</span>
          </label>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * An on/off switch. For a boolean that changes what a search or form does —
 * "include nearby places" — a switch reads faster than a bare checkbox and
 * gives a 48×28 target instead of a 20px square.
 */
export function Switch({
  label,
  name,
  value = 'true',
  checked,
  defaultChecked,
  onChange,
  className,
}: {
  label: string;
  name: string;
  value?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
}) {
  const controlled = checked !== undefined;

  return (
    <label
      className={cn(
        'flex min-h-touch cursor-pointer items-center justify-between gap-3',
        className,
      )}
    >
      <span className="text-base">{label}</span>

      <input
        type="checkbox"
        name={name}
        value={value}
        className="peer sr-only"
        {...(controlled
          ? {
              checked,
              onChange: (event: ChangeEvent<HTMLInputElement>) =>
                onChange?.(event.target.checked),
            }
          : { defaultChecked })}
      />

      {/* The track. Off-state ink-300 measures 3:1 against the page, so the
          control is findable before it is touched. */}
      <span
        aria-hidden="true"
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full bg-ink-300 transition-colors',
          'peer-checked:bg-brand-600',
          'peer-focus-visible:outline peer-focus-visible:outline-[3px]',
          'peer-focus-visible:outline-verify-600 peer-focus-visible:outline-offset-2',
          // The thumb.
          'after:absolute after:start-0.5 after:top-0.5 after:size-6',
          'after:rounded-full after:bg-white after:shadow-sm',
          'after:transition-transform motion-reduce:after:transition-none',
          'peer-checked:after:translate-x-5',
        )}
      />
    </label>
  );
}
