import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/admin';
import SignOutButton from '@/components/sign-out-button';

const NAV = [
  { href: '/account', label: 'Dashboard' },
  { href: '/account/profile', label: 'Profile' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/tickets', label: 'Support' },
];

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/account');

  return (
    <div className="container-page py-8">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <aside className="md:w-48 shrink-0">
          <p className="font-serif text-lg mb-4 hidden md:block text-ink dark:text-dark-ink">My Account</p>
          <nav className="flex md:flex-col gap-1 text-sm overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {NAV.map((l) => (
              <AccountNavLink key={l.href} href={l.href}>
                {l.label}
              </AccountNavLink>
            ))}
            <div className="mt-2">
              <SignOutButton />
            </div>
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function AccountNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap py-1 md:py-0 text-ink dark:text-dark-ink"
    >
      {children}
    </Link>
  );
}
