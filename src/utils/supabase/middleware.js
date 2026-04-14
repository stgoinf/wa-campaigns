import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const updateSession = async (request) => {
  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  );

  // Do NOT remove this code. It's necessary for refreshing sessions.
  const { data: { user } } = await supabase.auth.getUser();

  // Route Protection Logic
  const isDashboardRoute = request.nextUrl.pathname.startsWith('/dashboard')
  const isAuthRoute = request.nextUrl.pathname === '/' || request.nextUrl.pathname.startsWith('/register')

  if (!user && isDashboardRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  if (user) {
    // Check approval status
    const { data: profile } = await supabase
      .from('profiles')
      .select('approved, role')
      .eq('id', user.id)
      .single();

    const isPendingPage = request.nextUrl.pathname === '/pending-approval';
    const isAdminRoute = request.nextUrl.pathname.startsWith('/dashboard/admin');

    // Admin Whitelist check
    const adminEmails = process.env.NEXT_PUBLIC_ADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
    const isWhitelisted = adminEmails.includes(user.email);

    // 1. Redirect unapproved users to pending page
    // Whitelisted admins bypass this check
    if (!profile?.approved && !isPendingPage && isDashboardRoute && !isWhitelisted) {
      const url = request.nextUrl.clone();
      url.pathname = '/pending-approval';
      return NextResponse.redirect(url);
    }

    // 2. Redirect approved users away from pending page
    if (profile?.approved && isPendingPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    // 3. Simple Admin Authorization
    if (isAdminRoute && profile?.role !== 'admin' && !isWhitelisted) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    // 4. Redirect logged-in and approved users away from auth routes
    if (isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }


  return supabaseResponse
};
