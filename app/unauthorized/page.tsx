import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <section className="container-page py-24 max-w-lg">
      <p className="text-sm text-clay">Not authorized</p>
      <h1 className="font-serif text-4xl mt-2">You can&apos;t reach this page.</h1>
      <p className="mt-4 text-ink">
        The admin area is restricted to the store owner. If this is your store,
        sign in with the owner account.
      </p>
      <div className="mt-8">
        <Link href="/login" className="btn btn-primary">
          Sign in
        </Link>
      </div>
    </section>
  );
}
