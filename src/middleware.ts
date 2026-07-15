import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const isAuth = !!token;
    const isAuthPage = req.nextUrl.pathname.startsWith('/api/auth');
    const isApiRoute = req.nextUrl.pathname.startsWith('/api');
    const isOnboardingPage = req.nextUrl.pathname.startsWith('/onboarding');
    const isPublicAsset = req.nextUrl.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico)$/);

    if (isAuthPage || isPublicAsset) {
      return null;
    }

    if (isAuth && !token.isOnboarded && !isOnboardingPage && !isApiRoute) {
      return NextResponse.redirect(new URL('/onboarding', req.url));
    }

    if (isAuth && token.isOnboarded && isOnboardingPage) {
      return NextResponse.redirect(new URL('/', req.url));
    }

    const isAdminRoute = req.nextUrl.pathname.startsWith('/admin') || req.nextUrl.pathname.startsWith('/api/admin');
    if (isAdminRoute) {
      if (token?.role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/', req.url));
      }
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
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
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
