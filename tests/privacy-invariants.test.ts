import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural enforcement of the Section 6 privacy rules.
 *
 * These are the rules the product's premise rests on, and until now they were
 * held in place only by discipline and code review. Discipline does not
 * survive three years and a change of maintainer; a failing test does.
 *
 * The checks are deliberately blunt — they read the source and look for
 * patterns. A blunt check that fires is worth more than a subtle one nobody
 * writes.
 */

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

function relative(path: string): string {
  return path.replace(`${process.cwd()}/`, '');
}

const ALL_FILES = sourceFiles(SRC);
const read = (path: string) => readFileSync(path, 'utf8');

describe('phone numbers never leave the audited path', () => {
  /**
   * The complete list of places allowed to select `Person.phone` from the
   * database. Adding a file here should require an argument, which is the
   * point of the list existing.
   */
  const ALLOWED_TO_SELECT_PHONE = new Set([
    // The one reveal path, rate-limited and audited.
    'src/server/services/requirement.service.ts',
    // Authentication: resolving a number to a person, and the claim flow,
    // which must send an SMS to it.
    'src/server/services/auth.service.ts',
    'src/server/services/claim.service.ts',
    'src/server/services/recommendation.service.ts',
    // A person's own data: the masked number on their settings page, and the
    // export, which returns it only to its owner.
    'src/server/services/person.service.ts',
    // Reads the column solely to derive CurrentPerson.hasContactPhone — the
    // boolean crosses to the UI, the number does not (the type has no field
    // for it, which the assertion below continues to enforce).
    'src/server/auth/session.ts',
  ]);

  it('only the listed services select a phone number', () => {
    const offenders = ALL_FILES.filter((file) => {
      if (ALLOWED_TO_SELECT_PHONE.has(relative(file))) return false;
      // Matches `phone: true` / `contactEmail: true` inside a Prisma
      // `select` — the only ways an employer's contact details get read out
      // of the database. Both are reveal-only.
      return /\b(phone|contactEmail):\s*true\b/.test(read(file));
    }).map(relative);

    expect(
      offenders,
      `These files select a contact detail (phone / contactEmail) but are not\n` +
        `on the allow-list in this test.\n` +
        `A phone number must never reach a list response, a Server Component's\n` +
        `props, or a client bundle. If the new use is genuinely the audited\n` +
        `reveal path, add it to ALLOWED_TO_SELECT_PHONE with a comment saying why.\n\n` +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it('no Client Component imports a service that can read a phone number', () => {
    // A `'use client'` file importing a service would pull server code — and
    // potentially a phone number — into the browser bundle.
    const clientFiles = ALL_FILES.filter((file) => {
      const source = read(file);
      return source.startsWith("'use client'") || source.startsWith('"use client"');
    });

    const offenders = clientFiles
      .filter((file) => /from '@\/server\/services\//.test(read(file)))
      .filter((file) => {
        // Importing only a TYPE is erased at compile time and is safe.
        const imports = read(file).match(/^import .*from '@\/server\/services\/.*$/gm) ?? [];
        return imports.some((line) => !line.includes('import type'));
      })
      .map(relative);

    expect(
      offenders,
      `Client Components must not import service modules as values:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('the session object exposes no phone number', () => {
    const session = read(join(SRC, 'server', 'auth', 'session.ts'));

    // CurrentPerson is passed into Server Components and can end up serialised
    // into the page. The absence of a phone field is what makes that safe.
    const currentPerson = session.slice(
      session.indexOf('export type CurrentPerson'),
      session.indexOf('export type RequestMeta'),
    );

    expect(currentPerson).not.toMatch(/^\s*phone[?]?:/m);
  });
});

describe('the audit log is append-only', () => {
  it('nothing updates or deletes an audit event', () => {
    const offenders = ALL_FILES.filter((file) =>
      /auditEvent\.(update|updateMany|delete|deleteMany|upsert)\b/.test(read(file)),
    ).map(relative);

    expect(
      offenders,
      `The audit log must be append-only — if it can be edited it is not evidence:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

describe('recommendation notes are immutable', () => {
  it('nothing writes to the note field after creation', () => {
    // Correcting a recommendation means withdrawing it and writing a new one,
    // so the history shows a change of mind rather than a silent rewrite.
    const services = ALL_FILES.filter((file) => relative(file).includes('services/'));

    const offenders = services
      .filter((file) => {
        const source = read(file);
        // `recommendation.update(...)` blocks that mention `note:` — the
        // create path uses `.create`, which this does not match.
        const updates = source.match(/recommendation\.update\w*\(\{[\s\S]{0,400}?\}\)/g) ?? [];
        return updates.some((block) => /\bnote:\s/.test(block));
      })
      .map(relative);

    expect(
      offenders,
      `A recommendation note was updated after creation:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

describe('people are never hard-deleted', () => {
  it('nothing calls delete on the person table', () => {
    // Deletion anonymises so that recommendation history stays statistically
    // intact and the audit trail keeps no holes.
    const offenders = ALL_FILES.filter((file) =>
      /\bperson\.delete(Many)?\s*\(/.test(read(file)),
    ).map(relative);

    expect(
      offenders,
      `Person rows must be anonymised, never deleted:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
