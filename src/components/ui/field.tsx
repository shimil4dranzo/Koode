import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * Form fields.
 *
 * These wrap native controls rather than replacing them. A native <select> on
 * Android opens the platform picker, which is bigger, scrolls properly, and
 * already works with TalkBack — every custom dropdown is a downgrade for these
 * users.
 *
 * Errors and help text are wired to the control with aria-describedby, and
 * errors use aria-live so a screen reader announces them without the user
 * hunting for what changed.
 */

const CONTROL_CLASSES =
  'w-full min-h-touch rounded-lg border bg-paper-raised px-3 py-2.5 text-base ' +
  'border-ink-300 placeholder:text-ink-500 ' +
  'aria-[invalid=true]:border-danger-600 aria-[invalid=true]:border-2';

type FieldShellProps = {
  label: string;
  /** Rendered under the control, before any error. */
  help?: string;
  error?: string;
  required?: boolean;
  children: (ids: { controlId: string; describedBy: string | undefined }) => ReactNode;
};

function FieldShell({ label, help, error, required, children }: FieldShellProps) {
  const base = useId();
  const controlId = `${base}-control`;
  const helpId = help ? `${base}-help` : undefined;
  const errorId = error ? `${base}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={controlId} className="text-base font-medium text-ink-900">
        {label}
        {required ? (
          <span className="ms-1 text-danger-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {children({ controlId, describedBy })}

      {help ? (
        <p id={helpId} className="text-sm text-ink-700">
          {help}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  help?: string;
  error?: string;
};

export function TextField({ label, help, error, className, ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} help={help} error={error} required={rest.required}>
      {({ controlId, describedBy }) => (
        <input
          id={controlId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(CONTROL_CLASSES, className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

export type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: string;
  help?: string;
  error?: string;
};

export function TextAreaField({
  label,
  help,
  error,
  className,
  rows = 4,
  ...rest
}: TextAreaFieldProps) {
  return (
    <FieldShell label={label} help={help} error={error} required={rest.required}>
      {({ controlId, describedBy }) => (
        <textarea
          id={controlId}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(CONTROL_CLASSES, 'min-h-28 resize-y', className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

export type SelectOption = { value: string; label: string };

export type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  help?: string;
  error?: string;
  options: SelectOption[];
  /** Shown as a non-selectable first entry when the field has no value yet. */
  placeholder?: string;
};

export function SelectField({
  label,
  help,
  error,
  options,
  placeholder,
  className,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldShell label={label} help={help} error={error} required={rest.required}>
      {({ controlId, describedBy }) => (
        <select
          id={controlId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(CONTROL_CLASSES, 'appearance-none pe-8', className)}
          {...rest}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}
