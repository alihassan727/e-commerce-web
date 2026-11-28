import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_CMS_PAGES, cmsSlugCandidates } from '@/lib/cms/defaults';

/**
 * Makes sure the five standard CMS pages exist as drafts.
 *
 * Idempotent and non-destructive:
 *  - reads the existing pages first and returns early when nothing is missing;
 *  - never updates or deletes a row, so titles, slugs, content and publish
 *    state set by the admin are always preserved;
 *  - recognises legacy slugs (e.g. `returns`) and a renamed default page (same
 *    title) so no duplicate record is created;
 *  - inserts only missing pages, always as unpublished drafts with no content.
 *
 * Writes use the service-role client, which is server-only; call this from an
 * admin route, never from a public page.
 */
export async function ensureDefaultCmsPages(): Promise<void> {
  // Never write during `next build`: the pages are created when an admin
  // actually opens the page list, so builds stay free of database writes.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const admin = createAdminClient();

  const { data, error } = await admin.from('cms_pages').select('id,slug,title');
  if (error) {
    // A read failure must not take down the admin page; the list simply shows
    // whatever is already stored.
    console.error('[cms] could not read pages for initialization:', error.message);
    return;
  }

  const pages = (data ?? []) as { id: string; slug: string; title: string }[];
  const existingSlugs = new Set(pages.map((p) => p.slug.trim().toLowerCase()));
  const existingTitles = new Set(pages.map((p) => p.title.trim().toLowerCase()));

  const missing = DEFAULT_CMS_PAGES.filter(
    (def) =>
      !cmsSlugCandidates(def.slug).some((candidate) => existingSlugs.has(candidate)) &&
      !existingTitles.has(def.title.toLowerCase()),
  );
  if (missing.length === 0) return;

  for (const def of missing) {
    const { error: insertError } = await admin.from('cms_pages').insert({
      slug: def.slug,
      title: def.title,
      content: null,
      is_published: false,
    });
    if (insertError) {
      // 23505 = unique_violation: another request created the row first.
      if (insertError.code !== '23505') {
        console.error(`[cms] could not create the "${def.title}" page:`, insertError.message);
      }
      continue;
    }
    // Keep the local sets accurate so a repeated slug in this batch is skipped.
    existingSlugs.add(def.slug);
    existingTitles.add(def.title.toLowerCase());
  }
}
