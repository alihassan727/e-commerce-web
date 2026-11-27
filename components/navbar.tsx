import Logo from '@/components/logo';
import NavbarClient from '@/components/navbar-client';
import { getCurrentUser } from '@/lib/admin';
import { getActiveCategories, getSiteSettings } from '@/lib/queries/catalog';

export default async function Navbar() {
  const [user, settings, categories] = await Promise.all([
    getCurrentUser(),
    getSiteSettings(),
    getActiveCategories(),
  ]);
  const adminEmail = process.env.ADMIN_EMAIL;
  const showAdmin = Boolean(
    user?.email &&
      adminEmail &&
      user.email.trim().toLowerCase() === adminEmail.trim().toLowerCase(),
  );

  return (
    <NavbarClient
      logo={<Logo settings={settings} />}
      categories={categories}
      isSignedIn={Boolean(user)}
      showAdmin={showAdmin}
    />
  );
}
