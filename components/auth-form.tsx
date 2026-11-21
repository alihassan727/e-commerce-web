'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Signup flow (OTP-based)
// ---------------------------------------------------------------------------
// Step 1: user enters name + email + password → signUp() fires, Supabase
//         sends a 6-digit OTP to the email address.
// Step 2: OTP input appears. User types the code → verifyOtp() confirms the
//         account, creates a session, and redirects to `next`.
//
// This requires "Email OTP" to be enabled in your Supabase project:
//   Auth → Email Templates → Confirm signup → set type to OTP (not magic link)
//   OR: Auth → Providers → Email → "Confirm email" ON + "Secure email change"
//   The key is that signUp() without an emailRedirectTo causes Supabase to
//   send a 6-digit code instead of a link.
//
// Login flow is unchanged: email + password → signInWithPassword → redirect.
// ---------------------------------------------------------------------------

type SignupStep = 'credentials' | 'otp';

export default function AuthForm({
  mode,
  next = '/',
}: {
  mode: 'login' | 'signup';
  next?: string;
}) {
  const supabase = createClient();
  const router = useRouter();

  // Shared fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Signup-only: which step we are on
  const [step, setStep] = useState<SignupStep>('credentials');
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // ---- Step 1: submit credentials, receive OTP in email ------------------
  async function onSignupSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: name.trim() },
        // No emailRedirectTo → Supabase sends a 6-digit OTP code, not a link.
      },
    });
    setLoading(false);

    if (error) {
      // "User already registered" means they have an account; direct to login.
      if (error.message.toLowerCase().includes('already registered')) {
        setError('An account with this email already exists. Sign in instead.');
      } else {
        setError(error.message);
      }
      return;
    }

    // OTP sent — show the verification step.
    setStep('otp');
    startCooldown();
  }

  // ---- Step 2: verify the OTP code ---------------------------------------
  async function onOtpSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const code = otp.trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type: 'signup',
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Verified — session is active. Go to the destination page.
    router.push(next);
    router.refresh();
  }

  // ---- Resend OTP --------------------------------------------------------
  async function resend() {
    if (resendCooldown > 0) return;
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      startCooldown();
    }
  }

  function startCooldown() {
    setResendCooldown(60);
    const id = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(id); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  // ---- Login form --------------------------------------------------------
  async function onLoginSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  // ========================================================================
  // Render
  // ========================================================================

  if (mode === 'signup' && step === 'otp') {
    return (
      <form onSubmit={onOtpSubmit} className="flex flex-col gap-4">
        <div className="border border-line p-4">
          <p className="font-medium text-sm">Check your email</p>
          <p className="text-sm text-muted mt-1">
            We sent a 6-digit code to <span className="text-ink">{email}</span>.
            Enter it below to confirm your account.
          </p>
        </div>

        <div className="field">
          <label htmlFor="otp">Verification code</label>
          <input
            id="otp"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            className="input tracking-widest text-lg"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            autoComplete="one-time-code"
            autoFocus
          />
        </div>

        {error && <p className="text-sm text-clay">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Verifying' : 'Confirm account'}
        </button>

        <div className="flex items-center gap-3 text-sm text-muted">
          <span>Did not receive it?</span>
          <button
            type="button"
            onClick={resend}
            disabled={resendCooldown > 0 || loading}
            className="text-clay disabled:text-muted"
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
          </button>
        </div>

        <button
          type="button"
          className="text-sm text-muted text-left"
          onClick={() => { setStep('credentials'); setOtp(''); setError(null); }}
        >
          Back to sign up
        </button>
      </form>
    );
  }

  if (mode === 'signup') {
    return (
      <form onSubmit={onSignupSubmit} className="flex flex-col gap-4">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted mt-1">At least 6 characters.</p>
        </div>

        {error && <p className="text-sm text-clay">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Please wait' : 'Continue'}
        </button>

        <p className="text-sm text-muted">
          Already have an account?{' '}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-clay">
            Sign in
          </Link>
        </p>
      </form>
    );
  }

  // Login
  return (
    <form onSubmit={onLoginSubmit} className="flex flex-col gap-4">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="current-password"
        />
      </div>

      {error && <p className="text-sm text-clay">{error}</p>}

      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? 'Please wait' : 'Sign in'}
      </button>

      <p className="text-sm text-muted">
        New here?{' '}
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-clay">
          Create an account
        </Link>
      </p>
    </form>
  );
}
