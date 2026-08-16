import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-helpers";
import {
  getOrganizationInvitations,
  inviteUser,
  cancelInvitation,
  resendInvitation,
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
    const body = await request.json();
    
    // Bulk invitation support
    if (Array.isArray(body.emails) && body.emails.length > 0) {
      const emails: string[] = body.emails.map((e: string) => e.trim()).filter(Boolean);
      const results: { email: string; success: boolean; error?: string }[] = [];
      let successCount = 0;

      for (const email of emails) {
        try {
          await inviteUser({
            organizationId: orgId,
            email,
            invitedBy: user!.id,
          });
          results.push({ email, success: true });
          successCount++;
        } catch (e: any) {
          let errorMsg = e.message;
          if (e.message === "NO_SEATS_AVAILABLE") {
            errorMsg = "No available seats remaining";
          } else if (e.message === "INVITATION_ALREADY_PENDING") {
            errorMsg = "Invitation already pending";
          }
          results.push({ email, success: false, error: errorMsg });
          // If out of seats, stop attempting further invitations in bulk
          if (e.message === "NO_SEATS_AVAILABLE") {
            break;
          }
        }
      }

      return NextResponse.json({
        successCount,
        total: emails.length,
        results,
      }, { status: 201 });
    }

    const { email } = body;
    if (!email) return NextResponse.json({ error: "email or emails array is required" }, { status: 400 });

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
 * PATCH /api/org/[orgId]/invitations
 * Resends an invitation.
 * Body: { invitationId: string }
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const { user, error } = await requireOrgAdmin(orgId);
  if (error) return error;

  try {
    const { invitationId } = await request.json();
    if (!invitationId) return NextResponse.json({ error: "invitationId is required" }, { status: 400 });

    const updated = await resendInvitation(orgId, invitationId, user!.id);
    return NextResponse.json({ success: true, invitation: updated });
  } catch (e: any) {
    if (e.message === "NO_SEATS_AVAILABLE") {
      return NextResponse.json(
        { error: "No available seats remaining. Purchase more seats to resend this invitation." },
        { status: 402 }
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

