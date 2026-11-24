import { adminGetSettings } from '@/lib/queries/admin';
import { notFound } from 'next/navigation';
import SiteSettingsClient from './client';

export default async function AdminCmsSitePage() {
  const settings = await adminGetSettings();
  if (!settings) notFound();
  return <SiteSettingsClient settings={settings as any} />;
}
