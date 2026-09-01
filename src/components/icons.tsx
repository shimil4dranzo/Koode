import type { SVGProps } from 'react';

/**
 * The icon set: hand-drawn inline SVG, one visual language — 24-box, 2px
 * stroke, rounded caps — so every glyph on the page matches the K in the logo.
 *
 * Deliberately not an icon library. Eight glyphs do not justify a dependency,
 * and inline SVG inherits `currentColor`, costs no request, and cannot arrive
 * after the text the way a font icon can.
 *
 * All decorative: every use sits next to a visible label, so each svg is
 * aria-hidden and screen readers hear only the words.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** A spoken word made permanent — the recommendation itself. */
export function IconVouch(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3.1-.4-4.4-1.2L3 20l1.2-5.1A8.5 8.5 0 1 1 21 11.5Z" />
      <path d="m9 11.5 2 2 4-4" />
    </Icon>
  );
}

export function IconShield(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 5 6v5c0 4.5 3 8.2 7 9.5 4-1.3 7-5 7-9.5V6l-7-3Z" />
      <path d="m9.5 12 2 2 3.5-3.5" />
    </Icon>
  );
}

export function IconBriefcase(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M3 12.5h18" />
    </Icon>
  );
}

export function IconWrench(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.5 6.5a4 4 0 0 0-5.6 4.7L4 16.1a2 2 0 1 0 2.8 2.8l4.9-4.9a4 4 0 0 0 4.7-5.6L13.5 11l-2.6-2.6 3.6-1.9Z" />
    </Icon>
  );
}

export function IconStore(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10v9h16v-9" />
      <path d="M3 6.5 5 4h14l2 2.5a2.3 2.3 0 0 1-4.5.8A2.3 2.3 0 0 1 12 7a2.3 2.3 0 0 1-4.5.3A2.3 2.3 0 0 1 3 6.5Z" />
      <path d="M9.5 19v-5h5v5" />
    </Icon>
  );
}

export function IconSprout(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20v-7" />
      <path d="M12 13c0-3.5 2.5-6 6.5-6 0 3.5-2.5 6-6.5 6Z" />
      <path d="M12 11C12 8 10 5.5 5.5 5.5 5.5 9 8 11 12 11Z" />
      <path d="M6 20h12" />
    </Icon>
  );
}

export function IconMapPin(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21s-6.5-5.3-6.5-10.2a6.5 6.5 0 0 1 13 0C18.5 15.7 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.3" />
    </Icon>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </Icon>
  );
}
