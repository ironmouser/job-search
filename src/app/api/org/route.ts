import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { createOrganization } from "@/lib/organizations";
import { OrganizationType } from "@prisma/client";

/**
 * POST /api/org
 * Creates a new organization. The authenticated user becomes the first ORGANIZATION_ADMIN.
 */
export async function POST(request: Request) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const { name, organizationType } = await request.json();

    if (!name || !organizationType) {
      return NextResponse.json({ error: "name and organizationType are required" }, { status: 400 });
    }

    if (!Object.values(OrganizationType).includes(organizationType)) {
      return NextResponse.json(
        { error: `Invalid organizationType. Must be one of: ${Object.values(OrganizationType).join(", ")}` },
        { status: 400 }
      );
    }

    // Prevent users who already belong to an org from creating another
    if (user.organizationId) {
      return NextResponse.json(
        { error: "You are already a member of an organization" },
        { status: 409 }
      );
    }

    const org = await createOrganization({
      name,
      organizationType,
      createdBy: user.id,
    });

    return NextResponse.json(org, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/org error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
