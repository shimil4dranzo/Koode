import { getFormatter, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { RecommendationView } from '@/server/services/recommendation.service';

/**
 * Somebody's vouches, rendered the same way everywhere they appear.
 *
 * Three screens show these — your own profile, a stranger's profile, and the
 * employer's list of interested candidates — and they must look identical in
 * all three, because the whole product is the claim that a named local person
 * said this. A "compact" variant that dropped the referrer's name would quietly
 * turn a vouch into an anonymous rating.
 *
 * A Server Component: there is nothing to interact with, so this ships no
 * JavaScript.
 */
export async function RecommendationList({
  recommendations,
}: {
  recommendations: RecommendationView[];
}) {
  const [t, tAnchor, tRelationship, format] = await Promise.all([
    getTranslations('recommendations'),
    getTranslations('anchor'),
    getTranslations('taxonomy.relationshipContext'),
    getFormatter(),
  ]);

  return (
    <ol className="flex flex-col gap-3">
      {recommendations.map((recommendation) => (
        <Card key={recommendation.publicId} as="li">
          {/* The referrer's name leads, above the words: who is saying this is
              the information being offered, and the note is the evidence. */}
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <Link
              href={`/people/${recommendation.referrer.publicId}`}
              className="underline underline-offset-2"
            >
              {t('byLine', { name: recommendation.referrer.displayName })}
            </Link>
            {recommendation.referrer.isVerifiedMember ? (
              <Badge tone="verified" glyph="✓">
                {tAnchor('verified')}
              </Badge>
            ) : null}
          </p>

          <p className="mt-1 text-sm text-ink-700">
            {tRelationship(recommendation.relationshipContext)}
            {recommendation.categoryLabel ? (
              <>
                <span aria-hidden="true"> · </span>
                {recommendation.categoryLabel}
              </>
            ) : null}
          </p>

          {/* Their words, wrapped, never truncated. */}
          <p className="mt-3 whitespace-pre-line text-ink-900">{recommendation.note}</p>

          <p className="mt-2 text-sm text-ink-500">
            {format.dateTime(new Date(recommendation.createdAt), 'short')}
          </p>
        </Card>
      ))}
    </ol>
  );
}
