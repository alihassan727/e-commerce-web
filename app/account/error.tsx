'use client';

export default function AccountError({ reset }: { reset: () => void }) {
  return (
    <div className="border border-line dark:border-dark-line p-8 max-w-md">
      <h1 className="font-serif text-2xl text-ink dark:text-dark-ink">
        We couldn&apos;t load your account
      </h1>
      <p className="text-sm text-muted dark:text-dark-muted mt-2">
        Your account details could not be loaded right now. This is usually
        temporary — please try again.
      </p>
      <button type="button" className="btn btn-primary mt-4" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
