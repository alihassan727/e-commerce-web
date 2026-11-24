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

export async function getActiveCategories(): Promise<Category[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  return (data ?? []) as Category[];
}

export async function getHomepageSections(): Promise<HomepageSection[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('homepage_sections')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return (data ?? []) as HomepageSection[];
}

export async function getProductsByCategory(
  categoryId: string,
): Promise<ProductListItem[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('products')
    .select('*, images:product_images(*)')
    .eq('is_active', true)
    .eq('category_id', categoryId)
    .order('created_at', { ascending: false });
  return (data ?? []) as unknown as ProductListItem[];
}

export async function getAllProducts(): Promise<ProductListItem[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('products')
    .select('*, images:product_images(*)')
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
    .select('*, images:product_images(*)')
    .eq('is_active', true)
    .in('id', ids);
  return (data ?? []) as unknown as ProductListItem[];
}

export async function getProductBySlug(
  slug: string,
): Promise<ProductDetail | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('products')
    .select('*, category:categories(*), images:product_images(*), variants:variants(*)')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  return data as unknown as ProductDetail | null;
}

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

export async function getActiveSocialLinks(): Promise<SocialLink[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('social_links')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return (data ?? []) as SocialLink[];
}

export async function getActiveFeatures(): Promise<CmsFeature[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('cms_features')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return (data ?? []) as CmsFeature[];
}

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
export async function getPublishedPages(): Promise<CmsPage[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('cms_pages')
    .select('id,slug,title,is_published,updated_at')
    .eq('is_published', true)
    .order('slug', { ascending: true });
  return (data ?? []) as CmsPage[];
}

export async function adminGetPage(slug: string): Promise<CmsPage | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('cms_pages')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  return data as CmsPage | null;
}
