import AuthForm from '@/components/auth-form';
import { safeNextPath } from '@/lib/safe-redirect';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = safeNextPath(searchParams?.next);
  return (
    <section className="container-page py-16 max-w-md">
      <h1 className="font-serif text-3xl mb-6">Sign in</h1>
      <AuthForm mode="login" next={next} />
    </section>
  );
}
