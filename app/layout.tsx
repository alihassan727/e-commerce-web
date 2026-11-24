import type { Metadata } from 'next';
import { Fraunces, IBM_Plex_Sans } from 'next/font/google';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import { CartProvider } from '@/lib/cart-context';
import { ThemeProvider } from '@/components/theme-provider';
import { getSiteSettings } from '@/lib/queries/catalog';
import { buildThemeVars } from '@/lib/theme-color';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

const ibmPlex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    title: settings?.seo_title || settings?.store_name || 'Atlas Clothier',
    description: settings?.meta_description || 'Seasonal clothing, made well and delivered to your door.',
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSiteSettings();
  const showAnnouncement = settings?.announcement_active && settings?.announcement_text;

  // Build all theme CSS variables from the saved base color. The variables
  // are injected into :root via an inline <style> tag so they are available
  // before any client JS runs — no flash on initial page load.
  const themeVars = buildThemeVars(settings?.button_color ?? '#A8472D');
  // Also keep the legacy --btn-color alias so existing btn-primary rules
  // that reference it continue to work without change.
  themeVars['--btn-color'] = themeVars['--accent'];
  themeVars['--btn-color-dark'] = themeVars['--accent-dark'];
  const themeStyle = Object.entries(themeVars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');

  return (
    <html lang="en" className={`${fraunces.variable} ${ibmPlex.variable}`} suppressHydrationWarning>
      <head>
        {/* Anti-flash dark-mode script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e){}
})();
`,
          }}
        />
        {/*
          Inject the global button color as a CSS custom property.
          This runs on the server so the value is embedded in the HTML before
          any client JS runs — no color flash on page load.
          The property is set on :root so all .btn-primary rules can consume it.
        */}
        <style dangerouslySetInnerHTML={{ __html: `:root{${themeStyle}}` }} />
      </head>
      <body className="bg-canvas dark:bg-dark-canvas text-ink dark:text-dark-ink font-sans min-h-screen flex flex-col">
        <ThemeProvider>
          <CartProvider>
            {showAnnouncement && (
              <div className="announcement-bar">
                {settings.announcement_text}
              </div>
            )}
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </CartProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
