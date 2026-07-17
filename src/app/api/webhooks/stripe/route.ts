import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

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

  const session = event.data.object as Stripe.Checkout.Session;

  if (event.type === "checkout.session.completed") {
    if (!session?.metadata?.userId) {
      console.error("Stripe Webhook Error: Missing metadata.userId in session", session.id);
      return new NextResponse("User ID is required", { status: 400 });
    }

    const subscriptionId = session.subscription as string | undefined;

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      await prisma.user.update({
        where: {
          id: session.metadata.userId,
        },
        data: {
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: subscription.customer as string,
          stripePriceId: subscription.items.data[0].price.id,
          stripeCurrentPeriodEnd: new Date(
            ((subscription as any).current_period_end ||
              subscription.items.data[0].current_period_end) *
              1000
          ),
          planTier: "PRO",
        },
      });
    } else {
      // One-time payment fallback
      await prisma.user.update({
        where: {
          id: session.metadata.userId,
        },
        data: {
          stripeCustomerId: session.customer as string,
          planTier: "PRO",
        },
      });
    }
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = (invoice as any).subscription as string | undefined;

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      await prisma.user.update({
        where: {
          stripeSubscriptionId: subscription.id,
        },
        data: {
          stripePriceId: subscription.items.data[0].price.id,
          stripeCurrentPeriodEnd: new Date(
            ((subscription as any).current_period_end ||
              subscription.items.data[0].current_period_end) *
              1000
          ),
        },
      });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;

    await prisma.user.update({
      where: {
        stripeSubscriptionId: subscription.id,
      },
      data: {
        planTier: "FREE",
        stripeSubscriptionId: null,
        stripePriceId: null,
        stripeCurrentPeriodEnd: null,
      },
    });
  }

  return new NextResponse(null, { status: 200 });
}
