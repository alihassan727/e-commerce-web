import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid, sanitizeSearchTerm } from '@/lib/search';
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
  color_count: number;
  images: { storage_path: string; sort_order: number }[];
}

export async function adminListProducts(): Promise<AdminProductRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('products')
    .select(
      '*, category:categories(name), images:product_images(id,storage_path,sort_order,variant_id), variants:variants(id), colors:product_colors(id,name,color_hex,is_active)',
    )
    .order('created_at', { ascending: false });
  return ((data ?? []) as unknown as (Product & {
    category: { name: string } | null;
    images: { id: string; storage_path: string; sort_order: number; variant_id: string | null }[];
    variants: { id: string }[];
    colors: { id: string }[];
  })[]).map((p) => ({
    ...p,
    category_name: p.category?.name ?? null,
    image_count: p.images?.length ?? 0,
    variant_count: p.variants?.length ?? 0,
    color_count: p.colors?.length ?? 0,
  }));
}

export async function adminGetProduct(id: string): Promise<ProductDetail | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('products')
    .select(
      '*, category:categories(*), images:product_images(*), variants:variants(*), colors:product_colors(*, images:color_images(*))',
    )
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
    const s = sanitizeSearchTerm(filter.search);
    if (s) {
      const clauses = [
        `email.ilike.%${s}%`,
        `phone.ilike.%${s}%`,
        `customer_name.ilike.%${s}%`,
      ];
      // Only add an exact id match for a well-formed UUID, otherwise
      // PostgREST would reject the whole query with a cast error.
      if (isUuid(s)) clauses.push(`id.eq.${s}`);
      query = query.or(clauses.join(','));
    }
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
  if (!customers || customers.length === 0) return [];

  // Fetch order counts for all customers in a single query instead of N+1.
  const customerIds = (customers as Customer[]).map((c) => c.id);
  const { data: countRows } = await admin
    .from('orders')
    .select('customer_id')
    .in('customer_id', customerIds);

  const countMap = new Map<string, number>();
  for (const row of (countRows ?? []) as { customer_id: string }[]) {
    countMap.set(row.customer_id, (countMap.get(row.customer_id) ?? 0) + 1);
  }

  return (customers as Customer[]).map((c) => ({
    ...c,
    order_count: countMap.get(c.id) ?? 0,
  }));
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

/**
 * Shape used when the singleton settings row has not been created yet (fresh
 * database). The admin forms can then be opened and saved; every settings
 * action upserts id = 1.
 */
function fallbackSettings(): SiteSettings {
  return {
    id: 1,
    store_name: 'Atlas Clothier',
    contact_email: null,
    contact_phone: null,
    currency: 'PKR',
    delivery_fee: 0,
    delivery_areas: [],
    low_stock_threshold: 5,
    cod_notes: null,
    updated_at: new Date().toISOString(),
    logo_url: null,
    favicon_url: null,
    announcement_text: null,
    announcement_active: false,
    seo_title: null,
    meta_description: null,
    button_color: '#A8472D',
    logo_mode: 'text',
    logo_text: null,
    logo_font: 'serif',
    logo_font_size: '1.5rem',
    logo_font_weight: '400',
    logo_color: '#1B1A18',
    logo_letter_spacing: 'normal',
  };
}

export async function adminGetSettings(): Promise<SiteSettings> {
  const admin = createAdminClient();
  const { data } = await admin.from('site_settings').select('*').eq('id', 1).maybeSingle();
  return (data as SiteSettings | null) ?? fallbackSettings();
}

// ----- Payment gateway config (server-side only, never exposed to browser) -
export interface PaymentGatewayRow {
  id: string;
  gateway: 'safepay' | 'payfast';
  is_active: boolean;
  updated_at: string;
  has_credentials: boolean;
}

/** Credential values are never returned to the browser — only a boolean flag. */
export async function adminListPaymentGateways(): Promise<PaymentGatewayRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('payment_gateway_config')
    .select('id,gateway,is_active,updated_at,credentials')
    .order('gateway', { ascending: true });
  const rows = ((data ?? []) as {
    id: string;
    gateway: 'safepay' | 'payfast';
    is_active: boolean;
    updated_at: string;
    credentials: Record<string, string> | null;
  }[]).map(({ credentials, ...row }) => ({
    ...row,
    has_credentials: Boolean(credentials && Object.keys(credentials).length > 0),
  }));

  // Show every supported gateway even when its seed row is missing, so the
  // configuration page is always reachable on a fresh database.
  for (const gateway of ['payfast', 'safepay'] as const) {
    if (!rows.some((row) => row.gateway === gateway)) {
      rows.push({
        id: '',
        gateway,
        is_active: false,
        updated_at: new Date().toISOString(),
        has_credentials: false,
      });
    }
  }
  return rows.sort((a, b) => a.gateway.localeCompare(b.gateway));
}

export interface PaymentGatewayDetail {
  id: string;
  gateway: 'safepay' | 'payfast';
  is_active: boolean;
  updated_at: string;
  /** Non-secret values only (environment, public key, merchant id). */
  values: Record<string, string>;
  /** Names of secret fields that already have a saved value. */
  savedSecretFields: string[];
}

const GATEWAY_SECRET_KEYS: Record<string, string[]> = {
  safepay: ['secret_key', 'webhook_secret'],
  payfast: ['secured_key'],
};

export async function adminGetPaymentGateway(
  gateway: string,
): Promise<PaymentGatewayDetail | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('payment_gateway_config')
    .select('id,gateway,is_active,credentials,updated_at')
    .eq('gateway', gateway)
    .maybeSingle();

  const known = gateway === 'safepay' || gateway === 'payfast';
  if (!data) {
    if (!known) return null;
    return {
      id: '',
      gateway: gateway as 'safepay' | 'payfast',
      is_active: false,
      updated_at: new Date().toISOString(),
      values: {},
      savedSecretFields: [],
    };
  }

  const credentials = (data.credentials ?? {}) as Record<string, string>;
  const secretKeys = GATEWAY_SECRET_KEYS[gateway] ?? [];
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (!secretKeys.includes(key)) values[key] = value;
  }

  return {
    id: data.id as string,
    gateway: data.gateway as 'safepay' | 'payfast',
    is_active: Boolean(data.is_active),
    updated_at: data.updated_at as string,
    values,
    savedSecretFields: secretKeys.filter((key) => Boolean(credentials[key])),
  };
}
