import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acceptInvitation } from "@/lib/organizations";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

type RouteParams = { params: Promise<{ token: string }> };

/**
 * GET /api/org/invite/accept/[token]
 * Public endpoint. Accepts an organization invitation.
 *
 * Flow:
 * 1. If the user is already signed in, link them to the org immediately.
 * 2. If not signed in, redirect to /login with returnUrl pointing back here
 *    so they sign in first, then come back to accept.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { token } = await params;
  const { origin } = new URL(request.url);

  // Check the invitation exists before requiring auth
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { token },
    include: { organization: { select: { name: true } } },
  });

  if (!invitation) {
    return NextResponse.redirect(`${origin}/login?invite_error=not_found`);
  }
  if (invitation.status !== "PENDING") {
    return NextResponse.redirect(`${origin}/login?invite_error=already_used`);
  }
  if (invitation.expiresAt < new Date()) {
    return NextResponse.redirect(`${origin}/login?invite_error=expired`);
  }

  const session = await getServerSession(authOptions);

  // Not signed in — redirect to login, then return here
  if (!session?.user) {
    const returnUrl = encodeURIComponent(`/api/org/invite/accept/${token}`);
    return NextResponse.redirect(`${origin}/login?invite=${invitation.organization.name}&returnUrl=${returnUrl}`);
  }

  try {
    await acceptInvitation(token, session.user.id);
    // Redirect to onboarding if not yet onboarded, else to org admin dashboard
    const sessionUser = session.user as any;
    if (!sessionUser.isOnboarded) {
      return NextResponse.redirect(`${origin}/onboarding?welcome=org`);
    }
    return NextResponse.redirect(`${origin}/org-admin?welcome=true`);
  } catch (e: any) {
    console.error("Invitation accept error:", e);
    return NextResponse.redirect(`${origin}/dashboard?invite_error=${encodeURIComponent(e.message)}`);
  }
}
