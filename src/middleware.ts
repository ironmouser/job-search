import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const isAuth = !!token;
    const pathname = req.nextUrl.pathname;
    const isPublicApi = pathname.startsWith('/api/auth') || pathname.startsWith('/api/worker') || pathname.startsWith('/api/webhooks') || pathname === '/api/support';
    const isPublicPage = pathname === '/' || pathname === '/pricing' || pathname === '/login' || pathname === '/privacy' || pathname === '/terms' || pathname === '/about';
    const isPublicAsset = pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webmanifest|json)$/);
    const isApiRoute = pathname.startsWith('/api');
    const isOnboardingPage = pathname.startsWith('/onboarding');

    // Public invitation accept endpoint
    const isPublicInvite = pathname.startsWith('/api/org/invite/accept');

    if (isPublicApi || isPublicAsset || isPublicPage || isPublicInvite) {
      return null;
    }

    const userRole = token?.role as string | undefined;

    // Organization admins do not need candidate onboarding and are redirected to /org-admin
    if (isAuth && userRole === 'ORGANIZATION_ADMIN') {
      if (isOnboardingPage || pathname === '/dashboard' || pathname.startsWith('/pipeline') || pathname.startsWith('/profile') || pathname.startsWith('/analytics')) {
        return NextResponse.redirect(new URL('/org-admin', req.url));
      }
    }

    if (isAuth && !token.isOnboarded && !isOnboardingPage && !isApiRoute && userRole !== 'ORGANIZATION_ADMIN') {
      return NextResponse.redirect(new URL('/onboarding', req.url));
    }

    if (isAuth && token.isOnboarded && isOnboardingPage) {
      const target = userRole === 'ORGANIZATION_ADMIN' ? '/org-admin' : '/dashboard';
      return NextResponse.redirect(new URL(target, req.url));
    }

    // System Admin routes — SYSTEM_ADMIN only
    const isSystemAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
    if (isSystemAdminRoute) {
      if (token?.role !== 'SYSTEM_ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }

    // Organization Admin routes — ORGANIZATION_ADMIN or SYSTEM_ADMIN
    const isOrgAdminRoute = pathname.startsWith('/org-admin') || pathname.startsWith('/api/org');
    if (isOrgAdminRoute) {
      const role = token?.role as string | undefined;
      if (role !== 'ORGANIZATION_ADMIN' && role !== 'SYSTEM_ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;
        const isPublicApi = pathname.startsWith('/api/auth') || pathname.startsWith('/api/webhooks') || pathname.startsWith('/api/worker') || pathname === '/api/support';
        const isPublicPage = pathname === '/' || pathname === '/pricing' || pathname === '/login' || pathname === '/privacy' || pathname === '/terms' || pathname === '/about';
        const isPublicAsset = pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webmanifest|json)$/);
        const isPublicInvite = pathname.startsWith('/api/org/invite/accept');
        if (isPublicPage || isPublicAsset || isPublicApi || isPublicInvite) return true;
        return !!token;
      },
    },
    pages: {
      signIn: '/login',
    }
  }
)

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (API routes for authentication)
     * - api/webhooks (Stripe and other webhooks)
     * - api/worker (DigitalOcean worker endpoints)
     * - api/support (Public support request endpoint)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!api/auth|api/webhooks|api/worker|api/support|_next/static|_next/image|favicon.ico|site.webmanifest|sitemap.xml|robots.txt).*)',
  ],
}
