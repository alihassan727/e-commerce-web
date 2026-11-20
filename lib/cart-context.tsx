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
const STORAGE_KEY = 'atlas-cart-v1';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage on mount only.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as CartItem[]);
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
