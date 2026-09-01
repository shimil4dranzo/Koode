import { createId, isCuid } from '@paralleldrive/cuid2';

/**
 * Public identifiers.
 *
 * Every table has an internal BIGINT AUTO_INCREMENT primary key — sequential,
 * so InnoDB appends rather than splitting pages — and a separate public id
 * used in URLs and API responses. The internal id is never exposed: a
 * sequential id in a URL tells a competitor how many people have registered,
 * and lets anyone walk the whole dataset by counting upwards.
 *
 * cuid2 rather than UUIDv4 or ULID: it is collision-resistant, non-sequential,
 * and shorter in a URL than either. It is only ever a secondary index, so its
 * randomness costs nothing on insert.
 */

/** 24 characters — the library default, and plenty at this scale. */
export function newPublicId(): string {
  return createId();
}

export function isPublicId(value: unknown): value is string {
  return typeof value === 'string' && isCuid(value);
}
