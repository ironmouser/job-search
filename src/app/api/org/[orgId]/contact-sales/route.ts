import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { sendEnterpriseInquiryEmail } from "@/lib/mailer";

type RouteParams = { params: Promise<{ orgId: string }> };

/**
 * POST /api/org/[orgId]/contact-sales
 * Submits an enterprise seat pass inquiry (5,000+ seats) and emails support@jobagenthq.com
 */
export async function POST(req: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const { user, error } = await requireOrgAdmin(orgId);
  if (error) return error;

  try {
    const body = await req.json();
    const { contactName, contactEmail, phone, requestedSeats, notes } = body;

    if (!contactName || !contactEmail || !requestedSeats) {
      return NextResponse.json(
        { error: "Missing required fields: contactName, contactEmail, requestedSeats" },
        { status: 400 }
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // 1. Send Enterprise Inquiry Email to support@jobagenthq.com
    await sendEnterpriseInquiryEmail({
      orgName: org.name,
      orgId: org.id,
      contactName,
      contactEmail,
      phone,
      requestedSeats: parseInt(requestedSeats, 10),
      notes,
    });

    // 2. Log Enterprise Inquiry in OrganizationActivityLog
    await prisma.organizationActivityLog.create({
      data: {
        organizationId: orgId,
        actorId: user.id,
        action: "ENTERPRISE_INQUIRY_SUBMITTED",
        metadata: {
          contactName,
          contactEmail,
          phone,
          requestedSeats: parseInt(requestedSeats, 10),
          notes,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Enterprise inquiry submitted successfully. Our team will contact you within 24 hours.",
    });
  } catch (err: any) {
    console.error("Enterprise sales contact API error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to submit enterprise inquiry" },
      { status: 500 }
    );
  }
}
