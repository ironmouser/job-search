import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-helpers";
import {
  getOrganizationInvitations,
  inviteUser,
  cancelInvitation,
} from "@/lib/organizations";

type RouteParams = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/invitations
 * Returns all invitations for the organization.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const { error } = await requireOrgAdmin(orgId);
  if (error) return error;

  try {
    const invitations = await getOrganizationInvitations(orgId);
    return NextResponse.json(invitations);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/org/[orgId]/invitations
 * Sends an invitation to an email address.
 * Body: { email: string }
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const { user, error } = await requireOrgAdmin(orgId);
  if (error) return error;

  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

    const invitation = await inviteUser({
      organizationId: orgId,
      email,
      invitedBy: user!.id,
    });

    return NextResponse.json(invitation, { status: 201 });
  } catch (e: any) {
    if (e.message === "NO_SEATS_AVAILABLE") {
      return NextResponse.json(
        { error: "No available seats. Purchase additional seats to invite more members." },
        { status: 402 }
      );
    }
    if (e.message === "INVITATION_ALREADY_PENDING") {
      return NextResponse.json(
        { error: "An invitation has already been sent to this email address." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

/**
 * DELETE /api/org/[orgId]/invitations
 * Cancels a pending invitation.
 * Body: { invitationId: string }
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const { user, error } = await requireOrgAdmin(orgId);
  if (error) return error;

  try {
    const { invitationId } = await request.json();
    if (!invitationId) return NextResponse.json({ error: "invitationId is required" }, { status: 400 });

    await cancelInvitation(orgId, invitationId, user!.id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
