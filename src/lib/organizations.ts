import { prisma } from "@/lib/prisma";
import { OrganizationType, InvitationStatus, SubscriptionType } from "@prisma/client";
import { sendOrganizationInvitation } from "@/lib/mailer";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateOrganizationInput {
  name: string;
  organizationType: OrganizationType;
  createdBy: string; // userId of the creator (becomes first ORGANIZATION_ADMIN)
}

export interface InviteUserInput {
  organizationId: string;
  email: string;
  invitedBy: string; // userId of the admin sending invite
}

// ─── Organization CRUD ────────────────────────────────────────────────────────

/**
 * Creates a new organization and promotes the creator to ORGANIZATION_ADMIN.
 */
export async function createOrganization(input: CreateOrganizationInput) {
  const org = await prisma.organization.create({
    data: {
      name: input.name,
      organizationType: input.organizationType,
      createdBy: input.createdBy,
    },
  });

  // Promote creator to org admin and assign them to this org
  await prisma.user.update({
    where: { id: input.createdBy },
    data: {
      organizationId: org.id,
      role: "ORGANIZATION_ADMIN",
      subscriptionType: "GROUP",
    },
  });

  await logActivity(org.id, input.createdBy, "ORGANIZATION_CREATED");

  return org;
}

/**
 * Retrieves an organization by ID.
 */
export async function getOrganization(orgId: string) {
  return prisma.organization.findUnique({
    where: { id: orgId },
  });
}

/**
 * Returns remaining available passes for an organization.
 */
export async function getRemainingSeats(org: { id: string; seatCount: number; consumedSeats: number }) {
  const pendingInvites = await prisma.organizationInvitation.count({
    where: { organizationId: org.id, status: "PENDING" },
  });
  return org.seatCount - org.consumedSeats - pendingInvites;
}

// ─── User Management ──────────────────────────────────────────────────────────

/**
 * Returns all users belonging to the given organization.
 * Always filtered by organizationId to prevent cross-org data leakage.
 */
export async function getOrganizationUsers(orgId: string) {
  return prisma.user.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      subscriptionType: true,
      isDisabled: true,
      createdAt: true,
      lastLoginAt: true,
      orgAccessExpiresAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Promotes or demotes a user's role within the organization.
 * Only ORGANIZATION_ADMIN and USER roles are valid targets.
 */
export async function updateMemberRole(
  orgId: string,
  targetUserId: string,
  newRole: "USER" | "ORGANIZATION_ADMIN",
  actorId: string
) {
  // Ensure target belongs to this org
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, organizationId: orgId },
  });
  if (!target) throw new Error("User not found in this organization");

  await prisma.user.update({
    where: { id: targetUserId },
    data: { role: newRole },
  });

  await logActivity(orgId, actorId, newRole === "ORGANIZATION_ADMIN" ? "USER_PROMOTED" : "USER_DEMOTED", targetUserId);
}

/**
 * Disables a user and frees their seat.
 */
export async function disableMember(orgId: string, targetUserId: string, actorId: string) {
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, organizationId: orgId },
  });
  if (!target) throw new Error("User not found in this organization");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetUserId },
      data: { isDisabled: true },
    }),
  ]);

  await logActivity(orgId, actorId, "USER_DISABLED", targetUserId);
}

/**
 * Removes a user from the organization entirely and frees their seat.
 */
export async function removeMember(orgId: string, targetUserId: string, actorId: string) {
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, organizationId: orgId },
  });
  if (!target) throw new Error("User not found in this organization");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetUserId },
      data: {
        organizationId: null,
        role: "USER",
        subscriptionType: "FREE",
        isDisabled: false,
        orgAccessExpiresAt: null,
      },
    }),
  ]);

  await logActivity(orgId, actorId, "USER_REMOVED", targetUserId);
}

// ─── Invitations ──────────────────────────────────────────────────────────────

/**
 * Sends an invitation to join the organization.
 * Checks seat availability before creating the invitation record.
 */
export async function inviteUser(input: InviteUserInput) {
  const org = await prisma.organization.findUnique({ where: { id: input.organizationId } });
  if (!org) throw new Error("Organization not found");

  const remaining = await getRemainingSeats(org);
  if (remaining <= 0) {
    throw new Error("NO_SEATS_AVAILABLE");
  }

  // Check for an existing pending invitation
  const existing = await prisma.organizationInvitation.findFirst({
    where: {
      organizationId: input.organizationId,
      email: input.email,
      status: "PENDING",
    },
  });
  if (existing) throw new Error("INVITATION_ALREADY_PENDING");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

  const invitation = await prisma.organizationInvitation.create({
    data: {
      organizationId: input.organizationId,
      email: input.email,
      invitedBy: input.invitedBy,
      expiresAt,
    },
  });

  const inviteUrl = `${process.env.NEXTAUTH_URL}/api/org/invite/accept/${invitation.token}`;
  await sendOrganizationInvitation(input.email, org.name, inviteUrl, expiresAt);

  await logActivity(input.organizationId, input.invitedBy, "INVITE_SENT", invitation.id);

  return invitation;
}

/**
 * Accepts an invitation. If the user already exists, links them to the org.
 * If not, a new account will be created via the auth flow after this returns.
 * Atomically increments activeSeatCount.
 */
export async function acceptInvitation(token: string, userId: string) {
  const invitation = await prisma.organizationInvitation.findUnique({ 
    where: { token },
    include: { organization: true },
  });

  if (!invitation) throw new Error("INVITATION_NOT_FOUND");
  if (invitation.status !== "PENDING") throw new Error("INVITATION_ALREADY_USED");
  if (invitation.expiresAt < new Date()) {
    await prisma.organizationInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    throw new Error("INVITATION_EXPIRED");
  }

  await prisma.$transaction([
    prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        organizationId: invitation.organizationId,
        subscriptionType: "GROUP",
        role: "USER",
        isDisabled: false,
        orgAccessExpiresAt: new Date(Date.now() + (invitation.organization.seatValidityDays * 24 * 60 * 60 * 1000)),
      },
    }),
    prisma.organization.update({
      where: { id: invitation.organizationId },
      data: { consumedSeats: { increment: 1 } },
    }),
  ]);

  await logActivity(invitation.organizationId, userId, "INVITE_ACCEPTED", invitation.id);

  return invitation;
}

/**
 * Cancels a pending invitation.
 */
export async function cancelInvitation(orgId: string, invitationId: string, actorId: string) {
  const inv = await prisma.organizationInvitation.findFirst({
    where: { id: invitationId, organizationId: orgId, status: "PENDING" },
  });
  if (!inv) throw new Error("Invitation not found or already resolved");

  await prisma.organizationInvitation.update({
    where: { id: invitationId },
    data: { status: "CANCELLED" },
  });

  await logActivity(orgId, actorId, "INVITE_CANCELLED", invitationId);
}

/**
 * Returns all invitations for an organization.
 */
export async function getOrganizationInvitations(orgId: string) {
  return prisma.organizationInvitation.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
  });
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

/**
 * Appends an activity record to the organization's log.
 */
export async function logActivity(
  organizationId: string,
  actorId: string,
  action: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) {
  try {
    await prisma.organizationActivityLog.create({
      data: {
        organizationId,
        actorId,
        action,
        targetId,
        metadata: metadata ? (metadata as any) : undefined,
      },
    });
  } catch (e) {
    // Never let activity logging break primary flows
    console.error("Failed to write organization activity log:", e);
  }
}

/**
 * Returns paginated activity logs for an organization (newest first).
 */
export async function getActivityLog(orgId: string, page = 1, pageSize = 50) {
  const [logs, total] = await prisma.$transaction([
    prisma.organizationActivityLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.organizationActivityLog.count({ where: { organizationId: orgId } }),
  ]);

  return { logs, total, page, pageSize };
}
