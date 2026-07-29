import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const isAuth = !!token;
    const pathname = req.nextUrl.pathname;
    const isPublicApi = pathname.startsWith('/api/auth') || pathname.startsWith('/api/worker') || pathname.startsWith('/api/webhooks') || pathname === '/api/support';
    const isPublicPage = pathname === '/' || pathname === '/pricing' || pathname === '/login' || pathname === '/privacy' || pathname === '/terms';
    const isPublicAsset = pathname.match(/\.(png|jpg|jpeg|gif|svg|ico)$/);
    const isApiRoute = pathname.startsWith('/api');
    const isOnboardingPage = pathname.startsWith('/onboarding');

    if (isPublicApi || isPublicAsset || isPublicPage) {
      return null;
    }

    if (isAuth && !token.isOnboarded && !isOnboardingPage && !isApiRoute) {
      return NextResponse.redirect(new URL('/onboarding', req.url));
    }

    if (isAuth && token.isOnboarded && isOnboardingPage) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
    if (isAdminRoute) {
      if (token?.role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;
        const isPublicApi = pathname.startsWith('/api/auth') || pathname.startsWith('/api/webhooks') || pathname.startsWith('/api/worker') || pathname === '/api/support';
        const isPublicPage = pathname === '/' || pathname === '/pricing' || pathname === '/login' || pathname === '/privacy' || pathname === '/terms';
        const isPublicAsset = pathname.match(/\.(png|jpg|jpeg|gif|svg|ico)$/);
        if (isPublicPage || isPublicAsset || isPublicApi) return true;
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
    '/((?!api/auth|api/webhooks|api/worker|api/support|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
