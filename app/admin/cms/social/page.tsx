import { adminListSocialLinks } from '@/lib/queries/account';
import SocialAdminClient from './client';

export default async function AdminCmsSocialPage() {
  const links = await adminListSocialLinks();
  return <SocialAdminClient initialLinks={links as any} />;
}
