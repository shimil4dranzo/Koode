import { describe, expect, it } from 'vitest';
import {
  isValidPhone,
  maskPhone,
  normalizePhone,
  phoneLogRef,
  redactPhonesInText,
  requirePhone,
} from '@/server/phone';

describe('normalizePhone', () => {
  it('accepts every spelling of the same number and produces one identity', () => {
    const spellings = [
      '9846012345',
      '09846012345',
      '+919846012345',
      '919846012345',
      '+91 98460 12345',
      '+91-98460-12345',
      '(+91) 9846 012 345',
      '  9846012345  ',
      '091 9846012345',
    ];

    const normalized = new Set(spellings.map((s) => normalizePhone(s)));

    // The whole point: one number, one Person row.
    expect(normalized.size).toBe(1);
    expect([...normalized][0]).toBe('+919846012345');
  });

  it.each([
    ['1234567890', 'does not start with 6-9'],
    ['5846012345', 'landline-style leading digit'],
    ['984601234', 'too short'],
    ['98460123456', 'too long'],
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['abcdefghij', 'letters'],
    ['+1 415 555 2671', 'non-Indian number'],
    ['+449846012345', 'wrong country code'],
  ])('rejects %s (%s)', (input) => {
    expect(normalizePhone(input)).toBeNull();
    expect(isValidPhone(input)).toBe(false);
  });

  it('accepts each valid Indian mobile prefix', () => {
    for (const prefix of ['6', '7', '8', '9']) {
      expect(normalizePhone(`${prefix}846012345`)).toBe(`+91${prefix}846012345`);
    }
  });

  it('throws from requirePhone on invalid input', () => {
    expect(() => requirePhone('nonsense')).toThrow('Invalid phone number');
    expect(requirePhone('9846012345')).toBe('+919846012345');
  });
});

describe('privacy helpers', () => {
  it('maskPhone never reveals more than the last four digits', () => {
    const masked = maskPhone('+919846012345');
    expect(masked).toContain('2345');
    expect(masked).not.toContain('9846');
    expect(masked).not.toContain('984601');
  });

  it('phoneLogRef discloses no digits at all but stays stable', () => {
    const ref = phoneLogRef('+919846012345');
    const again = phoneLogRef('+919846012345');

    expect(ref).toBe(again); // correlatable across log lines
    expect(ref).not.toMatch(/\d{4}/); // but leaks nothing
    expect(ref).not.toContain('9846');
    expect(phoneLogRef('+919846012346')).not.toBe(ref);
    expect(phoneLogRef(null)).toBe('phone:none');
  });

  it('redactPhonesInText scrubs numbers embedded in arbitrary strings', () => {
    const messages = [
      'Duplicate entry +919846012345 for key person.phone',
      'user 9846012345 failed',
      'contact 91-9846012345 now',
    ];

    for (const message of messages) {
      const cleaned = redactPhonesInText(message);
      expect(cleaned).toContain('[redacted-phone]');
      expect(cleaned).not.toMatch(/9846012345/);
    }
  });
});
