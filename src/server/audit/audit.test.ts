import { describe, expect, it } from 'vitest';
import { sanitizeMetadata } from '@/server/audit';

describe('audit metadata sanitisation', () => {
  it('redacts forbidden keys by name', () => {
    const clean = sanitizeMetadata({
      phone: '+919846012345',
      otp: '123456',
      token: 'secret-token',
      ipAddress: '10.0.0.1',
      requirementPublicId: 'abc123',
    });

    expect(clean).toEqual({
      phone: '[redacted]',
      otp: '[redacted]',
      token: '[redacted]',
      ipAddress: '[redacted]',
      requirementPublicId: 'abc123',
    });
  });

  it('scrubs a phone number pasted into an innocuous free-text field', () => {
    const clean = sanitizeMetadata({
      noteExcerpt: 'Call him on 9846012345, he is reliable',
    });

    expect(clean?.noteExcerpt).toBe('Call him on [redacted-phone], he is reliable');
  });

  it('refuses to log an internal primary key', () => {
    // BigInt is the internal id type. It has no business in the audit log,
    // which records public ids so it stays readable without joins.
    expect(sanitizeMetadata({ personId: 42n })).toEqual({
      personId: '[internal-id-omitted]',
    });
  });

  it('recurses into nested objects', () => {
    const clean = sanitizeMetadata({
      before: { phone: '+919846012345', status: 'open' },
      after: { status: 'filled' },
    });

    expect(clean).toEqual({
      before: { phone: '[redacted]', status: 'open' },
      after: { status: 'filled' },
    });
  });

  it('scrubs strings inside arrays', () => {
    expect(sanitizeMetadata({ notes: ['ring 9846012345', 'fine'] })).toEqual({
      notes: ['ring [redacted-phone]', 'fine'],
    });
  });

  it('passes through primitives and preserves undefined input', () => {
    expect(sanitizeMetadata({ count: 3, ok: true, missing: null })).toEqual({
      count: 3,
      ok: true,
      missing: null,
    });
    expect(sanitizeMetadata(undefined)).toBeUndefined();
  });
});
