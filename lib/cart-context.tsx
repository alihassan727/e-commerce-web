'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CartItem } from '@/lib/types';

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (item: CartItem) => void;
  setQty: (
    productId: string,
    variantId: string | null,
    qty: number,
  ) => void;
  remove: (productId: string, variantId: string | null) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'atlas-cart-v2';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage on mount only. If a v1 cart exists and no v2
  // cart has been written yet, migrate it once (preserving items, no dupes).
  useEffect(() => {
    try {
      const rawV2 = localStorage.getItem(STORAGE_KEY);
      if (rawV2) {
        setItems(JSON.parse(rawV2) as CartItem[]);
      } else {
        const rawV1 = localStorage.getItem('atlas-cart-v1');
        if (rawV1) {
          const old = JSON.parse(rawV1) as Array<Record<string, unknown>>;
          const migrated: CartItem[] = old.map((o) => ({
            product_id: String(o.product_id ?? ''),
            color_id: null,
            variant_id: (o.variant_id as string | null) ?? null,
            title: String(o.title ?? ''),
            slug: String(o.slug ?? ''),
            color_name: null,
            color_hex: null,
            size: null,
            variant_label: (o.variant_label as string | null) ?? null,
            image_url: null,
            price: Number(o.price ?? 0),
            quantity: Number(o.quantity ?? 1),
          }));
          setItems(migrated);
          // Write v2 and drop v1 so the migration cannot run twice.
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          localStorage.removeItem('atlas-cart-v1');
        }
      }
    } catch {
      // ignore malformed storage
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch {
        // storage might be unavailable (private mode); ignore
      }
    }
  }, [items, ready]);

  function add(item: CartItem) {
    setItems((prev) => {
      const idx = prev.findIndex(
        (i) => i.product_id === item.product_id && i.variant_id === item.variant_id,
      );
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], quantity: next[idx].quantity + item.quantity };
        return next;
      }
      return [...prev, item];
    });
  }

  function setQty(productId: string, variantId: string | null, qty: number) {
    setItems((prev) =>
      prev.map((i) =>
        i.product_id === productId && i.variant_id === variantId
          ? { ...i, quantity: Math.max(1, Math.floor(qty)) }
          : i,
      ),
    );
  }

  function remove(productId: string, variantId: string | null) {
    setItems((prev) =>
      prev.filter(
        (i) => !(i.product_id === productId && i.variant_id === variantId),
      ),
    );
  }

  function clear() {
    setItems([]);
  }

  const count = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  const value = useMemo<CartContextValue>(
    () => ({ items, count, subtotal, add, setQty, remove, clear }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, count, subtotal],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
