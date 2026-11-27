'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminUpdateTicketStatus, adminAddTicketNote } from '@/lib/actions/account';
import type { TicketNote } from '@/lib/types';

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export default function AdminTicketDetail({
  ticketId,
  currentStatus,
  notes,
}: {
  ticketId: string;
  currentStatus: string;
  notes: TicketNote[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [note, setNote] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function onUpdateStatus() {
    setErr(null); setMsg(null);
    setSavingStatus(true);
    const res = await adminUpdateTicketStatus(ticketId, status);
    setSavingStatus(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg('Status updated.');
    router.refresh();
  }

  async function onAddNote() {
    setErr(null); setMsg(null);
    if (!note.trim()) return;
    setSavingNote(true);
    const res = await adminAddTicketNote(ticketId, note);
    setSavingNote(false);
    if (!res.ok) { setErr(res.error); return; }
    setNote('');
    setMsg('Note added.');
    router.refresh();
  }

  return (
    <div className="border-t border-line dark:border-dark-line pt-6 flex flex-col gap-6">
      {/* Status update */}
      <div>
        <h2 className="font-medium mb-3 text-ink dark:text-dark-ink">Update status</h2>
        <div className="flex items-center gap-3">
          <select className="input max-w-[12rem]" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button className="btn btn-primary" onClick={onUpdateStatus} disabled={savingStatus}>
            {savingStatus ? 'Saving' : 'Update'}
          </button>
        </div>
      </div>

      {/* Internal notes */}
      <div>
        <h2 className="font-medium mb-3 text-ink dark:text-dark-ink">Internal notes</h2>
        <div className="flex flex-col gap-2 mb-4">
          {notes.length === 0 ? (
            <p className="text-sm text-muted dark:text-dark-muted">No notes yet.</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="border border-line dark:border-dark-line p-3 text-sm">
                <p className="text-ink dark:text-dark-ink whitespace-pre-wrap">{n.note}</p>
                <p className="text-xs text-muted dark:text-dark-muted mt-1">{n.created_by} · {new Date(n.created_at).toLocaleString('en-US')}</p>
              </div>
            ))
          )}
        </div>
        <div className="field max-w-xl">
          <label>Add a note (not visible to customer)</label>
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note..." />
        </div>
        <button className="btn btn-outline mt-2" onClick={onAddNote} disabled={savingNote}>
          {savingNote ? 'Adding' : 'Add note'}
        </button>
      </div>

      {err && <p className="text-sm theme-text">{err}</p>}
      {msg && <p className="text-sm text-muted dark:text-dark-muted">{msg}</p>}
    </div>
  );
}
