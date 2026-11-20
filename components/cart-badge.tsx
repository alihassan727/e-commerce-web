'use client';

import { useCart } from '@/lib/cart-context';

export default function CartBadge() {
  const { count } = useCart();
  if (count <= 0) return null;
  return <span className="text-muted"> ({count})</span>;
}
