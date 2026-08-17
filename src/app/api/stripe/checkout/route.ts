import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { stripe, createOrgCheckoutSession } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { priceId, organizationId, quantity } = await request.json();

    if (!priceId) {
      return new NextResponse("Price ID is required", { status: 400 });
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

      // Validate price metadata quantity requirements if configured in Stripe
      if (priceId && quantity) {
        try {
          const stripePrice = await stripe.prices.retrieve(priceId);
          const minQty = stripePrice.metadata?.min_quantity ? parseInt(stripePrice.metadata.min_quantity, 10) : null;
          const maxQty = stripePrice.metadata?.max_quantity ? parseInt(stripePrice.metadata.max_quantity, 10) : null;

          if (minQty !== null && quantity < minQty) {
            return NextResponse.json(
              { error: `This tier requires a minimum purchase of ${minQty} seats.` },
              { status: 400 }
            );
          }
          if (maxQty !== null && quantity > maxQty) {
            return NextResponse.json(
              { error: `This tier supports up to ${maxQty} seats. For higher quantities, please select a higher tier.` },
              { status: 400 }
            );
          }
        } catch (e) {
          console.warn("Could not retrieve price metadata from Stripe:", e);
        }
      }

      const checkoutSession = await createOrgCheckoutSession({
        organizationId,
        orgName: org.name,
        stripeCustomerId: org.stripeCustomerId,
        priceId,
        quantity: quantity ?? 10,
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
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId: user.id },
    });

    await prisma.upgradeEvent.create({
      data: {
        userId: user.id,
        status: "ATTEMPTED",
        priceId,
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

    const priceId = process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || "price_dummy";

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
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId: user.id },
    });

    await prisma.upgradeEvent.create({
      data: {
        userId: user.id,
        status: "ATTEMPTED",
        priceId,
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

