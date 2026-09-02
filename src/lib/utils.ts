/**
 * shadcn's conventional home for `cn`.
 *
 * Components written for a shadcn project import `cn` from `@/lib/utils`. This
 * project keeps it in `@/lib/cn`, so rather than editing that import out of
 * every component that gets dropped in — and having the next one break the
 * same way — the conventional path re-exports the real implementation.
 *
 * Read the note in ./cn before assuming it merges conflicting classes. It does
 * not, deliberately.
 */
export { cn } from './cn';
