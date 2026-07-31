import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-helpers";
import { getActivityLog } from "@/lib/organizations";

type RouteParams = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/activity
 * Returns paginated activity log entries for the organization.
 * Query params: page (default 1), pageSize (default 50, max 100)
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const { error } = await requireOrgAdmin(orgId);
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10)));

    const result = await getActivityLog(orgId, page, pageSize);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
