import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import Stripe from "stripe";
import { authOptions } from "@/lib/auth";
import { stripe, createOrgCheckoutSession, createRecruiterSubscriptionCheckoutSession } from "@/lib/stripe";
import { PRO_MONTHLY_PRICE_CENTS } from "@/lib/org-pricing";
import { prisma } from "@/lib/prisma";

function getProLineItems(): Stripe.Checkout.SessionCreateParams.LineItem[] {
  return [
    {
      price_data: {
        currency: "usd",
        product_data: {
          name: "Job Agent HQ Pro",
          description: "Unlimited AI match scoring, tailored resumes, cover letters, Q&A, and inbox sync",
        },
        unit_amount: PRO_MONTHLY_PRICE_CENTS,
        recurring: {
          interval: "month",
        },
      },
      quantity: 1,
    },
  ];
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { priceId, organizationId, recruiterOrgId, planTier, returnUrl, quantity, durationMonths } = await request.json();

    // ── Recruiter Organization subscription ──────────────────────────────────
    if (recruiterOrgId) {
      const sessionUser = session.user as any;
      const userRole = sessionUser.role as string;

      // Verify recruiter profile belongs to this org
      const recruiterProfile = await prisma.recruiterProfile.findUnique({
        where: { userId: sessionUser.id },
      });

      const isAuthorized =
        userRole === 'SYSTEM_ADMIN' ||
        (recruiterProfile &&
          recruiterProfile.organizationId === recruiterOrgId &&
          (recruiterProfile.role === 'OWNER' || recruiterProfile.role === 'ADMIN'));

      if (!isAuthorized) {
        return NextResponse.json(
          { error: 'Only organization Owners and Admins can manage subscriptions' },
          { status: 403 }
        );
      }

      const recruiterOrg = await prisma.recruiterOrganization.findUnique({
        where: { id: recruiterOrgId },
      });

      if (!recruiterOrg) {
        return NextResponse.json({ error: 'Recruiter organization not found' }, { status: 404 });
      }

      const checkoutSession = await createRecruiterSubscriptionCheckoutSession({
        recruiterOrgId,
        orgName: recruiterOrg.name,
        billingEmail: recruiterProfile?.businessEmail || session.user.email,
        stripeCustomerId: recruiterOrg.stripeCustomerId,
        planTier: (planTier || 'STARTER').toUpperCase() as any,
        priceId: priceId?.startsWith('price_') ? priceId : undefined,
        successUrl: returnUrl
          ? `${process.env.NEXTAUTH_URL}${returnUrl}${returnUrl.includes('?') ? '&' : '?'}checkout=success`
          : `${process.env.NEXTAUTH_URL}/recruiter/billing?checkout=success`,
        cancelUrl: returnUrl
          ? `${process.env.NEXTAUTH_URL}${returnUrl}${returnUrl.includes('?') ? '&' : '?'}checkout=canceled`
          : `${process.env.NEXTAUTH_URL}/recruiter/billing?canceled=true`,
      });

      if (!recruiterOrg.stripeCustomerId && checkoutSession.customer) {
        await prisma.recruiterOrganization.update({
          where: { id: recruiterOrgId },
          data: { stripeCustomerId: checkoutSession.customer as string },
        });
      }

      return NextResponse.json({ url: checkoutSession.url });
    }

    // ── Organization seat purchase ────────────────────────────────────────────
    if (organizationId) {
      const sessionUser = session.user as any;
      const role = sessionUser.role as string;

      // Only org admins of this specific org (or system admins) can purchase seats
      if (role !== "SYSTEM_ADMIN" && role !== "ORGANIZATION_ADMIN") {
        return new NextResponse("Forbidden", { status: 403 });
      }
      if (role === "ORGANIZATION_ADMIN" && sessionUser.organizationId !== organizationId) {
        return new NextResponse("Forbidden", { status: 403 });
      }

      const org = await prisma.organization.findUnique({ where: { id: organizationId } });
      if (!org) return new NextResponse("Organization not found", { status: 404 });

      const validQty = Math.max(1, Math.min(4999, Number(quantity) || 10));
      const parsedMonths = Number(durationMonths) || 1;
      const validMonths = [1, 3, 6, 12].includes(parsedMonths) ? parsedMonths : 1;

      const checkoutSession = await createOrgCheckoutSession({
        organizationId,
        orgName: org.name,
        stripeCustomerId: org.stripeCustomerId,
        quantity: validQty,
        durationMonths: validMonths,
        successUrl: `${process.env.NEXTAUTH_URL}/org-admin?success=true`,
        cancelUrl: `${process.env.NEXTAUTH_URL}/org-admin?canceled=true`,
      });

      // If a new Stripe customer was created, save it on the org
      if (!org.stripeCustomerId && checkoutSession.customer) {
        await prisma.organization.update({
          where: { id: organizationId },
          data: { stripeCustomerId: checkoutSession.customer as string },
        });
      }

      return NextResponse.json({ url: checkoutSession.url });
    }

    // ── Personal (Premium) subscription ──────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return new NextResponse("User not found", { status: 404 });
    }

    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.name || undefined,
        metadata: { userId: user.id },
      });

      stripeCustomerId = customer.id;

      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId },
      });
    }

    const stripeSession = await stripe.checkout.sessions.create({
      success_url: `${process.env.NEXTAUTH_URL}/settings?success=true`,
      cancel_url: `${process.env.NEXTAUTH_URL}/pricing?canceled=true`,
      payment_method_types: ["card"],
      mode: "subscription",
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      customer_email: stripeCustomerId ? undefined : session.user.email,
      customer: stripeCustomerId || undefined,
      line_items: getProLineItems(),
      metadata: { userId: user.id },
    });

    await prisma.upgradeEvent.create({
      data: {
        userId: user.id,
        status: "ATTEMPTED",
        priceId: "pro_999_monthly",
        stripeSessionId: stripeSession.id,
        stripeCustomerId: stripeCustomerId || undefined,
        planTier: "PRO",
      },
    }).catch((e) => console.warn("Could not record upgrade attempt:", e));

    return NextResponse.json({ url: stripeSession.url });
  } catch (error) {
    console.error("STRIPE_CHECKOUT_ERROR", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function GET(request: Request) {
  let currentUserId: string | null = null;
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.redirect(new URL("/checkout", request.url));
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.redirect(new URL("/checkout", request.url));
    }
    currentUserId = user.id;

    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.name || undefined,
        metadata: { userId: user.id },
      });

      stripeCustomerId = customer.id;

      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId },
      });
    }

    const stripeSession = await stripe.checkout.sessions.create({
      success_url: `${process.env.NEXTAUTH_URL}/settings?success=true`,
      cancel_url: `${process.env.NEXTAUTH_URL}/upgrade?canceled=true`,
      payment_method_types: ["card"],
      mode: "subscription",
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      customer_email: stripeCustomerId ? undefined : session.user.email,
      customer: stripeCustomerId || undefined,
      line_items: getProLineItems(),
      metadata: { userId: user.id },
    });

    await prisma.upgradeEvent.create({
      data: {
        userId: user.id,
        status: "ATTEMPTED",
        priceId: "pro_999_monthly",
        stripeSessionId: stripeSession.id,
        stripeCustomerId: stripeCustomerId || undefined,
        planTier: "PRO",
      },
    }).catch((e) => console.warn("Could not record upgrade attempt:", e));

    if (stripeSession.url) {
      return NextResponse.redirect(stripeSession.url, 303);
    } else {
      return NextResponse.redirect(new URL("/upgrade", request.url), 303);
    }
  } catch (error) {
    console.error("STRIPE_CHECKOUT_GET_ERROR", error);
    if (currentUserId) {
      await prisma.upgradeEvent.create({
        data: {
          userId: currentUserId,
          status: "FAILED",
          failureReason: error instanceof Error ? error.message : "Checkout redirect failed",
          planTier: "PRO",
        },
      }).catch(() => {});
    }
    return NextResponse.redirect(new URL("/upgrade?error=checkout_failed", request.url));
  }
}

