import Link from 'next/link';
import StarRating from '@/components/star-rating';
import AdminReviewActions from './client';
import { adminListReviews } from '@/lib/queries/reviews';

const STATUS_OPTS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'hidden', label: 'Hidden' },
];

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const reviews = await adminListReviews({ status: searchParams.status });
  const current = searchParams.status ?? 'all';

  return (
    <div>
      <h1 className="font-serif text-3xl mb-6 text-ink dark:text-dark-ink">Reviews</h1>

      <form method="get" className="flex flex-wrap gap-3 mb-6">
        <div className="field">
          <label htmlFor="status">Filter by status</label>
          <select id="status" name="status" className="input" defaultValue={current}>
            {STATUS_OPTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="field justify-end">
          <label>&nbsp;</label>
          <button type="submit" className="btn btn-outline">Filter</button>
        </div>
      </form>

      {reviews.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-muted">No reviews match.</p>
      ) : (
        <div className="border border-line dark:border-dark-line">
          {reviews.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 px-4 py-4 border-b border-line dark:border-dark-line last:border-0 text-sm">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-medium text-ink dark:text-dark-ink">
                    {(r as unknown as { product: { title: string } | null })?.product?.title ?? 'Product'}
                  </p>
                  <p className="text-muted dark:text-dark-muted">
                    {r.customer_name ?? 'Unknown'} · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StarRating value={r.rating} size="sm" />
                  <span className="border border-line dark:border-dark-line px-2 py-0.5 text-xs capitalize">
                    {r.status}
                  </span>
                </div>
              </div>
              {r.review_text && <p className="text-ink dark:text-dark-ink">{r.review_text}</p>}
              <AdminReviewActions reviewId={r.id} currentStatus={r.status as 'pending' | 'approved' | 'hidden'} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
