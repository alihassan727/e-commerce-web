import Link from 'next/link';
import {
  getSiteSettings,
  getActiveSocialLinks,
  getPublishedPages,
  getActiveCategories,
} from '@/lib/queries/catalog';

const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
};

export default async function Footer() {
  const [settings, socialLinks, publishedPages, categories] = await Promise.all([
    getSiteSettings(),
    getActiveSocialLinks(),
    getPublishedPages(),
    getActiveCategories(),
  ]);

  const storeName = settings?.store_name ?? 'Atlas Clothier';

  return (
    <footer className="divider mt-24 bg-surface/60 dark:bg-dark-surface/60">
      <div className="container-page py-12 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-10 mb-10">
          {/* Brand */}
          <div className="sm:col-span-2 md:col-span-1">
            <p className="font-serif text-xl tracking-tight mb-2.5 text-ink dark:text-dark-ink">
              {storeName}
            </p>
            <p className="text-sm text-muted dark:text-dark-muted leading-relaxed max-w-xs">
              {settings?.meta_description || 'Seasonal clothing, made well and delivered to your door.'}
            </p>
            {(settings?.contact_email || settings?.contact_phone) && (
              <div className="mt-4 flex flex-col gap-1 text-xs text-muted dark:text-dark-muted">
                {settings.contact_email && <span>{settings.contact_email}</span>}
                {settings.contact_phone && <span>{settings.contact_phone}</span>}
              </div>
            )}
          </div>

          {/* Shop */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3 text-ink dark:text-dark-ink">
              Shop
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <Link href="/shop" className="text-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-ink">
                All products
              </Link>
              {categories.slice(0, 5).map((c) => (
                <Link
                  key={c.id}
                  href={`/category/${c.slug}`}
                  className="text-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-ink"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Pages */}
          {publishedPages.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3 text-ink dark:text-dark-ink">
                Information
              </p>
              <div className="flex flex-col gap-2 text-sm">
                {publishedPages.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/${p.slug}`}
                    className="text-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-ink"
                  >
                    {p.title}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Social links */}
          {socialLinks.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3 text-ink dark:text-dark-ink">
                Follow us
              </p>
              <div className="flex flex-wrap gap-2">
                {socialLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-line dark:border-dark-line px-3 py-1.5 text-xs font-medium text-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-ink hover:border-muted dark:hover:border-dark-muted transition-colors"
                    aria-label={link.platform}
                  >
                    {SOCIAL_LABELS[link.platform] ?? link.platform}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-line dark:border-dark-line pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-muted dark:text-dark-muted">
          <p>{storeName}. All rights reserved.</p>
          <p>Cash on delivery across supported areas.</p>
        </div>
      </div>
    </footer>
  );
}
