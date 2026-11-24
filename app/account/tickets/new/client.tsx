'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitTicket } from '@/lib/actions/account';
import type { TicketCategory } from '@/lib/types';

const CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: 'order_issue', label: 'Order Issue' },
  { value: 'delivery_issue', label: 'Delivery Issue' },
  { value: 'payment_issue', label: 'Payment Issue' },
  { value: 'product_issue', label: 'Product Issue' },
  { value: 'return_exchange', label: 'Return / Exchange' },
  { value: 'other', label: 'Other' },
];

export default function NewTicketForm({
  customerName,
  customerEmail,
  customerPhone,
}: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState(customerPhone);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('order_issue');
  const [orderId, setOrderId] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit() {
    setErr(null);
    if (!subject.trim() || !description.trim()) {
      setErr('Subject and description are required.');
      return;
    }
    setSubmitting(true);
    const res = await submitTicket({ phone, subject, category, order_id: orderId || undefined, description });
    setSubmitting(false);
    if (!res.ok) { setErr(res.error); return; }
    router.push(`/account/tickets/${res.ticket_id}?submitted=1`);
  }

  return (
    <div>
      <h1 className="font-serif text-3xl mb-6 text-ink dark:text-dark-ink">Submit a ticket</h1>
      <div className="flex flex-col gap-4 max-w-xl">
        <div className="grid grid-cols-2 gap-4">
          <div className="field">
            <label>Your name</label>
            <input className="input" value={customerName} disabled />
          </div>
          <div className="field">
            <label>Email</label>
            <input className="input" value={customerEmail} disabled />
          </div>
        </div>
        <div className="field">
          <label htmlFor="phone">Contact number</label>
          <input id="phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 300..." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" className="input" value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="order-id">Related order ID (optional)</label>
            <input id="order-id" className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Order UUID" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="subject">Subject</label>
          <input id="subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary of your issue" />
        </div>
        <div className="field">
          <label htmlFor="description">Describe your issue in detail</label>
          <textarea id="description" className="input" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Please describe what happened..." />
        </div>
        {err && <p className="text-sm theme-text">{err}</p>}
        <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Submitting' : 'Submit ticket'}
        </button>
      </div>
    </div>
  );
}
