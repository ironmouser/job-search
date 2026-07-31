import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// ─── Role predicates ─────────────────────────────────────────────────────────

export function isSystemAdmin(role: string) {
  return role === "SYSTEM_ADMIN" || role === "ADMIN";
}

export function isOrgAdmin(role: string) {
  return role === "ORGANIZATION_ADMIN" || role === "SYSTEM_ADMIN";
}

export function isGroupUser(subscriptionType: string) {
  return subscriptionType === "GROUP";
}

// ─── Server-side session guards ───────────────────────────────────────────────

/**
 * Verifies the caller is a SYSTEM_ADMIN.
 * Returns the session user or throws a NextResponse 401/403.
 */
export async function requireSystemAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const role = (session.user as any).role as string;
  if (!isSystemAdmin(role)) {
    return { user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user: session.user, error: null };
}

/**
 * Verifies the caller is an ORGANIZATION_ADMIN (or SYSTEM_ADMIN) for the
 * given organization. System Admins bypass the org membership check.
 *
 * Returns the DB user record or an error response.
 */
export async function requireOrgAdmin(organizationId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { user: null, dbUser: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const sessionUser = session.user as any;
  const role = sessionUser.role as string;

  // System Admins have full access across all orgs
  if (isSystemAdmin(role)) {
    const dbUser = await prisma.user.findUnique({ where: { id: sessionUser.id } });
    return { user: sessionUser, dbUser, error: null };
  }

  if (!isOrgAdmin(role)) {
    return { user: null, dbUser: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  // Ensure org admin actually belongs to this organization
  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, organizationId: true, role: true, isDisabled: true },
  });

  if (!dbUser || dbUser.organizationId !== organizationId) {
    return { user: null, dbUser: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user: sessionUser, dbUser, error: null };
}

/**
 * Verifies the caller is authenticated and not disabled.
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user: session.user as any, error: null };
}
