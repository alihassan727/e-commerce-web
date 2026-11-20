import { createAdminClient } from '@/lib/supabase/admin';
import type {
  Category,
  Customer,
  HomepageSection,
  Order,
  OrderItem,
  Product,
  ProductDetail,
  SiteSettings,
} from '@/lib/types';

export interface DashboardData {
  counts: Record<string, number>;
  revenue: number;
  recent: (Pick<Order, 'id' | 'status' | 'total' | 'created_at' | 'email' | 'customer_name' | 'city'>)[];
  lowStockVariants: {
    id: string;
    product_id: string;
    product_title: string;
    size: string | null;
    color: string | null;
    stock: number;
  }[];
  lowStockProducts: {
    id: string;
    title: string;
    slug: string;
    stock: number;
  }[];
  threshold: number;
}

export async function getDashboardData(): Promise<DashboardData> {
  const admin = createAdminClient();

  const { data: settings } = await admin
    .from('site_settings')
    .select('low_stock_threshold')
    .eq('id', 1)
    .maybeSingle();
  const threshold = Number(settings?.low_stock_threshold ?? 5);

  const { data: orders } = await admin
    .from('orders')
    .select('id,status,total,created_at,email,customer_name,city')
    .order('created_at', { ascending: false });

  const all = (orders ?? []) as DashboardData['recent'];
  const counts: Record<string, number> = {};
  let revenue = 0;
  for (const o of all) {
    counts[o.status] = (counts[o.status] ?? 0) + 1;
    if (o.status === 'confirmed' || o.status === 'shipped' || o.status === 'delivered') {
      revenue += Number(o.total);
    }
  }
  const recent = all.slice(0, 8);

  const { data: lowVariantsRows } = await admin
    .from('variants')
    .select('id,product_id,size,color,stock,products(title)')
    .lt('stock', threshold)
    .order('stock', { ascending: true });
  const lowStockVariants = ((lowVariantsRows ?? []) as unknown as {
    id: string;
    product_id: string;
    size: string | null;
    color: string | null;
    stock: number;
    products: { title: string } | null;
  }[]).map((v) => ({
    id: v.id,
    product_id: v.product_id,
    product_title: v.products?.title ?? 'Unknown',
    size: v.size,
    color: v.color,
    stock: v.stock,
  }));

  const { data: lowProductsRows } = await admin
    .from('products')
    .select('id,title,slug,stock')
    .eq('has_variants', false)
    .lt('stock', threshold)
    .order('stock', { ascending: true });
  const lowStockProducts = (lowProductsRows ?? []) as DashboardData['lowStockProducts'];

  return { counts, revenue, recent, lowStockVariants, lowStockProducts, threshold };
}

// ----- Products -------------------------------------------------------------
export interface AdminProductRow extends Product {
  category_name: string | null;
  image_count: number;
  variant_count: number;
}

export async function adminListProducts(): Promise<AdminProductRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('products')
    .select('*, category:categories(name), images:product_images(id), variants:variants(id)')
    .order('created_at', { ascending: false });
  return ((data ?? []) as unknown as (Product & {
    category: { name: string } | null;
    images: { id: string }[];
    variants: { id: string }[];
  })[]).map((p) => ({
    ...p,
    category_name: p.category?.name ?? null,
    image_count: p.images?.length ?? 0,
    variant_count: p.variants?.length ?? 0,
  }));
}

export async function adminGetProduct(id: string): Promise<ProductDetail | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('products')
    .select('*, category:categories(*), images:product_images(*), variants:variants(*)')
    .eq('id', id)
    .maybeSingle();
  return data as unknown as ProductDetail | null;
}

// ----- Categories -----------------------------------------------------------
export async function adminListCategories(): Promise<Category[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  return (data ?? []) as Category[];
}

// ----- Orders --------------------------------------------------------------
export interface AdminOrderRow extends Order {
  item_count: number;
}

export async function adminListOrders(filter?: {
  status?: string;
  search?: string;
}): Promise<AdminOrderRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from('orders')
    .select('*, items:order_items(id)')
    .order('created_at', { ascending: false });
  if (filter?.status && filter.status !== 'all') {
    query = query.eq('status', filter.status);
  }
  if (filter?.search?.trim()) {
    const s = filter.search.trim();
    query = query.or(`email.ilike.%${s}%,phone.ilike.%${s}%,id.eq.${s},customer_name.ilike.%${s}%`);
  }
  const { data } = await query;
  return ((data ?? []) as unknown as (Order & { items: { id: string }[] })[]).map((o) => ({
    ...o,
    item_count: o.items?.length ?? 0,
  }));
}

export async function adminGetOrder(id: string): Promise<(Order & { items: OrderItem[] }) | null> {
  const admin = createAdminClient();
  const { data: order } = await admin.from('orders').select('*').eq('id', id).maybeSingle();
  if (!order) return null;
  const { data: items } = await admin
    .from('order_items')
    .select('*')
    .eq('order_id', id)
    .order('created_at', { ascending: true });
  return { ...(order as Order), items: (items ?? []) as OrderItem[] };
}

// ----- Customers -----------------------------------------------------------
export interface AdminCustomerRow extends Customer {
  order_count: number;
}

export async function adminListCustomers(): Promise<AdminCustomerRow[]> {
  const admin = createAdminClient();
  const { data: customers } = await admin
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false });
  const result: AdminCustomerRow[] = [];
  for (const c of (customers ?? []) as Customer[]) {
    const { count } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', c.id);
    result.push({ ...c, order_count: count ?? 0 });
  }
  return result;
}

export async function adminGetCustomer(
  id: string,
): Promise<{ customer: Customer | null; orders: AdminOrderRow[] }> {
  const admin = createAdminClient();
  const { data: customer } = await admin
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  const { data: orders } = await admin
    .from('orders')
    .select('*, items:order_items(id)')
    .eq('customer_id', id)
    .order('created_at', { ascending: false });
  const rows = ((orders ?? []) as unknown as (Order & { items: { id: string }[] })[]).map((o) => ({
    ...o,
    item_count: o.items?.length ?? 0,
  }));
  return { customer: customer as Customer | null, orders: rows };
}

// ----- Homepage ------------------------------------------------------------
export interface AdminHomepageSection extends HomepageSection {
  category_name: string | null;
}

export async function adminListHomepageSections(): Promise<AdminHomepageSection[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('homepage_sections')
    .select('*, category:categories(name)')
    .order('sort_order', { ascending: true });
  return ((data ?? []) as unknown as (HomepageSection & { category: { name: string } | null })[]).map(
    (s) => ({ ...s, category_name: s.category?.name ?? null }),
  );
}

// ----- Settings ------------------------------------------------------------
export async function adminGetSettings(): Promise<SiteSettings | null> {
  const admin = createAdminClient();
  const { data } = await admin.from('site_settings').select('*').eq('id', 1).maybeSingle();
  return data as SiteSettings | null;
}
