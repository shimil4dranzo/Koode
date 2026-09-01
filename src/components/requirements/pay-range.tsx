import { useFormatter, useTranslations } from 'next-intl';
import type { PayPeriod } from '@/server/domain/constants';

/**
 * Money, rendered.
 *
 * Shared by the list and the detail page so the two never drift: an employer
 * who saw "₹500 – ₹800 per day" in the results must see the same words after
 * tapping through, or the posting looks like it changed.
 *
 * `payMin`/`payMax` arrive as decimal strings — see the note on
 * `decimalToString` in requirement.service.ts — and are only turned into
 * numbers here, at the last possible moment, for Intl.
 */

export type PayRangeProps = {
  payMin: string | null;
  payMax: string | null;
  payPeriod: PayPeriod | null;
  className?: string;
};

function toAmount(value: string | null): number | null {
  if (value === null) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function PayRange({ payMin, payMax, payPeriod, className }: PayRangeProps) {
  // The named 'currency' format is declared once in i18n/request.ts (INR, no
  // paise) so every price on the site rounds the same way.
  const format = useFormatter();
  const t = useTranslations('taxonomy.payPeriod');

  const min = toAmount(payMin);
  const max = toAmount(payMax);
  if (min === null && max === null) return null;

  let amount: string;
  if (min !== null && max !== null && max !== min) {
    amount = `${format.number(min, 'currency')} – ${format.number(max, 'currency')}`;
  } else if (min !== null && max === null) {
    // A floor with no ceiling. The "+" says "at least this" without inventing
    // an upper figure the employer never gave.
    amount = `${format.number(min, 'currency')}+`;
  } else {
    amount = format.number((min ?? max) as number, 'currency');
  }

  return (
    <span className={className}>{payPeriod ? `${amount} ${t(payPeriod)}` : amount}</span>
  );
}
