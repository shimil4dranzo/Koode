/**
 * Turn a `mysql://` URL into the pool configuration the MariaDB driver wants.
 *
 * This exists because the driver adapter accepts either a bare connection
 * string or a pool config, and only the pool config lets us set a connection
 * limit. Parsing is done with the WHATWG URL parser so that a password
 * containing `@`, `/`, `#` or a percent-escape survives — the failure mode we
 * are actually guarding against, since it shows up as an authentication error
 * with no hint about the real cause.
 */

export type MysqlPoolConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export class InvalidDatabaseUrlError extends Error {
  constructor(message: string) {
    super(`Invalid DATABASE_URL: ${message}`);
    this.name = 'InvalidDatabaseUrlError';
  }
}

export function parseMysqlUrl(raw: string): MysqlPoolConfig {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidDatabaseUrlError('not a valid URL');
  }

  if (url.protocol !== 'mysql:') {
    throw new InvalidDatabaseUrlError(`expected protocol "mysql:", got "${url.protocol}"`);
  }

  // `pathname` is "/Koode" — strip exactly one leading slash. The schema name
  // is case-sensitive on Linux, so it is passed through untouched.
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    throw new InvalidDatabaseUrlError('no database name in the path');
  }
  if (database.includes('/')) {
    throw new InvalidDatabaseUrlError(`database name may not contain "/": "${database}"`);
  }

  const user = decodeURIComponent(url.username);
  if (!user) {
    throw new InvalidDatabaseUrlError('no username');
  }

  return {
    host: url.hostname || '127.0.0.1',
    port: url.port ? Number(url.port) : 3306,
    user,
    password: decodeURIComponent(url.password),
    database,
  };
}
