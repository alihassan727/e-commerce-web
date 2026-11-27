/**
 * Helpers for safely building PostgREST filters from user-supplied input.
 *
 * Values interpolated into a `.or('a.ilike.%x%,b.eq.y')` string are parsed by
 * PostgREST, not bound as parameters. Characters such as `,`, `(` and `)`
 * change the filter structure, so they must be removed before interpolation.
 */

/** Removes PostgREST filter structural characters and escapes LIKE wildcards. */
export function sanitizeSearchTerm(raw: string): string {
  return raw
    .trim()
    .replace(/[(),]/g, ' ')
    .replace(/[\\%_]/g, (m) => `\\${m}`)
    .replace(/\s+/g, ' ')
    .trim();
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the value is a well-formed UUID (safe for an `id.eq.` filter). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
