/**
 * Canonical CMS page definitions.
 *
 * The five standard informational pages ship with the store. They are seeded as
 * drafts by ensureDefaultCmsPages() (server only) and are otherwise ordinary
 * cms_pages rows, so the admin can rename, edit and publish them like any
 * custom page.
 *
 * `aliases` lists slugs used by earlier versions of the seed migration (0005
 * seeded `returns` and `terms`). They are never created; they only let the
 * app recognise an existing record instead of creating a duplicate.
 *
 * This module is intentionally dependency-free so client components can import
 * the slug helper without pulling in the service-role Supabase client.
 */

export interface DefaultCmsPage {
  title: string;
  slug: string;
  /** Legacy slugs that should be treated as the same page. */
  aliases: string[];
}

export const DEFAULT_CMS_PAGES: DefaultCmsPage[] = [
  { title: 'About Us', slug: 'about-us', aliases: [] },
  { title: 'Privacy Policy', slug: 'privacy-policy', aliases: [] },
  { title: 'Shipping Policy', slug: 'shipping-policy', aliases: [] },
  {
    title: 'Return & Refund Policy',
    slug: 'return-refund-policy',
    aliases: ['returns', 'return-refund'],
  },
  { title: 'Terms & Conditions', slug: 'terms-and-conditions', aliases: ['terms'] },
];

/**
 * Slug candidates for a public URL, most preferred first: the canonical slug
 * followed by any legacy aliases that may still hold the page record.
 */
export function cmsSlugCandidates(slug: string): string[] {
  const needle = slug.trim().toLowerCase();
  const match = DEFAULT_CMS_PAGES.find(
    (d) => d.slug === needle || d.aliases.includes(needle),
  );
  if (!match) return [needle];
  return [match.slug, ...match.aliases.filter((a) => a !== match.slug)];
}

/** Lowercase, hyphenated slug safe for URLs; empty string when nothing usable. */
export function slugifyPage(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/['"’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80)
    .replace(/-+$/g, '');
}
