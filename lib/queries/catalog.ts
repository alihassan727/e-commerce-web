import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cache } from 'react';
import type {
  Category,
  CmsFeature,
  CmsPage,
  HomepageSection,
  ProductDetail,
  ProductListItem,
  SiteSettings,
  SocialLink,
} from '@/lib/types';

// All catalog reads use the anon server client (RLS: public read of active rows)
// unless a service-role read is explicitly needed.

/**
 * React.cache() wraps getSiteSettings so that multiple calls within a single
 * React render tree (e.g. generateMetadata + layout body) share the same
 * result without issuing a second Supabase query.
 */
export const getSiteSettings = cache(async (): Promise<SiteSettings | null> => {
  const supabase = createClient();
  const { data } = await supabase
    .from('site_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  return data as SiteSettings | null;
});

export const getActiveCategories = cache(async (): Promise<Category[]> => {
  const supabase = createClient();
  const { data } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  return (data ?? []) as Category[];
});

export const getHomepageSections = cache(async (): Promise<HomepageSection[]> => {
  const supabase = createClient();
  const { data } = await supabase
    .from('homepage_sections')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return (data ?? []) as HomepageSection[];
});

/**
 * Returns one representative product-images storage path per category_id
 * in a single query, for category cards that do not have a custom image.
 */
export const getCategoryCoverImages = cache(
  async (categoryIds: string[]): Promise<Record<string, string>> => {
    if (categoryIds.length === 0) return {};
    const supabase = createClient();
    const { data } = await supabase
      .from('products')
      .select('category_id, images:product_images(storage_path, sort_order), colors:product_colors(is_active, sort_order, images:color_images(storage_path, sort_order))')
      .eq('is_active', true)
      .in('category_id', categoryIds)
      .order('created_at', { ascending: false });

    const map: Record<string, string> = {};
    for (const row of (data ?? []) as unknown as {
      category_id: string | null;
      images: { storage_path: string; sort_order: number }[];
      colors: { is_active: boolean; sort_order: number; images: { storage_path: string; sort_order: number }[] }[];
    }[]) {
      if (!row.category_id || map[row.category_id]) continue;
      const activeColor = [...(row.colors ?? [])]
        .filter((c) => c.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)[0];
      const colorImg = activeColor
        ? [...(activeColor.images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path
        : null;
      const prodImg = [...(row.images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path;
      const chosen = colorImg ?? prodImg;
      if (chosen) map[row.category_id] = chosen;
    }
    return map;
  },
);

export async function getProductsByCategory(
  categoryId: string,
): Promise<ProductListItem[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('products')
    .select('*, images:product_images(*), colors:product_colors(*, images:color_images(*))')
    .eq('is_active', true)
    .eq('category_id', categoryId)
    .order('created_at', { ascending: false });
  return (data ?? []) as unknown as ProductListItem[];
}

export async function getAllProducts(): Promise<ProductListItem[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('products')
    .select('*, images:product_images(*), colors:product_colors(*, images:color_images(*))')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  return (data ?? []) as unknown as ProductListItem[];
}

export async function getProductsByIds(
  ids: string[],
): Promise<ProductListItem[]> {
  if (ids.length === 0) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from('products')
    .select('*, images:product_images(*), colors:product_colors(*, images:color_images(*))')
    .eq('is_active', true)
    .in('id', ids);

  // Preserve the order the admin picked for a featured section.
  const position = new Map(ids.map((id, index) => [id, index]));
  return ((data ?? []) as unknown as ProductListItem[]).sort(
    (a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0),
  );
}

export const getProductBySlug = cache(
  async (slug: string): Promise<ProductDetail | null> => {
    const supabase = createClient();
    const { data } = await supabase
      .from('products')
      .select(
        '*, category:categories(*), images:product_images(*), variants:variants(*), colors:product_colors(*, images:color_images(*))',
      )
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    return data as unknown as ProductDetail | null;
  },
);

export async function getCategoryBySlug(
  slug: string,
): Promise<Category | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  return data as Category | null;
}

// ---------------------------------------------------------------------------
// CMS: public reads
// ---------------------------------------------------------------------------

export const getActiveSocialLinks = cache(async (): Promise<SocialLink[]> => {
  const supabase = createClient();
  const { data } = await supabase
    .from('social_links')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return (data ?? []) as SocialLink[];
});

export const getActiveFeatures = cache(async (): Promise<CmsFeature[]> => {
  const supabase = createClient();
  const { data } = await supabase
    .from('cms_features')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return (data ?? []) as CmsFeature[];
});

export async function getPublishedPage(slug: string): Promise<CmsPage | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('cms_pages')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  return data as CmsPage | null;
}

// Admin reads all pages regardless of publish state (via service-role).
export async function adminGetAllPages(): Promise<CmsPage[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('cms_pages')
    .select('*')
    .order('slug', { ascending: true });
  return (data ?? []) as CmsPage[];
}

/** Returns only published pages (used by footer — avoids fetching drafts). */
export const getPublishedPages = cache(async (): Promise<CmsPage[]> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from('cms_pages')
    .select('id,slug,title,is_published,updated_at')
    .eq('is_published', true)
    .order('slug', { ascending: true });
  return (data ?? []) as CmsPage[];
});

export async function adminGetPage(slug: string): Promise<CmsPage | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('cms_pages')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  return data as CmsPage | null;
}
