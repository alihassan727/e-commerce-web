'use client';

import { useEffect, useState } from 'react';
import StarRating from '@/components/star-rating';
import { submitReview, editReview } from '@/lib/actions/reviews';
import { useRouter } from 'next/navigation';
import type { ProductReviewWithCustomer } from '@/lib/types';

interface RatingSummary {
  average: number;
  count: number;
  distribution: Record<number, number>;
}

interface ReviewFormProps {
  productId: string;
  existingReviewId?: string;
  existingRating?: number;
  existingText?: string;
  onDone?: () => void;
}

function ReviewForm({ productId, existingReviewId, existingRating = 0, existingText = '', onDone }: ReviewFormProps) {
  const router = useRouter();
  const [rating, setRating] = useState(existingRating);
  const [text, setText] = useState(existingText);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const editing = Boolean(existingReviewId);

  async function onSubmit() {
    setErr(null);
    if (rating === 0) { setErr('Please select a star rating.'); return; }
    setSubmitting(true);
    const result = editing
      ? await editReview({ review_id: existingReviewId!, rating, review_text: text })
      : await submitReview({ product_id: productId, rating, review_text: text });
    setSubmitting(false);
    if (!result.ok) { setErr(result.error); return; }
    setSuccess(true);
    router.refresh();
    onDone?.();
  }

  if (success) {
    return (
      <div className="border border-line dark:border-dark-line p-4">
        <p className="font-medium text-ink dark:text-dark-ink">
          {editing ? 'Review updated.' : 'Review submitted for moderation. Thank you!'}
        </p>
      </div>
    );
  }

  return (
    <div className="border border-line dark:border-dark-line p-4 flex flex-col gap-3 max-w-lg">
      <p className="font-medium text-sm text-ink dark:text-dark-ink">
        {editing ? 'Edit your review' : 'Write a review'}
      </p>
      <div>
        <label className="text-xs text-muted dark:text-dark-muted block mb-1">Your rating</label>
        <StarRating value={rating} onChange={setRating} size="lg" />
      </div>
      <div className="field">
        <label htmlFor="review-text">Your review (optional)</label>
        <textarea
          id="review-text"
          className="input"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Share your experience with this product..."
        />
      </div>
      {err && <p className="text-sm theme-text">{err}</p>}
      <div className="flex gap-3">
        <button className="btn btn-primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Submitting' : editing ? 'Save changes' : 'Submit review'}
        </button>
        {onDone && (
          <button className="btn btn-ghost text-sm" onClick={onDone}>Cancel</button>
        )}
      </div>
    </div>
  );
}

export default function ProductReviews({
  productId,
  reviews,
  summary,
  canReview,
  existingReview,
}: {
  productId: string;
  reviews: ProductReviewWithCustomer[];
  summary: RatingSummary;
  canReview: boolean;
  existingReview?: { id: string; rating: number; review_text: string | null } | null;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (canReview && !existingReview && typeof window !== 'undefined' && window.location.hash === '#reviews') {
      setShowForm(true);
    }
  }, [canReview, existingReview]);

  return (
    <section id="reviews" className="border-t border-line dark:border-dark-line pt-10 mt-10 scroll-mt-20">
      <h2 className="font-serif text-2xl mb-6 text-ink dark:text-dark-ink">Reviews</h2>

      {/* Rating summary */}
      {summary.count > 0 && (
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="text-center">
            <p className="text-4xl font-serif text-ink dark:text-dark-ink">{summary.average}</p>
            <StarRating value={Math.round(summary.average)} size="sm" />
            <p className="text-xs text-muted dark:text-dark-muted mt-1">{summary.count} review{summary.count !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex flex-col gap-1 flex-1 max-w-xs">
            {[5, 4, 3, 2, 1].map((star) => {
              const cnt = summary.distribution[star] ?? 0;
              const pct = summary.count > 0 ? Math.round((cnt / summary.count) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-right text-muted dark:text-dark-muted">{star}</span>
                  <span className="text-muted dark:text-dark-muted">★</span>
                  <div className="flex-1 h-1.5 border border-line dark:border-dark-line">
                    <div className="h-full theme-bg" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 text-muted dark:text-dark-muted">{cnt}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Call-to-action */}
      {canReview && !existingReview && !showForm && (
        <div className="mb-6">
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            Write a review
          </button>
        </div>
      )}

      {canReview && !existingReview && showForm && (
        <div className="mb-6">
          <ReviewForm productId={productId} onDone={() => setShowForm(false)} />
        </div>
      )}

      {existingReview && !editMode && (
        <div className="border border-line dark:border-dark-line p-4 mb-6 max-w-lg">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-ink dark:text-dark-ink">Your review</p>
            <button className="text-xs theme-text" onClick={() => setEditMode(true)}>Edit</button>
          </div>
          <StarRating value={existingReview.rating} size="sm" />
          {existingReview.review_text && (
            <p className="text-sm text-ink dark:text-dark-ink mt-1">{existingReview.review_text}</p>
          )}
        </div>
      )}

      {existingReview && editMode && (
        <div className="mb-6">
          <ReviewForm
            productId={productId}
            existingReviewId={existingReview.id}
            existingRating={existingReview.rating}
            existingText={existingReview.review_text ?? ''}
            onDone={() => setEditMode(false)}
          />
        </div>
      )}

      {/* Review list */}
      {reviews.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-muted">No reviews yet.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {reviews.map((r) => (
            <div key={r.id} className="border-b border-line dark:border-dark-line pb-6 last:border-0">
              <div className="flex items-center gap-3 mb-2">
                <StarRating value={r.rating} size="sm" />
                <span className="text-xs text-muted dark:text-dark-muted">
                  {new Date(r.created_at).toLocaleDateString('en-US')}
                </span>
                <span className="text-xs border border-line dark:border-dark-line px-1.5 py-0.5 text-muted dark:text-dark-muted">
                  Verified purchase
                </span>
              </div>
              <p className="text-sm font-medium text-ink dark:text-dark-ink mb-1">
                {r.customer_name ?? 'Customer'}
              </p>
              {r.review_text && (
                <p className="text-sm text-ink dark:text-dark-ink">{r.review_text}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
