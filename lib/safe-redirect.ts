/**
 * Returns a safe, same-origin redirect path.
 *
 * Only a single leading slash is accepted. Protocol-relative URLs (`//host`),
 * backslash tricks (`/\host`) and absolute URLs are rejected so a crafted
 * `?next=` value cannot send a user to another site after sign-in.
 */
export function safeNextPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string') return fallback;
  const next = value.trim();
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }
  // Browsers normalise backslashes to slashes; control characters are unsafe.
  if (/[\\\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
