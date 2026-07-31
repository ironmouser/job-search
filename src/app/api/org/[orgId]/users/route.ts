import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-helpers";
import {
  getOrganizationUsers,
  updateMemberRole,
  disableMember,
  removeMember,
} from "@/lib/organizations";

type RouteParams = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/users
 * Returns all members of the organization. Always org-scoped.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const { error } = await requireOrgAdmin(orgId);
  if (error) return error;

  try {
    const users = await getOrganizationUsers(orgId);
    return NextResponse.json(users);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/org/[orgId]/users
 * Updates a member's role (promote/demote).
 * Body: { userId: string, role: "USER" | "ORGANIZATION_ADMIN" }
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const { user, error } = await requireOrgAdmin(orgId);
  if (error) return error;

  try {
    const { userId, role } = await request.json();
    if (!userId || !role) {
      return NextResponse.json({ error: "userId and role are required" }, { status: 400 });
    }
    if (!["USER", "ORGANIZATION_ADMIN"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    await updateMemberRole(orgId, userId, role, user!.id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

/**
 * DELETE /api/org/[orgId]/users
 * Removes or disables a member.
 * Body: { userId: string, action: "remove" | "disable" }
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const { user, error } = await requireOrgAdmin(orgId);
  if (error) return error;

  try {
    const { userId, action } = await request.json();
    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

    if (action === "disable") {
      await disableMember(orgId, userId, user!.id);
    } else {
      await removeMember(orgId, userId, user!.id);
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
