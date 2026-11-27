import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware refreshes the Supabase session on every request and enforces
 * route protection:
 *  - /admin/*      : only the ADMIN_EMAIL user may pass; everyone else is
 *                    rewritten to /unauthorized (the URL stays /admin, so the
 *                    block is not leaked as a redirect).
 *  - /account/*   : requires a signed-in user; anonymous is redirected to
 *                    /login?next=<path>.
 * The email check here is the first line of defense; every admin server action
 * re-verifies identity with requireAdmin() before doing any write.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set({ name, value, ...options });
          });
        },
      },
    },
  );

  // getUser() also refreshes the session cookies (written via setAll above).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (path.startsWith('/admin')) {
    const adminEmail = process.env.ADMIN_EMAIL;
    const userEmail = user?.email?.trim().toLowerCase();
    if (!user || !adminEmail || userEmail !== adminEmail.trim().toLowerCase()) {
      const url = request.nextUrl.clone();
      url.pathname = '/unauthorized';
      return NextResponse.rewrite(url);
    }
  }

  if (path.startsWith('/account')) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', path);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/account/:path*'],
};
