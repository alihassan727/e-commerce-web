import Link from 'next/link';
import { getCurrentUser } from '@/lib/admin';
import SignOutButton from '@/components/sign-out-button';
import CartBadge from '@/components/cart-badge';

/**
 * Site header. The "Admin" link is shown only when the signed-in user's
 * email matches the ADMIN_EMAIL allowlist. This is a secondary control; the
 * real protection is the middleware + server-action checks.
 */
export default async function Navbar() {
  const user = await getCurrentUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  const showAdmin = Boolean(user && adminEmail && user.email === adminEmail);

  return (
    <header className="border-b border-line bg-canvas">
      <div className="container-page flex items-center justify-between py-4">
        <Link href="/" className="font-serif text-2xl tracking-tight">
          Atlas Clothier
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-ink">
            Shop
          </Link>
          <Link href="/cart" className="text-ink">
            Cart
            <CartBadge />
          </Link>
          {user ? (
            <>
              <Link href="/account/orders" className="text-ink">
                Orders
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link href="/login" className="text-ink">
              Sign in
            </Link>
          )}
          {showAdmin && (
            <Link href="/admin" className="text-clay font-medium">
              Admin
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
