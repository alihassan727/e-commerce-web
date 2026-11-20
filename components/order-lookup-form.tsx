'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function OrderLookupForm({
  orderId,
  placed = false,
}: {
  orderId: string;
  placed?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    const params = new URLSearchParams({ email: email.trim() });
    if (placed) params.set('placed', '1');
    router.push(`/order/${orderId}?${params.toString()}`);
  }

  return (
    <section className="container-page py-16 max-w-md">
      {placed && (
        <div className="border border-line p-4 mb-8">
          <p className="font-medium">Order received.</p>
          <p className="text-sm text-muted mt-1">
            We are confirming stock and will email you. To view this order, enter
            the email you used at checkout.
          </p>
        </div>
      )}
      <h1 className="font-serif text-3xl mb-2">View your order</h1>
      <p className="text-sm text-muted mb-6">
        Enter the email address used at checkout.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="field">
          <label htmlFor="lookup-email">Email</label>
          <input
            id="lookup-email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <button type="submit" className="btn btn-primary">
          View order
        </button>
      </form>
    </section>
  );
}
