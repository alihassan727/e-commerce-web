// Types mirroring the Supabase schema (see supabase/migrations/0001_init.sql).

export interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  storage_path: string;
  sort_order: number;
}

export interface Variant {
  id: string;
  product_id: string;
  size: string | null;
  color: string | null;
  stock: number;
  sku: string | null;
}

export interface Product {
  id: string;
  category_id: string | null;
  title: string;
  slug: string;
  description: string | null;
  price: number;
  has_variants: boolean;
  stock: number | null;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ProductListItem extends Product {
  images: ProductImage[];
}

export interface ProductDetail extends Product {
  category: Category | null;
  images: ProductImage[];
  variants: Variant[];
}

export type HomepageSectionType = 'hero' | 'category' | 'featured';

export interface HomepageSection {
  id: string;
  type: HomepageSectionType;
  category_id: string | null;
  title: string | null;
  sort_order: number;
  is_active: boolean;
  config: Record<string, unknown>;
}

export interface SiteSettings {
  id: number;
  store_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  currency: string;
  delivery_fee: number;
  delivery_areas: string[];
  low_stock_threshold: number;
  cod_notes: string | null;
  updated_at: string;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'out_of_stock'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  title_snapshot: string;
  variant_label_snapshot: string | null;
  price: number;
  quantity: number;
  line_total: number;
}

export interface Order {
  id: string;
  customer_id: string | null;
  status: OrderStatus;
  customer_name: string;
  email: string;
  phone: string;
  alternate_phone: string | null;
  address: string;
  city: string;
  delivery_instructions: string | null;
  preferred_delivery_time: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export interface Customer {
  id: string;
  auth_uid: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  created_at: string;
}

// Cart line item shape (client side).
export interface CartItem {
  product_id: string;
  variant_id: string | null;
  title: string;
  slug: string;
  variant_label: string | null;
  price: number;
  quantity: number;
}
