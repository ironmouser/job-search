import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { handleUserUpgradeToPro } from "@/lib/settings";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("Stripe-Signature") as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error: any) {
    console.error("Stripe Webhook Error:", error.message);
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });
  }

  // ─── checkout.session.completed ────────────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // ── Organization seat purchase (One-time payment) ──
    if (session?.metadata?.organizationId) {
      const orgId = session.metadata.organizationId;
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
        const item = lineItems.data[0];
        const quantity = item?.quantity ?? 0;
        
        let validityDays = 90; // Default
        if (item?.price?.product) {
          const product = await stripe.products.retrieve(item.price.product as string);
          if (product.metadata?.validity_days) {
            validityDays = parseInt(product.metadata.validity_days, 10);
          }
        }

        await prisma.$transaction([
          prisma.organization.update({
            where: { id: orgId },
            data: {
              stripeCustomerId: session.customer as string,
              seatCount: { increment: quantity },
              seatValidityDays: validityDays,
            },
          }),
          prisma.organizationActivityLog.create({
            data: {
              organizationId: orgId,
              actorId: "system",
              action: "SEAT_PURCHASED",
              metadata: { quantity, validityDays, sessionId: session.id },
            },
          }),
        ]);

        console.log(`Org ${orgId} purchased ${quantity} passes (valid for ${validityDays} days)`);
      } catch (err) {
        console.error("Failed to process org seat purchase:", err);
      }
      return new NextResponse(null, { status: 200 });
    }

    // ── Personal (Premium) subscription ──
    if (!session?.metadata?.userId) {
      console.error("Stripe Webhook Error: Missing metadata.userId in session", session.id);
      return new NextResponse("User ID is required", { status: 400 });
    }

    const subscriptionId = session.subscription as string | undefined;

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      await prisma.user.update({
        where: { id: session.metadata.userId },
        data: {
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: subscription.customer as string,
          stripePriceId: subscription.items.data[0].price.id,
          stripeCurrentPeriodEnd: new Date(
            ((subscription as any).current_period_end ||
              subscription.items.data[0].current_period_end) * 1000
          ),
          planTier: "PRO",
          subscriptionType: "PREMIUM",
        },
      });
      await handleUserUpgradeToPro(session.metadata.userId);
    } else {
      // One-time payment fallback
      await prisma.user.update({
        where: { id: session.metadata.userId },
        data: {
          stripeCustomerId: session.customer as string,
          planTier: "PRO",
          subscriptionType: "PREMIUM",
        },
      });
      await handleUserUpgradeToPro(session.metadata.userId);
    }
  }

  // ─── invoice.payment_succeeded ─────────────────────────────────────────────
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = (invoice as any).subscription as string | undefined;

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      // Personal subscription invoice
      await prisma.user.update({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          stripePriceId: subscription.items.data[0].price.id,
          stripeCurrentPeriodEnd: new Date(
            ((subscription as any).current_period_end ||
              subscription.items.data[0].current_period_end) * 1000
          ),
        },
      });
    }
  }

  // ─── customer.subscription.updated ────────────────────────────────────────
  if (event.type === "customer.subscription.updated") {
    // Only personal subscriptions are updated here. No action strictly required 
    // unless tracking specific tiers dynamically for users.
  }

  // ─── customer.subscription.deleted ────────────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const orgId = (subscription.metadata as any)?.organizationId;

    if (!orgId) {
      // Personal subscription cancelled
      await prisma.user.update({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          planTier: "FREE",
          subscriptionType: "FREE",
          stripeSubscriptionId: null,
          stripePriceId: null,
          stripeCurrentPeriodEnd: null,
        },
      });
    }
  }

  return new NextResponse(null, { status: 200 });
}
