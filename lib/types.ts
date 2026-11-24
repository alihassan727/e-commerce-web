// Types mirroring the Supabase schema (see supabase/migrations/).

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
  // CMS fields (added in migration 0005)
  logo_url: string | null;
  favicon_url: string | null;
  announcement_text: string | null;
  announcement_active: boolean;
  seo_title: string | null;
  meta_description: string | null;
  // Theme (added in migration 0007)
  button_color: string;
}

export interface PaymentGatewayConfig {
  id: string;
  gateway: 'safepay' | 'payfast';
  is_active: boolean;
  credentials: Record<string, string>;
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
  // Extended CRM profile fields (migration 0003)
  address: string | null;
  city: string | null;
  postal_code: string | null;
  avatar_url: string | null;
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

// CRM: saved delivery addresses
export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string;
  full_name: string;
  phone: string | null;
  address: string;
  city: string;
  postal_code: string | null;
  is_default: boolean;
  created_at: string;
}

// CRM: support tickets
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketCategory =
  | 'order_issue'
  | 'delivery_issue'
  | 'payment_issue'
  | 'product_issue'
  | 'return_exchange'
  | 'other';

export interface SupportTicket {
  id: string;
  ticket_number: string;
  customer_id: string | null;
  customer_name: string;
  email: string;
  phone: string | null;
  subject: string;
  category: TicketCategory;
  order_id: string | null;
  description: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
}

export interface TicketNote {
  id: string;
  ticket_id: string;
  note: string;
  created_by: string;
  created_at: string;
}

// Order tracking
export interface OrderTrackingEvent {
  id: string;
  order_id: string;
  status: string;
  description: string | null;
  created_at: string;
  created_by: string;
}

// CMS
export interface CmsPage {
  id: string;
  slug: string;
  title: string;
  content: string | null;
  is_published: boolean;
  updated_at: string;
}

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
  is_active: boolean;
  sort_order: number;
}

export interface CmsFeature {
  id: string;
  icon: string | null;
  heading: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}
