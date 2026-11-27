'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import CartBadge from '@/components/cart-badge';
import ThemeToggle from '@/components/theme-toggle';
import SignOutButton from '@/components/sign-out-button';
import type { Category } from '@/lib/types';

export default function NavbarClient({
  logo,
  categories,
  isSignedIn,
  showAdmin,
}: {
  logo: ReactNode;
  categories: Category[];
  isSignedIn: boolean;
  showAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const visibleCategories = categories.slice(0, 5);

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    setSearchOpen(false);
    setMobileOpen(false);
    if (trimmed) {
      router.push(`/shop?q=${encodeURIComponent(trimmed)}`);
    } else {
      router.push('/shop');
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line dark:border-dark-line bg-canvas dark:bg-dark-canvas">
      <div className="container-page flex items-center justify-between gap-4 h-16">
        {/* Left: Mobile menu button + Logo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="md:hidden p-1.5 -ml-1.5 rounded text-ink dark:text-dark-ink hover:bg-line/40 dark:hover:bg-dark-line/40"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              {mobileOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="7" x2="21" y2="7" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="17" x2="21" y2="17" />
                </>
              )}
            </svg>
          </button>
          <div className="shrink-0">{logo}</div>
        </div>

        {/* Center: Primary navigation (Desktop) */}
        <nav className="hidden md:flex items-center gap-6 text-sm" aria-label="Main navigation">
          <Link
            href="/shop"
            className={`font-medium transition-colors ${
              pathname === '/shop'
                ? 'theme-text'
                : 'text-ink dark:text-dark-ink hover:text-muted dark:hover:text-dark-muted'
            }`}
          >
            Shop All
          </Link>
          {visibleCategories.map((c) => {
            const active = pathname === `/category/${c.slug}`;
            return (
              <Link
                key={c.id}
                href={`/category/${c.slug}`}
                className={`transition-colors whitespace-nowrap ${
                  active
                    ? 'theme-text font-medium'
                    : 'text-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-ink'
                }`}
              >
                {c.name}
              </Link>
            );
          })}
        </nav>

        {/* Right: Search, Account, Cart, Theme */}
        <div className="flex items-center gap-3 text-sm">
          {/* Desktop Search */}
          {searchOpen ? (
            <form onSubmit={onSearchSubmit} className="hidden sm:flex items-center gap-1.5">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products..."
                autoFocus
                className="input py-1 px-2.5 text-xs w-44"
                aria-label="Search products"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="text-xs text-muted dark:text-dark-muted px-1"
                aria-label="Close search"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden sm:inline-flex items-center justify-center p-1.5 rounded text-ink dark:text-dark-ink hover:bg-line/40 dark:hover:bg-dark-line/40"
              aria-label="Search"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}

          {showAdmin && (
            <Link
              href="/admin"
              className="hidden sm:inline-block theme-text font-medium text-xs border border-line dark:border-dark-line rounded px-2 py-1"
            >
              Admin
            </Link>
          )}

          {isSignedIn ? (
            <Link
              href="/account"
              className="inline-flex items-center gap-1.5 text-ink dark:text-dark-ink hover:text-muted dark:hover:text-dark-muted p-1"
              aria-label="Account"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span className="hidden lg:inline">Account</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-ink dark:text-dark-ink hover:text-muted dark:hover:text-dark-muted font-medium"
            >
              Sign in
            </Link>
          )}

          <Link
            href="/cart"
            className="inline-flex items-center gap-1.5 text-ink dark:text-dark-ink hover:text-muted dark:hover:text-dark-muted p-1"
            aria-label="Shopping cart"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <span className="hidden lg:inline">Cart</span>
            <CartBadge />
          </Link>

          <ThemeToggle />
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-line dark:border-dark-line bg-surface dark:bg-dark-surface px-4 py-4 flex flex-col gap-4">
          <form onSubmit={onSearchSubmit} className="flex gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clothing..."
              className="input text-sm"
              aria-label="Search products"
            />
            <button type="submit" className="btn btn-primary px-4 py-2 text-xs">
              Search
            </button>
          </form>

          <nav className="flex flex-col gap-2.5 text-sm" aria-label="Mobile navigation">
            <Link
              href="/shop"
              onClick={() => setMobileOpen(false)}
              className={`font-medium py-1 ${pathname === '/shop' ? 'theme-text' : 'text-ink dark:text-dark-ink'}`}
            >
              Shop All
            </Link>
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/category/${c.slug}`}
                onClick={() => setMobileOpen(false)}
                className={`py-1 ${
                  pathname === `/category/${c.slug}`
                    ? 'theme-text font-medium'
                    : 'text-muted dark:text-dark-muted'
                }`}
              >
                {c.name}
              </Link>
            ))}
          </nav>

          <div className="border-t border-line dark:border-dark-line pt-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              {isSignedIn ? (
                <>
                  <Link href="/account" onClick={() => setMobileOpen(false)} className="text-ink dark:text-dark-ink font-medium">
                    Account
                  </Link>
                  <SignOutButton />
                </>
              ) : (
                <Link href="/login" onClick={() => setMobileOpen(false)} className="text-ink dark:text-dark-ink font-medium">
                  Sign in
                </Link>
              )}
            </div>
            {showAdmin && (
              <Link href="/admin" onClick={() => setMobileOpen(false)} className="theme-text font-medium">
                Admin
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
