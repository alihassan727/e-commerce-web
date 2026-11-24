import Link from 'next/link';
import { getCurrentUser } from '@/lib/admin';
import SignOutButton from '@/components/sign-out-button';
import CartBadge from '@/components/cart-badge';
import ThemeToggle from '@/components/theme-toggle';

export default async function Navbar() {
  const user = await getCurrentUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  const showAdmin = Boolean(user && adminEmail && user.email === adminEmail);

  return (
    <header className="border-b border-line dark:border-dark-line bg-canvas dark:bg-dark-canvas">
      <div className="container-page flex items-center justify-between py-4">
        <Link href="/" className="font-serif text-2xl tracking-tight text-ink dark:text-dark-ink">
          Atlas Clothier
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/shop" className="text-ink dark:text-dark-ink">
            Shop
          </Link>
          <Link href="/cart" className="text-ink dark:text-dark-ink">
            Cart
            <CartBadge />
          </Link>
          {user ? (
            <>
              <Link href="/account" className="text-ink dark:text-dark-ink">
                Account
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link href="/login" className="text-ink dark:text-dark-ink">
              Sign in
            </Link>
          )}
          {showAdmin && (
            <Link href="/admin" className="theme-text font-medium">
              Admin
            </Link>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
