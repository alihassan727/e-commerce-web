import SettingsForm from '@/components/settings-form';
import { adminGetSettings } from '@/lib/queries/admin';
import { notFound } from 'next/navigation';

export default async function AdminSettingsPage() {
  const settings = await adminGetSettings();
  if (!settings) {
    // Should not happen after the migration seeds the singleton row.
    notFound();
  }
  return (
    <div>
      <h1 className="font-serif text-3xl mb-6">Settings</h1>
      <SettingsForm settings={settings} />
    </div>
  );
}
