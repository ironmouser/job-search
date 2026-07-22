import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const isAuth = !!token;
    const pathname = req.nextUrl.pathname;
    const isAuthPage = pathname.startsWith('/api/auth');
    const isApiRoute = pathname.startsWith('/api');
    const isOnboardingPage = pathname.startsWith('/onboarding');
    const isPublicAsset = pathname.match(/\.(png|jpg|jpeg|gif|svg|ico)$/);
    const isPublicPage = pathname === '/' || pathname === '/pricing' || pathname === '/login';

    if (isAuthPage || isPublicAsset || isPublicPage) {
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
        const isPublicPage = pathname === '/' || pathname === '/pricing' || pathname === '/login';
        const isPublicAsset = pathname.match(/\.(png|jpg|jpeg|gif|svg|ico)$/);
        const isWorkerApi = pathname.startsWith('/api/worker');
        if (isPublicPage || isPublicAsset || isWorkerApi) return true;
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
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!api/auth|api/webhooks|api/worker|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
