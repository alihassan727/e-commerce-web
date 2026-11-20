import { createClient } from '@/lib/supabase/server';
import type {
  Category,
  HomepageSection,
  ProductDetail,
  ProductListItem,
  SiteSettings,
} from '@/lib/types';

// All catalog reads use the anon server client (RLS: public read of active rows).

export async function getSiteSettings(): Promise<SiteSettings | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('site_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  return data as SiteSettings | null;
}

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
