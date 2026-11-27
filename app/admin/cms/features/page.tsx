import { adminListFeatures } from '@/lib/queries/account';
import FeaturesAdminClient from './client';

export default async function AdminCmsFeaturesPage() {
  const features = await adminListFeatures();
  return <FeaturesAdminClient initialFeatures={features} />;
}
