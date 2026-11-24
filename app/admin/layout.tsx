import Link from 'next/link';
import AdminNav from '@/components/admin-nav';
import ThemeToggle from '@/components/theme-toggle';
import { isAdmin } from '@/lib/admin';

/**
 * Defense-in-depth: middleware already blocks non-admins from /admin/*, but the
 * layout re-verifies identity. If it ever renders for a non-admin, it shows the
 * unauthorized state instead of the admin shell.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await isAdmin();

  if (!admin) {
    return (
      <section className="container-page py-24 max-w-lg">
        <p className="text-sm theme-text">Not authorized</p>
        <h1 className="font-serif text-4xl mt-2 text-ink dark:text-dark-ink">You can&apos;t reach this page.</h1>
        <p className="mt-4 text-ink dark:text-dark-ink">
          The admin area is restricted to the store owner. Sign in with the owner
          account to continue.
        </p>
        <div className="mt-8">
          <Link href="/login" className="btn btn-primary">
            Sign in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="container-page py-8 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8">
      <aside className="md:border-r md:border-line dark:md:border-dark-line md:pr-6">
        <div className="hidden md:flex items-center justify-between mb-4">
          <p className="font-serif text-xl text-ink dark:text-dark-ink">Admin</p>
          <ThemeToggle />
        </div>
        <AdminNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
