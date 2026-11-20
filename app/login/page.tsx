import AuthForm from '@/components/auth-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = typeof searchParams?.next === 'string' ? searchParams.next : '/';
  return (
    <section className="container-page py-16 max-w-md">
      <h1 className="font-serif text-3xl mb-6">Sign in</h1>
      <AuthForm mode="login" next={next} />
    </section>
  );
}
