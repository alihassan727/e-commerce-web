'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/products', label: 'Products', exact: false },
  { href: '/admin/categories', label: 'Categories', exact: false },
  { href: '/admin/orders', label: 'Orders', exact: false },
  { href: '/admin/customers', label: 'Customers', exact: false },
  { href: '/admin/homepage', label: 'Homepage', exact: false },
  { href: '/admin/settings', label: 'Settings', exact: false },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex md:flex-col gap-1 text-sm overflow-x-auto md:overflow-visible pb-2 md:pb-0">
      {LINKS.map((l) => {
        const active = l.exact ? pathname === l.href : pathname?.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap py-1 md:py-0 ${active ? 'text-clay' : 'text-ink'}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
