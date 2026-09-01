import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createId } from '@paralleldrive/cuid2';
import {
  db,
  disconnect,
  hasDatabase,
  makeCategory,
  makeLocality,
  makePerson,
  resetDatabase,
} from './helpers';

/**
 * Database-level verification of the invariants that the unit tests can only
 * check in application code.
 *
 * The one that genuinely needs a real MySQL is one-active-recommendation-per
 * -pair. MySQL has no partial unique indexes, so it is emulated with a
 * nullable mirrored key, and that trick either works against the real engine
 * or it does not — no mock can tell us.
 */

const describeIfDb = hasDatabase ? describe : describe.skip;

if (!hasDatabase) {
  console.warn(
    '\n[integration] TEST_DATABASE_URL is not set — skipping database tests.\n' +
      '  Run them with: TEST_DATABASE_URL=mysql://root:pw@127.0.0.1:3306/Koode npm run test:integration\n',
  );
}

describeIfDb('recommendation constraints (real MySQL)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await disconnect();
  });

  it('refuses a second ACTIVE recommendation for the same pair', async () => {
    const referrer = await makePerson();
    const subject = await makePerson();

    await db().recommendation.create({
      data: {
        publicId: createId(),
        referrerPersonId: referrer.id,
        subjectPersonId: subject.id,
        note: 'നല്ല പണിക്കാരൻ, സമയത്ത് വരും',
        relationshipContext: 'employed_them',
        status: 'active',
        activeSubjectKey: subject.id,
      },
    });

    // The database itself must reject this, not just the domain layer.
    await expect(
      db().recommendation.create({
        data: {
          publicId: createId(),
          referrerPersonId: referrer.id,
          subjectPersonId: subject.id,
          note: 'A second active vouch for the same person',
          relationshipContext: 'known_locally',
          status: 'active',
          activeSubjectKey: subject.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('permits many WITHDRAWN recommendations for the same pair', async () => {
    const referrer = await makePerson();
    const subject = await makePerson();

    // Notes are immutable, so a referrer who corrects themselves repeatedly
    // accumulates withdrawn rows. Many NULLs must coexist under the unique
    // index or the correction path breaks on the second attempt.
    for (let i = 0; i < 3; i += 1) {
      await db().recommendation.create({
        data: {
          publicId: createId(),
          referrerPersonId: referrer.id,
          subjectPersonId: subject.id,
          note: `Withdrawn attempt number ${i}`,
          relationshipContext: 'employed_them',
          status: 'withdrawn',
          activeSubjectKey: null,
          withdrawnAt: new Date(),
        },
      });
    }

    const count = await db().recommendation.count({
      where: { referrerPersonId: referrer.id, subjectPersonId: subject.id },
    });
    expect(count).toBe(3);

    // And a fresh active one is still allowed on top of them.
    await expect(
      db().recommendation.create({
        data: {
          publicId: createId(),
          referrerPersonId: referrer.id,
          subjectPersonId: subject.id,
          note: 'The corrected version of what I meant to say',
          relationshipContext: 'employed_them',
          status: 'active',
          activeSubjectKey: subject.id,
        },
      }),
    ).resolves.toBeDefined();
  });

  it('allows the same subject to be recommended by different referrers', async () => {
    const subject = await makePerson();
    const first = await makePerson();
    const second = await makePerson();

    for (const referrer of [first, second]) {
      await db().recommendation.create({
        data: {
          publicId: createId(),
          referrerPersonId: referrer.id,
          subjectPersonId: subject.id,
          note: 'Independent vouches must not collide',
          relationshipContext: 'worked_alongside',
          status: 'active',
          activeSubjectKey: subject.id,
        },
      });
    }

    expect(
      await db().recommendation.count({
        where: { subjectPersonId: subject.id, status: 'active' },
      }),
    ).toBe(2);
  });

  it('permits many anonymised people to coexist with a NULL phone', async () => {
    // Deletion and claim-rejection both null the phone. MySQL allows repeated
    // NULLs under a unique index; if that ever stopped being true, the second
    // person to delete their account would fail.
    await makePerson({ phone: null, displayName: 'Removed account' });
    await makePerson({ phone: null, displayName: 'Removed account' });

    expect(await db().person.count({ where: { phone: null } })).toBe(2);
  });
});

describeIfDb('Malayalam storage (real MySQL)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await disconnect();
  });

  it('round-trips Malayalam through every text column unchanged', async () => {
    const locality = await makeLocality('Edakkara');
    const tier = await makeCategory('skilled-trades');
    const role = await makeCategory('electrician', tier.id);

    const name = 'അബ്ദുൽ റഹ്‌മാൻ';
    const note = 'വളരെ നല്ല ഇലക്ട്രീഷ്യൻ. 12 വർഷം പരിചയം. സമയത്ത് വരും 👍';

    const referrer = await makePerson({ displayName: name, localityId: locality.id });
    const subject = await makePerson();

    const created = await db().recommendation.create({
      data: {
        publicId: createId(),
        referrerPersonId: referrer.id,
        subjectPersonId: subject.id,
        note,
        relationshipContext: 'employed_them',
        categoryId: role.id,
        status: 'active',
        activeSubjectKey: subject.id,
      },
    });

    const read = await db().recommendation.findUniqueOrThrow({
      where: { id: created.id },
      select: { note: true, referrer: { select: { displayName: true } } },
    });

    // Byte-for-byte. The emoji is the part 3-byte utf8 cannot store at all.
    expect(read.note).toBe(note);
    expect(read.referrer.displayName).toBe(name);
  });

  it('finds a Malayalam name by exact match', async () => {
    await makePerson({ displayName: 'ഫാത്തിമ ബീവി' });

    const found = await db().person.findFirst({
      where: { displayName: 'ഫാത്തിമ ബീവി' },
    });

    // A wrong collation makes this return nothing while everything else looks
    // fine — the exact failure that only shows up in production.
    expect(found).not.toBeNull();
  });
});
