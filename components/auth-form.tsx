'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { safeNextPath } from '@/lib/safe-redirect';

// ---------------------------------------------------------------------------
// Signup flow — two-step OTP verification
// ---------------------------------------------------------------------------
// Step 1: user enters name + email + password.
//   - signUp() creates the unconfirmed account AND triggers the
//     "Confirm signup" email template.
//   - No second API call is made. signUp() alone is responsible for sending
//     the verification email.
//
// Step 2: OTP input.
//   - verifyOtp({ type: 'signup' }) confirms the account and creates a
//     session. The type MUST be 'signup' because the token was issued by
//     signUp(), which uses the Confirm signup template — not the Magic Link
//     template. Using type: 'email' here would look up the wrong token bucket
//     and always fail.
//   - Redirect to `next` (the page the user came from).
//
// Resend:
//   - auth.resend({ type: 'signup', email }) re-sends via the same
//     Confirm signup template. Using signInWithOtp() for resend would use the
//     Magic Link template instead, issuing a different token that cannot be
//     verified with type: 'signup'.
//
// REQUIRED Supabase dashboard change (without this, a link is sent, not a
// code — the OTP input will never match anything):
//   Authentication → Email Templates → Confirm signup
//   Change the email body so it contains {{ .Token }} (the 6-digit code)
//   instead of, or in addition to, {{ .ConfirmationURL }} (the magic link).
//   The Token variable is only populated when the template does NOT include
//   ConfirmationURL. Use Token alone for a pure OTP flow.
//
// Login flow: unchanged — email + password → signInWithPassword → redirect.
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
  const safeNext = safeNextPath(next);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Signup-only state
  const [step, setStep] = useState<SignupStep>('credentials');
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // -------------------------------------------------------------------------
  // Signup Step 1: create account + send OTP
  // -------------------------------------------------------------------------
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

    // signUp() creates the account AND sends the Confirm signup email.
    // No second API call needed. The email template must contain {{ .Token }}
    // (not {{ .ConfirmationURL }}) to deliver a 6-digit code.
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: name.trim() } },
    });

    if (signUpError) {
      setLoading(false);
      if (signUpError.message.toLowerCase().includes('already registered')) {
        setError('An account with this email already exists. Sign in instead.');
      } else {
        setError(signUpError.message);
      }
      return;
    }

    // Account created; the Confirm signup email is on its way.
    // Do NOT call signInWithOtp() here — that uses the Magic Link template
    // and issues a different token that cannot be verified with type: 'signup'.
    setLoading(false);
    setStep('otp');
    startCooldown();
  }

  // -------------------------------------------------------------------------
  // Signup Step 2: verify the 6-digit OTP
  // -------------------------------------------------------------------------
  async function onOtpSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      // 'signup' is the correct type for tokens issued by signUp().
      // Using 'email' here would look up the Magic Link token bucket and fail.
      type: 'signup',
    });
    setLoading(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    router.push(safeNext);
    router.refresh();
  }

  // -------------------------------------------------------------------------
  // Resend OTP — uses auth.resend() with type: 'signup' so Supabase
  // re-sends via the Confirm signup template (same token bucket as the
  // original signUp() call). Using signInWithOtp() here would send via
  // the Magic Link template instead, issuing a token that cannot be
  // verified with type: 'signup'.
  // -------------------------------------------------------------------------
  async function resend() {
    if (resendCooldown > 0 || loading) return;
    setError(null);
    setLoading(true);
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });
    setLoading(false);
    if (resendError) {
      setError(resendError.message);
    } else {
      startCooldown();
    }
  }

  function startCooldown() {
    setResendCooldown(60);
    const id = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------
  async function onLoginSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (loginError) {
      setError(loginError.message);
      return;
    }
    router.push(safeNext);
    router.refresh();
  }

  // =========================================================================
  // Render
  // =========================================================================

  // ---- OTP verification step ----------------------------------------------
  if (mode === 'signup' && step === 'otp') {
    return (
      <form onSubmit={onOtpSubmit} className="flex flex-col gap-4">
        <div className="border border-line p-4">
          <p className="font-medium text-sm">Check your email</p>
          <p className="text-sm text-muted mt-1">
            We sent a 6-digit code to{' '}
            <span className="text-ink">{email}</span>. Enter it below to
            confirm your account.
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

        {error && <p className="text-sm theme-text">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Verifying' : 'Confirm account'}
        </button>

        <div className="flex items-center gap-3 text-sm text-muted">
          <span>Did not receive it?</span>
          <button
            type="button"
            onClick={resend}
            disabled={resendCooldown > 0 || loading}
            className="theme-text disabled:text-muted"
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
          </button>
        </div>

        <button
          type="button"
          className="text-sm text-muted text-left"
          onClick={() => {
            setStep('credentials');
            setOtp('');
            setError(null);
          }}
        >
          Back to sign up
        </button>
      </form>
    );
  }

  // ---- Signup credentials step --------------------------------------------
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

        {error && <p className="text-sm theme-text">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Please wait' : 'Continue'}
        </button>

        <p className="text-sm text-muted">
          Already have an account?{' '}
          <Link
            href={`/login?next=${encodeURIComponent(safeNext)}`}
            className="theme-text"
          >
            Sign in
          </Link>
        </p>
      </form>
    );
  }

  // ---- Login form ---------------------------------------------------------
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

      {error && <p className="text-sm theme-text">{error}</p>}

      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? 'Please wait' : 'Sign in'}
      </button>

      <p className="text-sm text-muted">
        New here?{' '}
        <Link
          href={`/signup?next=${encodeURIComponent(safeNext)}`}
          className="theme-text"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
