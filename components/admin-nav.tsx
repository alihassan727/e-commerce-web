'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS = [
  {
    group: 'Store',
    links: [
      { href: '/admin', label: 'Dashboard', exact: true },
      { href: '/admin/products', label: 'Products', exact: false },
      { href: '/admin/categories', label: 'Categories', exact: false },
      { href: '/admin/orders', label: 'Orders', exact: false },
      { href: '/admin/customers', label: 'Customers', exact: false },
    ],
  },
  {
    group: 'Support',
    links: [
      { href: '/admin/tickets', label: 'Tickets', exact: false },
      { href: '/admin/reviews', label: 'Reviews', exact: false },
    ],
  },
  {
    group: 'Content',
    links: [
      { href: '/admin/homepage', label: 'Homepage', exact: false },
      { href: '/admin/cms/hero', label: 'Hero section', exact: false },
      { href: '/admin/cms/features', label: 'Features', exact: false },
      { href: '/admin/cms/pages', label: 'Pages', exact: false },
      { href: '/admin/cms/social', label: 'Social links', exact: false },
      { href: '/admin/cms/site', label: 'Site settings', exact: false },
    ],
  },
  {
    group: 'Config',
    links: [
      { href: '/admin/payments', label: 'Payments', exact: false },
      { href: '/admin/settings', label: 'Settings', exact: false },
    ],
  },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex md:flex-col gap-1 text-sm overflow-x-auto md:overflow-visible pb-2 md:pb-0">
      {SECTIONS.map((section) => (
        <div key={section.group} className="flex md:flex-col gap-1">
          <p className="hidden md:block text-xs text-muted dark:text-dark-muted mt-3 mb-0.5 uppercase tracking-wider">
            {section.group}
          </p>
          {section.links.map((l) => {
            const active = l.exact ? pathname === l.href : pathname?.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap py-1 md:py-0 ${active ? 'theme-text' : 'text-ink dark:text-dark-ink'}`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
