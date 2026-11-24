import Link from 'next/link';
import { getSiteSettings, getActiveSocialLinks, getPublishedPages } from '@/lib/queries/catalog';

const SOCIAL_ICONS: Record<string, string> = {
  instagram: 'IG',
  facebook: 'FB',
  tiktok: 'TK',
  youtube: 'YT',
  pinterest: 'PT',
};

export default async function Footer() {
  const [settings, socialLinks, publishedPages] = await Promise.all([
    getSiteSettings(),
    getActiveSocialLinks(),
    getPublishedPages(),
  ]);

  return (
    <footer className="divider mt-20 dark:border-dark-line">
      <div className="container-page py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <p className="font-serif text-lg mb-2 text-ink dark:text-dark-ink">
              {settings?.store_name ?? 'Atlas Clothier'}
            </p>
            {settings?.contact_email && (
              <p className="text-sm text-muted dark:text-dark-muted">{settings.contact_email}</p>
            )}
            {settings?.contact_phone && (
              <p className="text-sm text-muted dark:text-dark-muted">{settings.contact_phone}</p>
            )}
          </div>

          {/* Pages */}
          {publishedPages.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2 text-ink dark:text-dark-ink">Information</p>
              <div className="flex flex-col gap-1">
                {publishedPages.map((p) => (
                  <Link key={p.slug} href={`/pages/${p.slug}`} className="text-sm text-muted dark:text-dark-muted">
                    {p.title}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Social links */}
          {socialLinks.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2 text-ink dark:text-dark-ink">Follow us</p>
              <div className="flex gap-3">
                {socialLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border border-line dark:border-dark-line px-2 py-1 text-xs text-muted dark:text-dark-muted"
                    aria-label={link.platform}
                  >
                    {SOCIAL_ICONS[link.platform] ?? link.platform.slice(0, 2).toUpperCase()}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-line dark:border-dark-line pt-6 text-sm text-muted dark:text-dark-muted">
          <p>
            {settings?.store_name ?? 'Atlas Clothier'} · Cash on delivery only.
          </p>
        </div>
      </div>
    </footer>
  );
}
