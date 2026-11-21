import AuthForm from '@/components/auth-form';

export default function SignupPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = typeof searchParams?.next === 'string' ? searchParams.next : '/';
  return (
    <section className="container-page py-16 max-w-md">
      <h1 className="font-serif text-3xl mb-6">Create an account</h1>
      <p className="text-sm text-muted mb-6">
        Optional. You can also check out as a guest. An account lets you track
        your orders.
      </p>
      <AuthForm mode="signup" next={next} />
    </section>
  );
}
