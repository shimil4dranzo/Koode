import { describe, expect, it } from 'vitest';
import { InvalidDatabaseUrlError, parseMysqlUrl } from '@/server/db/connection-url';

describe('parseMysqlUrl', () => {
  it('parses a plain development URL', () => {
    expect(parseMysqlUrl('mysql://root:secret@127.0.0.1:3306/Koode')).toEqual({
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: 'secret',
      database: 'Koode',
    });
  });

  it('preserves the capitalisation of the schema name', () => {
    // On Linux, database names are case-sensitive. Lower-casing this here
    // would produce a "works on my Mac" failure on the server.
    expect(parseMysqlUrl('mysql://u:p@db:3306/Koode').database).toBe('Koode');
  });

  it('decodes a password containing URL-significant characters', () => {
    // The real failure this guards: a generated password with @ / # : in it
    // silently truncating and surfacing only as "access denied".
    const password = 'p@ss/w#rd:1?2&3';
    const url = `mysql://root:${encodeURIComponent(password)}@127.0.0.1:3306/Koode`;

    expect(parseMysqlUrl(url).password).toBe(password);
    expect(parseMysqlUrl(url).host).toBe('127.0.0.1');
  });

  it('defaults the port to 3306 when omitted', () => {
    expect(parseMysqlUrl('mysql://root:pw@localhost/Koode').port).toBe(3306);
  });

  it.each([
    ['postgres://root:pw@localhost:5432/Koode', 'wrong protocol'],
    ['mysql://root:pw@localhost:3306/', 'no database name'],
    ['mysql://@localhost:3306/Koode', 'no username'],
    ['not a url at all', 'unparseable'],
  ])('rejects %s (%s)', (url) => {
    expect(() => parseMysqlUrl(url)).toThrow(InvalidDatabaseUrlError);
  });
});
